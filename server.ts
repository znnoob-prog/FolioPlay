import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import {
  analyzeDocumentWithGemini,
  normalizeGoogleDocInput,
} from './server/documentAnalyzer.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not configured. Add it in Settings > Secrets to generate games.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const GAME_BLUEPRINT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    id: { type: Type.STRING, description: 'Short kebab-case slug identifier.' },
    title: { type: Type.STRING, description: 'Punchy 2-4 word game title.' },
    subtitle: {
      type: Type.STRING,
      description: 'One-sentence premise connecting the document to the gameplay.',
    },
    archetype: {
      type: Type.STRING,
      enum: ['ARENA_SURVIVOR', 'LANE_DEFENSE', 'ORBIT_HARVEST', 'TACTICAL_DUEL'],
      description:
        'Select the core 2D gameplay engine best suited to the document themes and tension.',
    },
    theme: {
      type: Type.OBJECT,
      properties: {
        bgHex: { type: Type.STRING, description: 'Deep dark background hex (e.g. #0b101b).' },
        surfaceHex: { type: Type.STRING, description: 'Playfield surface hex (e.g. #151e2e).' },
        accentHex: { type: Type.STRING, description: 'Vibrant accent hex for player & UI.' },
        dangerHex: { type: Type.STRING, description: 'High-contrast threat/enemy hex.' },
        secondaryHex: { type: Type.STRING, description: 'Secondary resource/mutator hex.' },
        mood: { type: Type.STRING, description: '2-3 word aesthetic atmosphere description.' },
      },
      required: ['bgHex', 'surfaceHex', 'accentHex', 'dangerHex', 'secondaryHex', 'mood'],
    },
    coreRule: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING, description: 'Name of the custom central game mechanic.' },
        summary: {
          type: Type.STRING,
          description: 'Clear 1-2 sentence explanation of how the custom mechanic plays.',
        },
        docSourceSnippet: {
          type: Type.STRING,
          description: 'Direct concept or short paraphrase from the document inspiring this rule.',
        },
      },
      required: ['name', 'summary', 'docSourceSnippet'],
    },
    winCondition: {
      type: Type.OBJECT,
      properties: {
        label: { type: Type.STRING, description: 'Short goal text, e.g. Reach 800 Insight or survive 75s.' },
        targetScore: { type: Type.INTEGER, description: 'Target score between 400 and 1500.' },
        surviveSeconds: { type: Type.INTEGER, description: 'Target survival seconds between 45 and 120.' },
      },
      required: ['label', 'targetScore', 'surviveSeconds'],
    },
    resources: {
      type: Type.OBJECT,
      properties: {
        primary: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            color: { type: Type.STRING },
            gainAction: { type: Type.STRING },
            spendOrDrainRule: { type: Type.STRING },
          },
          required: ['name', 'color', 'gainAction', 'spendOrDrainRule'],
        },
        secondary: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            color: { type: Type.STRING },
            gainAction: { type: Type.STRING },
            spendOrDrainRule: { type: Type.STRING },
          },
          required: ['name', 'color', 'gainAction', 'spendOrDrainRule'],
        },
      },
      required: ['primary', 'secondary'],
    },
    player: {
      type: Type.OBJECT,
      properties: {
        roleName: { type: Type.STRING },
        speed: { type: Type.INTEGER, description: 'Movement speed 190-320.' },
        maxHp: { type: Type.INTEGER, description: 'Max health 80-150.' },
        primaryActionName: { type: Type.STRING },
        shape: { type: Type.STRING, enum: ['diamond', 'hexagon', 'chevron', 'shield'] },
      },
      required: ['roleName', 'speed', 'maxHp', 'primaryActionName', 'shape'],
    },
    specialAbility: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING },
        description: { type: Type.STRING },
        effect: {
          type: Type.STRING,
          enum: [
            'SHOCKWAVE_PURGE',
            'TIME_DILATION',
            'MAGNET_SURGE',
            'AEGIS_BARRIER',
            'CHAIN_OVERLOAD',
          ],
        },
        cooldownSec: { type: Type.NUMBER, description: 'Between 5 and 14 seconds.' },
        costSecondary: { type: Type.INTEGER, description: 'Between 15 and 50 resource units.' },
        radiusOrPower: { type: Type.NUMBER, description: 'Effect radius (140-320) or power multiplier (1.5-3.5).' },
      },
      required: ['name', 'description', 'effect', 'cooldownSec', 'costSecondary', 'radiusOrPower'],
    },
    mutators: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          type: {
            type: Type.STRING,
            enum: [
              'PERIODIC_SURGE',
              'SYMBIOSIS_BUFF',
              'VOLATILE_DECAY',
              'COMBO_ESCALATION',
              'GRAVITY_INVERSION',
              'CHAIN_REACTION',
            ],
          },
          intervalSec: { type: Type.NUMBER, description: 'Cycle interval in seconds (6-20).' },
          magnitude: { type: Type.NUMBER, description: 'Strength modifier 1.15-2.0.' },
          description: { type: Type.STRING },
          docConnection: { type: Type.STRING },
        },
        required: ['name', 'type', 'intervalSec', 'magnitude', 'description', 'docConnection'],
      },
    },
    collectibles: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          points: { type: Type.INTEGER, description: '15-60 points.' },
          secondaryGain: { type: Type.INTEGER, description: '8-25 resource units.' },
          color: { type: Type.STRING },
          shape: { type: Type.STRING, enum: ['orb', 'shard', 'scroll', 'prism'] },
          docReference: { type: Type.STRING },
        },
        required: ['name', 'points', 'secondaryGain', 'color', 'shape', 'docReference'],
      },
    },
    enemies: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          behavior: {
            type: Type.STRING,
            enum: ['CHASER', 'DASHER', 'ORBITER', 'SPLITTER', 'SNIPER'],
          },
          hp: { type: Type.INTEGER, description: '20-90 HP.' },
          speed: { type: Type.INTEGER, description: '75-185 speed.' },
          damage: { type: Type.INTEGER, description: '10-28 damage.' },
          telegraphSec: { type: Type.NUMBER, description: 'Windup telegraph 0.4-1.2s.' },
          color: { type: Type.STRING },
          shape: { type: Type.STRING, enum: ['triangle', 'square', 'star', 'spiked'] },
          docConcept: { type: Type.STRING },
        },
        required: ['name', 'behavior', 'hp', 'speed', 'damage', 'telegraphSec', 'color', 'shape', 'docConcept'],
      },
    },
    tacticalCards: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          name: { type: Type.STRING },
          cost: { type: Type.INTEGER, description: '1-4 energy cost.' },
          power: { type: Type.INTEGER, description: '8-32 effect power.' },
          effectType: {
            type: Type.STRING,
            enum: ['STRIKE', 'WARD', 'HARVEST', 'DISRUPT'],
          },
          description: { type: Type.STRING },
          docQuote: { type: Type.STRING },
        },
        required: ['id', 'name', 'cost', 'power', 'effectType', 'description', 'docQuote'],
      },
    },
    glossary: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          gameElement: { type: Type.STRING },
          docTerm: { type: Type.STRING },
          explanation: { type: Type.STRING },
        },
        required: ['gameElement', 'docTerm', 'explanation'],
      },
    },
    designReasoning: {
      type: Type.STRING,
      description: 'Concise systems-design summary explaining why these mechanics fit the document.',
    },
  },
  required: [
    'id',
    'title',
    'subtitle',
    'archetype',
    'theme',
    'coreRule',
    'winCondition',
    'resources',
    'player',
    'specialAbility',
    'mutators',
    'collectibles',
    'enemies',
    'tacticalCards',
    'glossary',
    'designReasoning',
  ],
};

function sanitizeText(input: unknown, maxLen: number): string {
  if (typeof input !== 'string') return '';
  return input.trim().slice(0, maxLen);
}

function formatGeminiError(err: unknown): { status: number; message: string } {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.includes('PERMISSION_DENIED') || raw.includes('API_KEY_INVALID')) {
    return {
      status: 403,
      message:
        'Gemini API key error. Please check your GEMINI_API_KEY in Settings > Secrets.',
    };
  }
  if (raw.includes('RESOURCE_EXHAUSTED') || raw.includes('429')) {
    return {
      status: 429,
      message:
        'Gemini API quota reached. Wait a moment and try again, or upgrade your API key in Settings > Secrets.',
    };
  }
  return { status: 500, message: raw || 'Unexpected error calling Gemini API.' };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.post('/api/analyze-doc', async (req: Request, res: Response) => {
    try {
      const { title, content } = normalizeGoogleDocInput({
        title: req.body?.title,
        content: req.body?.content,
        rawGoogleDoc: req.body?.rawGoogleDoc,
      });

      if (!content || content.length < 30) {
        res.status(400).json({
          error:
            'Please provide a Google Doc or text document with at least 30 characters to analyze.',
        });
        return;
      }

      const ai = getGeminiClient();
      const analysis = await analyzeDocumentWithGemini(ai, title, content);
      res.json({ analysis });
    } catch (err) {
      const formatted = formatGeminiError(err);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  app.post('/api/forge-game', async (req: Request, res: Response) => {
    try {
      const title = sanitizeText(req.body?.title, 200) || 'Untitled Document';
      const content = sanitizeText(req.body?.content, 45000);
      const preferredArchetype = sanitizeText(req.body?.preferredArchetype, 40);
      const designDirective = sanitizeText(req.body?.designDirective, 600);
      const analysis = req.body?.analysis && typeof req.body.analysis === 'object'
        ? req.body.analysis
        : null;

      if (!content || content.length < 30) {
        res.status(400).json({
          error: 'Please provide document content with at least 30 characters to forge a game.',
        });
        return;
      }

      const ai = getGeminiClient();

      const archetypeInstruction =
        preferredArchetype && preferredArchetype !== 'AUTO'
          ? `You MUST use the "${preferredArchetype}" archetype.`
          : `Choose the archetype (ARENA_SURVIVOR, LANE_DEFENSE, ORBIT_HARVEST, or TACTICAL_DUEL) whose mechanical loop best embodies the conflicts, systems, and structure of the document.`;

      const directiveLine = designDirective
        ? `User design directive to honor: "${designDirective}".`
        : '';

      const analysisBlock = analysis
        ? `Structured Document Analysis (use these extracted characters, locations, objects, themes, and plot elements directly):\n${JSON.stringify(analysis).slice(0, 14000)}`
        : '';

      const systemInstruction = [
        'You are a lead game systems architect who transforms written documents into cohesive, deeply playable 2D games with bespoke mechanics.',
        'Analyze the document structure, core tensions, cause-and-effect loops, stakeholders/entities, and key concepts.',
        'Invent custom game mechanics—resources, active special abilities, passive world mutators, enemy behaviors, collectibles, and tactical cards—so every rule directly translates an idea from the document into tactile gameplay.',
        'Keep colors high-contrast and legible (bgHex dark slate/indigo/charcoal, surfaceHex slightly lighter, vibrant accentHex and dangerHex).',
        'Include 2-3 mutators, 2-3 collectibles, 3-4 distinct enemies with varied behaviors, 6-8 tacticalCards (covering STRIKE, WARD, HARVEST, DISRUPT), and 4-6 glossary entries mapping game elements back to exact document concepts.',
        archetypeInstruction,
      ].join(' ');

      const prompt = [
        `Document Title: ${title}`,
        directiveLine,
        analysisBlock,
        '',
        'Document Content:',
        content,
      ]
        .filter(Boolean)
        .join('\n');

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          systemInstruction,
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.HIGH,
          },
          responseMimeType: 'application/json',
          responseSchema: GAME_BLUEPRINT_SCHEMA,
        },
      });

      const rawJson = (response.text ?? '').trim();
      if (!rawJson) {
        throw new Error('Empty response received from Gemini while generating game blueprint.');
      }

      const blueprint = JSON.parse(rawJson);
      res.json({ blueprint });
    } catch (err) {
      const formatted = formatGeminiError(err);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  app.post('/api/remix-mechanic', async (req: Request, res: Response) => {
    try {
      const blueprint = req.body?.blueprint;
      const documentTitle = sanitizeText(req.body?.documentTitle, 200);
      const documentExcerpt = sanitizeText(req.body?.documentExcerpt, 18000);
      const remixPrompt = sanitizeText(req.body?.remixPrompt, 800);

      if (!blueprint || !remixPrompt) {
        res.status(400).json({ error: 'Both an existing game blueprint and a remix prompt are required.' });
        return;
      }

      const ai = getGeminiClient();

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: [
          `Original Document Title: ${documentTitle}`,
          `Document Excerpt:\n${documentExcerpt}`,
          '',
          `Current Game Blueprint JSON:\n${JSON.stringify(blueprint)}`,
          '',
          `Requested Mechanic Remix / Mutation:\n${remixPrompt}`,
          '',
          'Update the GameBlueprint JSON to implement this requested mechanic change while keeping all mechanics tightly grounded in the document and balanced for fun play.',
        ].join('\n'),
        config: {
          systemInstruction:
            'You are a lead game systems designer mutating an existing GameBlueprint JSON in response to a designer prompt. Preserve cohesive visual contrast and update mutators, resources, specialAbility, enemies, or tacticalCards as requested.',
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.HIGH,
          },
          responseMimeType: 'application/json',
          responseSchema: GAME_BLUEPRINT_SCHEMA,
        },
      });

      const rawJson = (response.text ?? '').trim();
      if (!rawJson) {
        throw new Error('Empty response received from Gemini while remixing mechanics.');
      }

      res.json({ blueprint: JSON.parse(rawJson) });
    } catch (err) {
      const formatted = formatGeminiError(err);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  app.post('/api/suggest-twists', async (req: Request, res: Response) => {
    try {
      const title = sanitizeText(req.body?.title, 200);
      const content = sanitizeText(req.body?.content, 12000);
      const currentArchetype = sanitizeText(req.body?.currentArchetype, 40);

      if (!content) {
        res.status(400).json({ error: 'Document content is required to suggest twists.' });
        return;
      }

      const ai = getGeminiClient();
      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: [
          `Document Title: ${title}`,
          `Current Archetype: ${currentArchetype}`,
          `Excerpt:\n${content}`,
          '',
          'Propose 3 concise, actionable mechanic remix prompts (each 10-16 words) that introduce clever risk-reward twists or rule shifts inspired by specific details in this document.',
        ].join('\n'),
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              twists: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    label: { type: Type.STRING, description: 'Short 2-4 word button title.' },
                    prompt: { type: Type.STRING, description: '10-16 word actionable remix prompt.' },
                  },
                  required: ['label', 'prompt'],
                },
              },
            },
            required: ['twists'],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{"twists":[]}').trim());
      res.json({ twists: Array.isArray(parsed.twists) ? parsed.twists.slice(0, 3) : [] });
    } catch (err) {
      const formatted = formatGeminiError(err);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req: Request, res: Response) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`FolioPlay server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
