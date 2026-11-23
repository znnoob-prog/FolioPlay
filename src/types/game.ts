export type GameArchetype =
  | 'ARENA_SURVIVOR'
  | 'LANE_DEFENSE'
  | 'ORBIT_HARVEST'
  | 'TACTICAL_DUEL';

export type SpecialAbilityEffect =
  | 'SHOCKWAVE_PURGE'
  | 'TIME_DILATION'
  | 'MAGNET_SURGE'
  | 'AEGIS_BARRIER'
  | 'CHAIN_OVERLOAD';

export type PassiveMutatorType =
  | 'PERIODIC_SURGE'
  | 'SYMBIOSIS_BUFF'
  | 'VOLATILE_DECAY'
  | 'COMBO_ESCALATION'
  | 'GRAVITY_INVERSION'
  | 'CHAIN_REACTION';

export type EnemyBehavior =
  | 'CHASER'
  | 'DASHER'
  | 'ORBITER'
  | 'SPLITTER'
  | 'SNIPER';

export interface GoogleDocSummary {
  id: string;
  name: string;
  modifiedTime?: string;
  webViewLink?: string;
}

export interface DocumentSection {
  heading: string;
  excerpt: string;
}

export interface LoadedDocument {
  id: string;
  title: string;
  content: string;
  source: 'google-docs' | 'uploaded-file';
  wordCount: number;
  sections: DocumentSection[];
  modifiedTime?: string;
}

export interface ExtractedCharacter {
  name: string;
  role: 'protagonist' | 'antagonist' | 'ally' | 'neutral' | 'system_actor';
  traits: string[];
  mechanicPotential: string;
}

export interface ExtractedLocation {
  name: string;
  atmosphere: string;
  hazardsOrFeatures: string[];
  arenaSuitability: string;
}

export interface ExtractedObject {
  name: string;
  category: 'artifact' | 'resource' | 'tool' | 'hazard';
  significance: string;
  gameplayUse: string;
}

export interface ExtractedTheme {
  name: string;
  tension: string;
  mechanicSeed: string;
}

export interface ExtractedPlotElement {
  sequence: number;
  stage: 'setup' | 'inciting_incident' | 'rising_action' | 'climax' | 'resolution';
  event: string;
  causalTrigger: string;
}

export interface MechanicSeed {
  title: string;
  sourceType: 'entity' | 'theme' | 'plot';
  ruleIdea: string;
}

export interface DocumentAnalysis {
  documentTitle: string;
  genreOrDomain: string;
  summary: string;
  characters: ExtractedCharacter[];
  locations: ExtractedLocation[];
  objects: ExtractedObject[];
  themes: ExtractedTheme[];
  plotElements: ExtractedPlotElement[];
  recommendedArchetype: GameArchetype;
  mechanicSeeds: MechanicSeed[];
}

export interface GameResourceDef {
  name: string;
  color: string;
  gainAction: string;
  spendOrDrainRule: string;
}

export interface MutatorDef {
  name: string;
  type: PassiveMutatorType;
  intervalSec: number;
  magnitude: number;
  description: string;
  docConnection: string;
}

export interface CollectibleDef {
  name: string;
  points: number;
  secondaryGain: number;
  color: string;
  shape: 'orb' | 'shard' | 'scroll' | 'prism';
  docReference: string;
}

export interface EnemyDef {
  name: string;
  behavior: EnemyBehavior;
  hp: number;
  speed: number;
  damage: number;
  telegraphSec: number;
  color: string;
  shape: 'triangle' | 'square' | 'star' | 'spiked';
  docConcept: string;
}

export interface TacticalCardDef {
  id: string;
  name: string;
  cost: number;
  power: number;
  effectType: 'STRIKE' | 'WARD' | 'HARVEST' | 'DISRUPT';
  description: string;
  docQuote: string;
}

export interface GlossaryEntry {
  gameElement: string;
  docTerm: string;
  explanation: string;
}

export interface GameBlueprint {
  id: string;
  title: string;
  subtitle: string;
  archetype: GameArchetype;
  theme: {
    bgHex: string;
    surfaceHex: string;
    accentHex: string;
    dangerHex: string;
    secondaryHex: string;
    mood: string;
  };
  coreRule: {
    name: string;
    summary: string;
    docSourceSnippet: string;
  };
  winCondition: {
    label: string;
    targetScore: number;
    surviveSeconds: number;
  };
  resources: {
    primary: GameResourceDef;
    secondary: GameResourceDef;
  };
  player: {
    roleName: string;
    speed: number;
    maxHp: number;
    primaryActionName: string;
    shape: 'diamond' | 'hexagon' | 'chevron' | 'shield';
  };
  specialAbility: {
    name: string;
    description: string;
    effect: SpecialAbilityEffect;
    cooldownSec: number;
    costSecondary: number;
    radiusOrPower: number;
  };
  mutators: MutatorDef[];
  collectibles: CollectibleDef[];
  enemies: EnemyDef[];
  tacticalCards: TacticalCardDef[];
  glossary: GlossaryEntry[];
  designReasoning: string;
}

export type GameShellPhase =
  | 'TITLE_MENU'
  | 'PLAYING'
  | 'PAUSED'
  | 'VICTORY'
  | 'GAME_OVER';

export interface HudSnapshot {
  hp: number;
  maxHp: number;
  score: number;
  targetScore: number;
  secondaryResource: number;
  elapsedSec: number;
  surviveSeconds: number;
  combo: number;
  wave: number;
  specialCooldownRemaining: number;
  specialReady: boolean;
  activeMutatorBanner: string | null;
  mechanicsTriggeredCount: number;
  conceptsCollected: number;
}
