import { useEffect, useState, useRef } from 'react';
import { Shield, Sword, Sparkles, Zap } from 'lucide-react';
import type { GameBlueprint, GameShellPhase, HudSnapshot, TacticalCardDef } from '../types/game';
import { soundEngine } from '../lib/soundEngine';

interface TacticalDuelRunnerProps {
  blueprint: GameBlueprint;
  phase: GameShellPhase;
  runKey: number;
  onHudUpdate: (snapshot: HudSnapshot) => void;
  onEnd: (victory: boolean, finalHud: HudSnapshot) => void;
}

interface LaneEnemy {
  id: number;
  name: string;
  hp: number;
  maxHp: number;
  attack: number;
  color: string;
  stunned: boolean;
}

export function TacticalDuelRunner({
  blueprint,
  phase,
  runKey,
  onHudUpdate,
  onEnd,
}: TacticalDuelRunnerProps) {
  const deck = blueprint.tacticalCards.length > 0
    ? blueprint.tacticalCards
    : [
        {
          id: 'c1',
          name: 'Focused Strike',
          cost: 1,
          power: 16,
          effectType: 'STRIKE' as const,
          description: 'Deal damage to an enemy in the chosen lane.',
          docQuote: blueprint.coreRule.docSourceSnippet,
        },
        {
          id: 'c2',
          name: 'Bastion Ward',
          cost: 1,
          power: 14,
          effectType: 'WARD' as const,
          description: 'Gain lane armor and restore health.',
          docQuote: blueprint.coreRule.docSourceSnippet,
        },
        {
          id: 'c3',
          name: 'Concept Harvest',
          cost: 1,
          power: 22,
          effectType: 'HARVEST' as const,
          description: 'Gain primary score and charge secondary resource.',
          docQuote: blueprint.coreRule.docSourceSnippet,
        },
      ];

  const drawHand = () =>
    Array.from({ length: 4 }, (_, i) => deck[(Math.floor(Math.random() * deck.length) + i) % deck.length]);

  const spawnLaneThreat = (idSeed: number): LaneEnemy => {
    const def = blueprint.enemies[idSeed % Math.max(1, blueprint.enemies.length)] || {
      name: 'Threat',
      hp: 30,
      damage: 12,
      color: blueprint.theme.dangerHex,
    };
    return {
      id: idSeed,
      name: def.name,
      hp: Math.max(20, Math.round(def.hp * 0.85)),
      maxHp: Math.max(20, Math.round(def.hp * 0.85)),
      attack: Math.max(8, Math.round(def.damage * 0.8)),
      color: def.color,
      stunned: false,
    };
  };

  const [turn, setTurn] = useState(1);
  const [energy, setEnergy] = useState(3);
  const [hp, setHp] = useState(blueprint.player.maxHp);
  const [shield, setShield] = useState(0);
  const [score, setScore] = useState(0);
  const [secondary, setSecondary] = useState(25);
  const [specialCooldown, setSpecialCooldown] = useState(0);
  const [selectedCardIdx, setSelectedCardIdx] = useState<number | null>(null);
  const [hand, setHand] = useState<TacticalCardDef[]>(() => drawHand());
  const [lanes, setLanes] = useState<(LaneEnemy | null)[]>(() => [
    spawnLaneThreat(1),
    spawnLaneThreat(2),
    null,
  ]);
  const [isEnemyTurn, setIsEnemyTurn] = useState(false);
  const [statusLine, setStatusLine] = useState('Select a card, then click a lane to act.');
  const [mechanicsTriggered, setMechanicsTriggered] = useState(0);
  const nextIdRef = useRef(10);

  // Reset on runKey change
  useEffect(() => {
    setTurn(1);
    setEnergy(3);
    setHp(blueprint.player.maxHp);
    setShield(0);
    setScore(0);
    setSecondary(25);
    setSpecialCooldown(0);
    setSelectedCardIdx(null);
    setHand(drawHand());
    setLanes([spawnLaneThreat(1), spawnLaneThreat(2), null]);
    setIsEnemyTurn(false);
    setStatusLine('Select a card, then click a lane to act.');
    setMechanicsTriggered(0);
  }, [runKey, blueprint]);

  const buildSnapshot = (
    curHp = hp,
    curScore = score,
    curSec = secondary,
    curTurn = turn,
    curCd = specialCooldown,
    curMech = mechanicsTriggered
  ): HudSnapshot => ({
    hp: Math.max(0, curHp),
    maxHp: blueprint.player.maxHp,
    score: curScore,
    targetScore: blueprint.winCondition.targetScore,
    secondaryResource: curSec,
    elapsedSec: curTurn * 6,
    surviveSeconds: blueprint.winCondition.surviveSeconds,
    combo: 1,
    wave: curTurn,
    specialCooldownRemaining: curCd,
    specialReady: curCd <= 0 && curSec >= blueprint.specialAbility.costSecondary,
    activeMutatorBanner: blueprint.mutators[0]?.name || null,
    mechanicsTriggeredCount: curMech,
    conceptsCollected: curTurn,
  });

  useEffect(() => {
    onHudUpdate(buildSnapshot());
  }, [hp, score, secondary, turn, specialCooldown, mechanicsTriggered]);

  const playCardOnLane = (laneIdx: number) => {
    if (phase !== 'PLAYING' || isEnemyTurn || selectedCardIdx === null) return;
    const card = hand[selectedCardIdx];
    if (!card || energy < card.cost) {
      setStatusLine('Not enough energy for that card.');
      return;
    }

    soundEngine.playCardPlay();
    setEnergy((e) => e - card.cost);
    setHand((prev) => prev.filter((_, idx) => idx !== selectedCardIdx));
    setSelectedCardIdx(null);

    let nextScore = score;
    let nextSec = secondary;
    let nextHp = hp;
    let nextShield = shield;
    const nextLanes = [...lanes];
    const target = nextLanes[laneIdx];

    if (card.effectType === 'STRIKE') {
      if (target) {
        const remaining = target.hp - card.power;
        if (remaining <= 0) {
          nextLanes[laneIdx] = null;
          nextScore += 65;
          nextSec = Math.min(120, nextSec + 15);
          setStatusLine(`Defeated ${target.name} with ${card.name} (+65).`);
        } else {
          nextLanes[laneIdx] = { ...target, hp: remaining };
          nextScore += 20;
          setStatusLine(`${card.name} dealt ${card.power} to ${target.name}.`);
        }
      } else {
        nextScore += 35;
        setStatusLine(`Direct ${card.name} strike into open lane (+35).`);
      }
    } else if (card.effectType === 'WARD') {
      nextShield += card.power;
      nextHp = Math.min(blueprint.player.maxHp, nextHp + 6);
      setStatusLine(`${card.name} granted +${card.power} Armor and +6 HP.`);
    } else if (card.effectType === 'HARVEST') {
      nextScore += card.power * 2;
      nextSec = Math.min(120, nextSec + 22);
      setStatusLine(`${card.name} harvested +${card.power * 2} ${blueprint.resources.primary.name}.`);
    } else if (card.effectType === 'DISRUPT') {
      if (target) {
        nextLanes[laneIdx] = { ...target, stunned: true, hp: Math.max(1, target.hp - Math.round(card.power * 0.5)) };
        setStatusLine(`${card.name} stunned ${target.name} in Lane ${laneIdx + 1}.`);
      } else {
        nextSec = Math.min(120, nextSec + 12);
        setStatusLine(`${card.name} disrupted lane current (+12 ${blueprint.resources.secondary.name}).`);
      }
    }

    setLanes(nextLanes);
    setScore(nextScore);
    setSecondary(nextSec);
    setHp(nextHp);
    setShield(nextShield);

    if (nextScore >= blueprint.winCondition.targetScore) {
      soundEngine.playEnd(true);
      onEnd(true, buildSnapshot(nextHp, nextScore, nextSec, turn, specialCooldown, mechanicsTriggered));
    }
  };

  const triggerSpecial = () => {
    if (phase !== 'PLAYING' || isEnemyTurn) return;
    if (specialCooldown > 0 || secondary < blueprint.specialAbility.costSecondary) return;
    soundEngine.playSpecial();
    setSecondary((s) => s - blueprint.specialAbility.costSecondary);
    setSpecialCooldown(2);
    setMechanicsTriggered((m) => m + 1);

    let bonus = 0;
    const updated = lanes.map((en) => {
      if (!en) return null;
      const rem = en.hp - 22;
      if (rem <= 0) {
        bonus += 60;
        return null;
      }
      return { ...en, hp: rem, stunned: true };
    });
    setLanes(updated);
    const nextScore = score + bonus + 40;
    setScore(nextScore);
    setStatusLine(`${blueprint.specialAbility.name} surged across all lanes!`);
    if (nextScore >= blueprint.winCondition.targetScore) {
      soundEngine.playEnd(true);
      onEnd(true, buildSnapshot(hp, nextScore, secondary - blueprint.specialAbility.costSecondary, turn, 2, mechanicsTriggered + 1));
    }
  };

  const endTurn = () => {
    if (phase !== 'PLAYING' || isEnemyTurn) return;
    setIsEnemyTurn(true);
    setSelectedCardIdx(null);
    setStatusLine('Opponent resolving lane intents...');

    setTimeout(() => {
      let incomingDmg = 0;
      const nextLanes = lanes.map((en) => {
        if (!en) {
          if (Math.random() < 0.65) {
            nextIdRef.current += 1;
            return spawnLaneThreat(nextIdRef.current);
          }
          return null;
        }
        if (en.stunned) {
          return { ...en, stunned: false };
        }
        incomingDmg += en.attack;
        return en;
      });

      const absorbed = Math.min(shield, incomingDmg);
      const netDmg = Math.max(0, incomingDmg - absorbed);
      const nextHp = hp - netDmg;

      if (netDmg > 0) soundEngine.playHit(true);

      const nextTurn = turn + 1;
      const mutatorActive = nextTurn % 3 === 0;
      if (mutatorActive) {
        soundEngine.playMutator();
        setMechanicsTriggered((m) => m + 1);
      }

      setLanes(nextLanes);
      setShield(0);
      setHp(nextHp);
      setTurn(nextTurn);
      setEnergy(3);
      setSpecialCooldown((c) => Math.max(0, c - 1));
      setHand(drawHand());
      setIsEnemyTurn(false);
      setStatusLine(
        netDmg > 0
          ? `Turn ${nextTurn}: Took ${netDmg} damage (${absorbed} blocked).`
          : `Turn ${nextTurn}: All incoming threats blocked or stunned.`
      );

      if (nextHp <= 0) {
        soundEngine.playEnd(false);
        onEnd(false, buildSnapshot(0, score, secondary, nextTurn, Math.max(0, specialCooldown - 1), mechanicsTriggered));
      }
    }, 620);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (phase !== 'PLAYING') return;
      if (e.key === ' ') {
        e.preventDefault();
        endTurn();
      } else if (e.key.toLowerCase() === 'e') {
        triggerSpecial();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const renderEffectIcon = (effect: TacticalCardDef['effectType']) => {
    if (effect === 'STRIKE') return <Sword className="h-4 w-4" />;
    if (effect === 'WARD') return <Shield className="h-4 w-4" />;
    if (effect === 'HARVEST') return <Sparkles className="h-4 w-4" />;
    return <Zap className="h-4 w-4" />;
  };

  return (
    <div
      className="flex h-full w-full flex-col justify-between px-6 pb-5 pt-20"
      style={{ backgroundColor: blueprint.theme.bgHex || '#0e1116' }}
    >
      {/* Status Banner */}
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between text-xs text-slate-300">
        <span className="font-medium text-slate-200">{statusLine}</span>
        <div className="flex items-center gap-4 font-mono tabular-nums">
          <span>Turn {turn}</span>
          <span>Energy {energy}/3</span>
          <span>Armor {shield}</span>
        </div>
      </div>

      {/* 3-Lane Board */}
      <div className="mx-auto my-3 grid w-full max-w-5xl flex-1 grid-cols-3 gap-4">
        {lanes.map((enemy, idx) => {
          const validTarget = selectedCardIdx !== null && !isEnemyTurn;
          return (
            <button
              key={idx}
              type="button"
              onClick={() => playCardOnLane(idx)}
              disabled={!validTarget}
              className={`flex min-h-[160px] flex-col justify-between rounded-xl border p-5 text-left transition-transform duration-150 ${
                validTarget
                  ? 'cursor-pointer border-amber-400/70 bg-white/[0.06] hover:-translate-y-1'
                  : 'cursor-default border-white/10 bg-white/[0.03]'
              }`}
            >
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Lane {idx + 1}</span>
                {validTarget && <span className="text-amber-300">Click to target</span>}
              </div>

              {enemy ? (
                <div className="my-auto space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-display text-base font-semibold text-white">
                      {enemy.name}
                    </span>
                    <span className="font-mono text-xs text-rose-300 tabular-nums">
                      ATK {enemy.attack}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-black/40">
                    <div
                      className="h-full transition-all duration-200"
                      style={{
                        width: `${Math.max(0, (enemy.hp / enemy.maxHp) * 100)}%`,
                        backgroundColor: enemy.color,
                      }}
                    />
                  </div>
                  <div className="flex items-center justify-between font-mono text-xs text-slate-400 tabular-nums">
                    <span>HP {enemy.hp}/{enemy.maxHp}</span>
                    {enemy.stunned && <span className="text-amber-300">Stunned</span>}
                  </div>
                </div>
              ) : (
                <div className="my-auto text-center text-sm text-slate-500">
                  Open lane
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Player Hand & Actions */}
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-3">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {hand.map((card, idx) => {
            const isSelected = selectedCardIdx === idx;
            const affordable = energy >= card.cost && !isEnemyTurn;
            return (
              <button
                key={`${card.id}-${idx}`}
                type="button"
                disabled={!affordable}
                onClick={() => setSelectedCardIdx(isSelected ? null : idx)}
                className={`flex min-h-[112px] flex-col justify-between rounded-xl border p-3.5 text-left transition-transform duration-150 ${
                  isSelected
                    ? '-translate-y-1.5 border-amber-400 bg-amber-500/15'
                    : affordable
                    ? 'border-white/15 bg-white/[0.04] hover:-translate-y-0.5 hover:border-white/30'
                    : 'cursor-not-allowed border-white/5 bg-white/[0.02] opacity-45'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-white truncate">
                    {renderEffectIcon(card.effectType)}
                    <span className="truncate">{card.name}</span>
                  </span>
                  <span className="font-mono text-xs font-semibold text-amber-300 tabular-nums shrink-0">
                    {card.cost}E
                  </span>
                </div>
                <p className="text-xs leading-snug text-slate-300 line-clamp-2">
                  {card.description}
                </p>
                <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono tabular-nums">
                  <span>{card.effectType}</span>
                  <span>PWR {card.power}</span>
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={triggerSpecial}
            disabled={
              isEnemyTurn ||
              specialCooldown > 0 ||
              secondary < blueprint.specialAbility.costSecondary
            }
            className="rounded-lg border border-white/15 bg-white/[0.06] px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-white/10 disabled:opacity-40 whitespace-nowrap shrink-0"
          >
            {blueprint.specialAbility.name} ({blueprint.specialAbility.costSecondary}{' '}
            {blueprint.resources.secondary.name})
          </button>

          <button
            type="button"
            onClick={endTurn}
            disabled={isEnemyTurn}
            className="rounded-lg px-5 py-2 text-sm font-semibold text-slate-950 transition-opacity hover:opacity-90 disabled:opacity-50 whitespace-nowrap shrink-0"
            style={{ backgroundColor: blueprint.theme.accentHex || '#f59e0b' }}
          >
            {isEnemyTurn ? 'Resolving...' : 'End Turn (Space)'}
          </button>
        </div>
      </div>
    </div>
  );
}
