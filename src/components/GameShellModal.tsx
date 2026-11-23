import { useEffect, useState } from 'react';
import { Pause, Play, RotateCcw, Volume2, VolumeX, X } from 'lucide-react';
import type { GameBlueprint, GameShellPhase, HudSnapshot } from '../types/game';
import { CanvasGameRunner } from './CanvasGameRunner';
import { TacticalDuelRunner } from './TacticalDuelRunner';
import { soundEngine } from '../lib/soundEngine';

interface GameShellModalProps {
  blueprint: GameBlueprint;
  onExitStudio: () => void;
}

const BACKDROP_URL = '/src/assets/images/forge_studio_backdrop_1795438759457.jpg';

export function GameShellModal({ blueprint, onExitStudio }: GameShellModalProps) {
  const [phase, setPhase] = useState<GameShellPhase>('TITLE_MENU');
  const [runKey, setRunKey] = useState(1);
  const [muted, setMuted] = useState(false);
  const [hud, setHud] = useState<HudSnapshot>({
    hp: blueprint.player.maxHp,
    maxHp: blueprint.player.maxHp,
    score: 0,
    targetScore: blueprint.winCondition.targetScore,
    secondaryResource: 25,
    elapsedSec: 0,
    surviveSeconds: blueprint.winCondition.surviveSeconds,
    combo: 1,
    wave: 1,
    specialCooldownRemaining: 0,
    specialReady: false,
    activeMutatorBanner: null,
    mechanicsTriggeredCount: 0,
    conceptsCollected: 0,
  });

  const startGame = () => {
    setRunKey((k) => k + 1);
    setPhase('PLAYING');
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    soundEngine.setMuted(next);
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPhase((prev) => {
          if (prev === 'PLAYING') return 'PAUSED';
          if (prev === 'PAUSED') return 'PLAYING';
          return prev;
        });
      } else if (e.key === 'Enter' && phase === 'TITLE_MENU') {
        e.preventDefault();
        startGame();
      } else if (e.key === ' ' && phase === 'TITLE_MENU') {
        e.preventDefault();
        startGame();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [phase]);

  const controlHint =
    blueprint.archetype === 'TACTICAL_DUEL'
      ? 'Click Card · Click Lane · E Special · Space End Turn · Esc Pause'
      : blueprint.archetype === 'LANE_DEFENSE'
      ? 'W/S Move · 1-4 or Click Deploy · Space Shoot · E Special · Esc Pause'
      : 'WASD Move · Mouse/Space Shoot · Shift Dash · E Special · Esc Pause';

  const isCanvasMode = blueprint.archetype !== 'TACTICAL_DUEL';

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0b0e14] text-[#f3efe6]">
      {/* Active Playfield */}
      <div className="relative flex-1 overflow-hidden">
        {isCanvasMode ? (
          <CanvasGameRunner
            blueprint={blueprint}
            phase={phase}
            runKey={runKey}
            onHudUpdate={setHud}
            onEnd={(victory, finalHud) => {
              setHud(finalHud);
              setPhase(victory ? 'VICTORY' : 'GAME_OVER');
            }}
          />
        ) : (
          <TacticalDuelRunner
            blueprint={blueprint}
            phase={phase}
            runKey={runKey}
            onHudUpdate={setHud}
            onEnd={(victory, finalHud) => {
              setHud(finalHud);
              setPhase(victory ? 'VICTORY' : 'GAME_OVER');
            }}
          />
        )}

        {/* World-Matched Perimeter HUD (pointer-events: none, no backdrop-filter over canvas) */}
        {phase === 'PLAYING' && (
          <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between px-6 py-4">
            <div className="flex items-center gap-6 rounded-lg bg-[#0d1118]/90 px-4 py-2.5 border border-white/10">
              <div>
                <div className="text-[11px] text-slate-400">Integrity</div>
                <div className="font-mono text-sm font-semibold tabular-nums text-white">
                  HP {hud.hp}/{hud.maxHp}
                </div>
              </div>
              <div className="h-6 w-px bg-white/10" />
              <div>
                <div className="text-[11px] text-slate-400">{blueprint.resources.primary.name}</div>
                <div
                  className="font-mono text-sm font-semibold tabular-nums"
                  style={{ color: blueprint.theme.accentHex }}
                >
                  {hud.score} / {hud.targetScore}
                </div>
              </div>
              <div className="h-6 w-px bg-white/10" />
              <div>
                <div className="text-[11px] text-slate-400">{blueprint.resources.secondary.name}</div>
                <div
                  className="font-mono text-sm font-semibold tabular-nums"
                  style={{ color: blueprint.theme.secondaryHex }}
                >
                  {hud.secondaryResource}
                </div>
              </div>
              <div className="h-6 w-px bg-white/10" />
              <div>
                <div className="text-[11px] text-slate-400">
                  {blueprint.archetype === 'TACTICAL_DUEL' ? 'Turn' : 'Time'}
                </div>
                <div className="font-mono text-sm font-semibold tabular-nums text-slate-200">
                  {blueprint.archetype === 'TACTICAL_DUEL'
                    ? `${hud.wave}`
                    : `${hud.elapsedSec}s / ${hud.surviveSeconds}s`}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {hud.activeMutatorBanner && (
                <div className="rounded-lg border border-amber-400/30 bg-[#0d1118]/90 px-3 py-2 text-xs font-medium text-amber-200">
                  {hud.activeMutatorBanner}
                </div>
              )}
              <div className="rounded-lg border border-white/10 bg-[#0d1118]/90 px-3 py-2 text-xs font-mono tabular-nums text-slate-300">
                {hud.specialReady
                  ? `${blueprint.specialAbility.name}: READY [E]`
                  : hud.specialCooldownRemaining > 0
                  ? `CD ${hud.specialCooldownRemaining}s`
                  : `Need ${blueprint.specialAbility.costSecondary} ${blueprint.resources.secondary.name}`}
              </div>
              <button
                type="button"
                onClick={toggleMute}
                aria-label={muted ? 'Unmute audio' : 'Mute audio'}
                className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-[#0d1118]/95 text-slate-200 hover:bg-white/10"
              >
                {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={() => setPhase('PAUSED')}
                aria-label="Pause game"
                className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-[#0d1118]/95 text-slate-200 hover:bg-white/10"
              >
                <Pause className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Title Screen Overlay */}
        {phase === 'TITLE_MENU' && (
          <div className="absolute inset-0 flex items-center bg-[#0b0e14]/80">
            <img
              src={BACKDROP_URL}
              alt="Game studio drafting table backdrop"
              referrerPolicy="no-referrer"
              className="absolute inset-0 h-full w-full object-cover opacity-35"
            />
            <div className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-8">
              <div className="max-w-xl space-y-6">
                <div className="flex items-center gap-3">
                  <svg
                    width="38"
                    height="38"
                    viewBox="0 0 38 38"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    aria-hidden="true"
                  >
                    <rect
                      x="2"
                      y="2"
                      width="34"
                      height="34"
                      rx="8"
                      stroke={blueprint.theme.accentHex}
                      strokeWidth="2"
                    />
                    <polygon
                      points="19,8 29,26 9,26"
                      fill={blueprint.theme.accentHex}
                      fillOpacity="0.25"
                      stroke={blueprint.theme.accentHex}
                      strokeWidth="2"
                    />
                  </svg>
                  <span className="text-xs font-medium tracking-wide text-slate-300">
                    {blueprint.archetype.replace('_', ' ')} · {blueprint.theme.mood}
                  </span>
                </div>

                <h1 className="font-display text-4xl font-bold tracking-tight text-white md:text-5xl text-balance">
                  {blueprint.title}
                </h1>

                <p className="text-base leading-relaxed text-slate-300">
                  {blueprint.subtitle}
                </p>

                <div className="rounded-xl border border-white/15 bg-[#12161f]/95 p-4 space-y-1.5">
                  <div className="text-xs font-semibold text-amber-300">
                    Custom Mechanic: {blueprint.coreRule.name}
                  </div>
                  <p className="text-sm leading-relaxed text-slate-200">
                    {blueprint.coreRule.summary}
                  </p>
                </div>

                <div className="flex items-center gap-4 pt-1">
                  <button
                    type="button"
                    onClick={startGame}
                    className="inline-flex items-center gap-2 rounded-lg px-6 py-3 text-sm font-semibold text-slate-950 transition-transform duration-150 hover:scale-[1.02] whitespace-nowrap shrink-0"
                    style={{ backgroundColor: blueprint.theme.accentHex || '#e85d3f' }}
                  >
                    <Play className="h-4 w-4" />
                    Start Game
                  </button>
                  <button
                    type="button"
                    onClick={onExitStudio}
                    className="rounded-lg border border-white/15 bg-white/[0.04] px-5 py-3 text-sm font-medium text-slate-200 hover:bg-white/10 whitespace-nowrap shrink-0"
                  >
                    Back to Studio
                  </button>
                </div>

                <p className="font-mono text-xs text-slate-400">
                  {controlHint}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Pause / Victory / Game Over Modal */}
        {(phase === 'PAUSED' || phase === 'VICTORY' || phase === 'GAME_OVER') && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/75 p-6">
            <div className="w-full max-w-md rounded-2xl border border-white/15 bg-[#12161f] p-7 shadow-2xl space-y-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs font-medium text-slate-400">
                    {blueprint.title}
                  </div>
                  <h2 className="font-display text-2xl font-bold text-white mt-1">
                    {phase === 'PAUSED'
                      ? 'Game Paused'
                      : phase === 'VICTORY'
                      ? 'Objective Complete'
                      : 'Run Ended'}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={onExitStudio}
                  aria-label="Return to studio"
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="grid grid-cols-3 gap-3 rounded-xl border border-white/10 bg-black/25 p-4 font-mono tabular-nums">
                <div>
                  <div className="text-[11px] text-slate-400">{blueprint.resources.primary.name}</div>
                  <div className="text-lg font-semibold text-white">{hud.score}</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-400">Mutators</div>
                  <div className="text-lg font-semibold text-amber-300">
                    {hud.mechanicsTriggeredCount}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-400">Concepts</div>
                  <div className="text-lg font-semibold text-emerald-300">
                    {hud.conceptsCollected}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-1">
                {phase === 'PAUSED' ? (
                  <button
                    type="button"
                    onClick={() => setPhase('PLAYING')}
                    className="flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold text-slate-950 whitespace-nowrap"
                    style={{ backgroundColor: blueprint.theme.accentHex || '#e85d3f' }}
                  >
                    Resume
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={startGame}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-slate-950 whitespace-nowrap"
                    style={{ backgroundColor: blueprint.theme.accentHex || '#e85d3f' }}
                  >
                    <RotateCcw className="h-4 w-4" />
                    Play Again
                  </button>
                )}
                <button
                  type="button"
                  onClick={onExitStudio}
                  className="rounded-lg border border-white/15 bg-white/[0.05] px-4 py-2.5 text-sm font-medium text-slate-200 hover:bg-white/10 whitespace-nowrap"
                >
                  Back to Studio
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
