import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

interface RawDocsParagraphElement {
  textRun?: { content?: string };
}

interface RawDocsStructuralElement {
  paragraph?: {
    elements?: RawDocsParagraphElement[];
  };
  table?: {
    tableRows?: Array<{
      tableCells?: Array<{
        content?: RawDocsStructuralElement[];
      }>;
    }>;
  };
}

export interface RawGoogleDocPayload {
  title?: string;
  body?: {
    content?: RawDocsStructuralElement[];
  };
}

function flattenGoogleDocElements(elements: RawDocsStructuralElement[]): string {
  const parts: string[] = [];
  for (const el of elements) {
    if (el.paragraph?.elements) {
      const line = el.paragraph.elements
        .map((pe) => pe.textRun?.content || '')
        .join('')
        .trim();
      if (line) parts.push(line);
    } else if (el.table?.tableRows) {
      for (const row of el.table.tableRows) {
        const cells: string[] = [];
        for (const cell of row.tableCells || []) {
          const text = flattenGoogleDocElements(cell.content || []);
          if (text) cells.push(text.replace(/\n+/g, ' '));
        }
        if (cells.length > 0) parts.push(cells.join(' | '));
      }
    }
  }
  return parts.join('\n\n');
}

export function normalizeGoogleDocInput(input: {
  title?: unknown;
  content?: unknown;
  rawGoogleDoc?: unknown;
}): { title: string; content: string } {
  let title = typeof input.title === 'string' ? input.title.trim().slice(0, 200) : '';
  let content = typeof input.content === 'string' ? input.content.trim().slice(0, 45000) : '';

  if (!content && input.rawGoogleDoc && typeof input.rawGoogleDoc === 'object') {
    const rawDoc = input.rawGoogleDoc as RawGoogleDocPayload;
    if (!title && typeof rawDoc.title === 'string') {
      title = rawDoc.title.trim().slice(0, 200);
    }
    const elements = rawDoc.body?.content;
    if (Array.isArray(elements)) {
      content = flattenGoogleDocElements(elements).trim().slice(0, 45000);
    }
  }

  return {
    title: title || 'Untitled Document',
    content,
  };
}

export const DOCUMENT_ANALYSIS_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    documentTitle: { type: Type.STRING },
    genreOrDomain: {
      type: Type.STRING,
      description: 'Document category, e.g. Sci-Fi Narrative, Product Spec, Biology Chapter, Fantasy Lore.',
    },
    summary: {
      type: Type.STRING,
      description: 'Concise 2-sentence synthesis of the document core premise or conflict.',
    },
    characters: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          role: {
            type: Type.STRING,
            enum: ['protagonist', 'antagonist', 'ally', 'neutral', 'system_actor'],
          },
          traits: { type: Type.ARRAY, items: { type: Type.STRING } },
          mechanicPotential: {
            type: Type.STRING,
            description: 'How this character or actor translates into player, enemy, or boss behavior.',
          },
        },
        required: ['name', 'role', 'traits', 'mechanicPotential'],
      },
    },
    locations: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          atmosphere: { type: Type.STRING },
          hazardsOrFeatures: { type: Type.ARRAY, items: { type: Type.STRING } },
          arenaSuitability: {
            type: Type.STRING,
            description: 'How this setting shapes arena layout, lanes, or environmental mutators.',
          },
        },
        required: ['name', 'atmosphere', 'hazardsOrFeatures', 'arenaSuitability'],
      },
    },
    objects: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          category: {
            type: Type.STRING,
            enum: ['artifact', 'resource', 'tool', 'hazard'],
          },
          significance: { type: Type.STRING },
          gameplayUse: {
            type: Type.STRING,
            description: 'How this object acts as a collectible, currency, weapon, or card.',
          },
        },
        required: ['name', 'category', 'significance', 'gameplayUse'],
      },
    },
    themes: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          tension: {
            type: Type.STRING,
            description: 'The core push-and-pull tradeoff or conflict represented by this theme.',
          },
          mechanicSeed: {
            type: Type.STRING,
            description: 'A concrete rule or risk-reward loop derived from this theme.',
          },
        },
        required: ['name', 'tension', 'mechanicSeed'],
      },
    },
    plotElements: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          sequence: { type: Type.INTEGER },
          stage: {
            type: Type.STRING,
            enum: ['setup', 'inciting_incident', 'rising_action', 'climax', 'resolution'],
          },
          event: { type: Type.STRING },
          causalTrigger: {
            type: Type.STRING,
            description: 'Cause-and-effect trigger usable as a wave, mutator, or win/loss condition.',
          },
        },
        required: ['sequence', 'stage', 'event', 'causalTrigger'],
      },
    },
    recommendedArchetype: {
      type: Type.STRING,
      enum: ['ARENA_SURVIVOR', 'LANE_DEFENSE', 'ORBIT_HARVEST', 'TACTICAL_DUEL'],
    },
    mechanicSeeds: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          sourceType: { type: Type.STRING, enum: ['entity', 'theme', 'plot'] },
          ruleIdea: { type: Type.STRING },
        },
        required: ['title', 'sourceType', 'ruleIdea'],
      },
    },
  },
  required: [
    'documentTitle',
    'genreOrDomain',
    'summary',
    'characters',
    'locations',
    'objects',
    'themes',
    'plotElements',
    'recommendedArchetype',
    'mechanicSeeds',
  ],
};

export async function analyzeDocumentWithGemini(
  ai: GoogleGenAI,
  title: string,
  content: string
) {
  const systemInstruction = [
    'You are a narrative and systems analyst building a structured intermediate representation of a Google Doc for procedural game generation.',
    'Extract key entities (characters/system actors, locations/environments, objects/artifacts/resources), core themes with push-and-pull tensions, and ordered plot elements (or causal progression stages for non-fiction documents).',
    'For every extracted item, include concrete game-mechanic potential so a game engine can directly turn them into player abilities, enemy AI, arena mutators, collectibles, and tactical cards.',
    'Extract 3-6 characters/actors, 2-4 locations, 3-6 objects, 2-4 themes, 3-5 ordered plotElements, and 3-4 actionable mechanicSeeds.',
  ].join(' ');

  const prompt = [
    `Document Title: ${title}`,
    '',
    'Document Text:',
    content,
  ].join('\n');

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      systemInstruction,
      thinkingConfig: {
        thinkingLevel: ThinkingLevel.HIGH,
      },
      responseMimeType: 'application/json',
      responseSchema: DOCUMENT_ANALYSIS_SCHEMA,
    },
  });

  const rawJson = (response.text ?? '').trim();
  if (!rawJson) {
    throw new Error('Empty response received while analyzing document.');
  }

  return JSON.parse(rawJson);
}
