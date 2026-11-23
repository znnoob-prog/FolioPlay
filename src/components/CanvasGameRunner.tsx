import { useEffect, useRef } from 'react';
import type { GameBlueprint, GameShellPhase, HudSnapshot } from '../types/game';
import { soundEngine } from '../lib/soundEngine';

interface CanvasGameRunnerProps {
  blueprint: GameBlueprint;
  phase: GameShellPhase;
  runKey: number;
  onHudUpdate: (snapshot: HudSnapshot) => void;
  onEnd: (victory: boolean, finalHud: HudSnapshot) => void;
}

interface Vec2 {
  x: number;
  y: number;
}

interface EnemyEntity {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  radius: number;
  color: string;
  shape: 'triangle' | 'square' | 'star' | 'spiked';
  behavior: 'CHASER' | 'DASHER' | 'ORBITER' | 'SPLITTER' | 'SNIPER';
  name: string;
  telegraphSec: number;
  stateTimer: number;
  telegraphing: boolean;
  dashDirX: number;
  dashDirY: number;
  hitFlash: number;
  squash: number;
  lane: number;
}

interface Projectile {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  fromPlayer: boolean;
  color: string;
  life: number;
}

interface CollectibleEntity {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  points: number;
  secondaryGain: number;
  color: string;
  shape: 'orb' | 'shard' | 'scroll' | 'prism';
  name: string;
  age: number;
  maxAge: number;
  pulse: number;
}

interface TurretEntity {
  lane: number;
  x: number;
  y: number;
  fireCooldown: number;
  hp: number;
}

interface Particle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  life: number;
  maxLife: number;
}

interface FloatingRing {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  color: string;
  life: number;
  maxLife: number;
}

interface LightningBolt {
  points: Vec2[];
  color: string;
  life: number;
}

const ARENA_W = 1120;
const ARENA_H = 660;
const LANE_COUNT = 4;

export function CanvasGameRunner({
  blueprint,
  phase,
  runKey,
  onHudUpdate,
  onEnd,
}: CanvasGameRunnerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const phaseRef = useRef<GameShellPhase>(phase);
  phaseRef.current = phase;

  const onHudRef = useRef(onHudUpdate);
  onHudRef.current = onHudUpdate;

  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const archetype =
      blueprint.archetype === 'TACTICAL_DUEL' ? 'ARENA_SURVIVOR' : blueprint.archetype;

    // Input state: separate held keys from edge-triggered actions
    const heldKeys = new Set<string>();
    const justPressed = new Set<string>();
    const pointer = { x: ARENA_W * 0.65, y: ARENA_H * 0.5, down: false, clicked: false };

    // Pre-allocated object pools
    const particles: Particle[] = Array.from({ length: 180 }, () => ({
      active: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      radius: 3,
      color: '#fff',
      life: 0,
      maxLife: 1,
    }));

    const projectiles: Projectile[] = Array.from({ length: 120 }, () => ({
      active: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      radius: 5,
      damage: 15,
      fromPlayer: true,
      color: blueprint.theme.accentHex,
      life: 0,
    }));

    let nextId = 1;
    const enemies: EnemyEntity[] = [];
    const collectibles: CollectibleEntity[] = [];
    const turrets: TurretEntity[] = [];
    const rings: FloatingRing[] = [];
    const bolts: LightningBolt[] = [];

    const player = {
      x: archetype === 'LANE_DEFENSE' ? 110 : ARENA_W * 0.5,
      y: ARENA_H * 0.5,
      vx: 0,
      vy: 0,
      radius: 17,
      hp: blueprint.player.maxHp,
      maxHp: blueprint.player.maxHp,
      speed: blueprint.player.speed,
      fireCooldown: 0,
      dashCooldown: 0,
      invulnTimer: 0,
      hitFlash: 0,
      squash: 1,
      aegisTimer: 0,
      symbiosisTimer: 0,
      aimAngle: 0,
    };

    const sim = {
      score: 0,
      secondary: Math.min(40, blueprint.specialAbility.costSecondary),
      elapsed: 0,
      combo: 1,
      comboTimer: 0,
      wave: 1,
      spawnTimer: 0.9,
      collectibleTimer: 0.4,
      specialCooldown: 0,
      timeDilationTimer: 0,
      mutatorTimers: blueprint.mutators.map((m) => m.intervalSec || 10),
      activeMutatorBanner: null as string | null,
      mutatorBannerTimer: 0,
      gravityDirX: 0,
      gravityDirY: 0,
      hitstop: 0,
      shake: 0,
      mechanicsTriggered: 0,
      conceptsCollected: 0,
      ended: false,
      hudSyncAccum: 0,
    };

    const spawnParticles = (x: number, y: number, color: string, count: number, speedScale = 1) => {
      let spawned = 0;
      for (let i = 0; i < particles.length && spawned < count; i++) {
        const p = particles[i];
        if (!p.active) {
          const angle = Math.random() * Math.PI * 2;
          const spd = (55 + Math.random() * 170) * speedScale;
          p.active = true;
          p.x = x;
          p.y = y;
          p.vx = Math.cos(angle) * spd;
          p.vy = Math.sin(angle) * spd;
          p.radius = 2 + Math.random() * 3.5;
          p.color = color;
          p.maxLife = 0.25 + Math.random() * 0.35;
          p.life = p.maxLife;
          spawned++;
        }
      }
    };

    const spawnProjectile = (
      x: number,
      y: number,
      vx: number,
      vy: number,
      damage: number,
      fromPlayer: boolean,
      color: string,
      radius = 5
    ) => {
      for (let i = 0; i < projectiles.length; i++) {
        const pr = projectiles[i];
        if (!pr.active) {
          pr.active = true;
          pr.x = x;
          pr.y = y;
          pr.vx = vx;
          pr.vy = vy;
          pr.damage = damage;
          pr.fromPlayer = fromPlayer;
          pr.color = color;
          pr.radius = radius;
          pr.life = 2.6;
          return;
        }
      }
    };

    const spawnCollectible = (customX?: number, customY?: number) => {
      const list = blueprint.collectibles;
      const def = list[Math.floor(Math.random() * list.length)] || {
        name: 'Insight',
        points: 25,
        secondaryGain: 12,
        color: blueprint.theme.secondaryHex,
        shape: 'orb' as const,
      };
      const margin = 72;
      const x =
        customX ??
        (archetype === 'LANE_DEFENSE'
          ? 240 + Math.random() * (ARENA_W - 340)
          : margin + Math.random() * (ARENA_W - margin * 2));
      const y =
        customY ??
        (archetype === 'LANE_DEFENSE'
          ? getLaneCenter(Math.floor(Math.random() * LANE_COUNT))
          : margin + Math.random() * (ARENA_H - margin * 2));

      collectibles.push({
        id: nextId++,
        x,
        y,
        vx: 0,
        vy: 0,
        points: def.points,
        secondaryGain: def.secondaryGain,
        color: def.color,
        shape: def.shape,
        name: def.name,
        age: 0,
        maxAge: 14,
        pulse: Math.random() * Math.PI * 2,
      });
    };

    const getLaneCenter = (lane: number) => {
      const topPad = 95;
      const usableH = ARENA_H - 160;
      return topPad + (lane + 0.5) * (usableH / LANE_COUNT);
    };

    const spawnEnemy = () => {
      const defs = blueprint.enemies;
      const def = defs[Math.floor(Math.random() * defs.length)] || {
        name: 'Anomaly',
        behavior: 'CHASER' as const,
        hp: 35,
        speed: 110,
        damage: 14,
        telegraphSec: 0.7,
        color: blueprint.theme.dangerHex,
        shape: 'triangle' as const,
      };

      const diffScale = 1 + sim.elapsed * 0.012;
      let x = 0;
      let y = 0;
      const lane = Math.floor(Math.random() * LANE_COUNT);

      if (archetype === 'LANE_DEFENSE') {
        x = ARENA_W + 24;
        y = getLaneCenter(lane);
      } else {
        const edge = Math.floor(Math.random() * 4);
        if (edge === 0) {
          x = Math.random() * ARENA_W;
          y = -24;
        } else if (edge === 1) {
          x = ARENA_W + 24;
          y = Math.random() * ARENA_H;
        } else if (edge === 2) {
          x = Math.random() * ARENA_W;
          y = ARENA_H + 24;
        } else {
          x = -24;
          y = Math.random() * ARENA_H;
        }
      }

      enemies.push({
        id: nextId++,
        x,
        y,
        vx: 0,
        vy: 0,
        hp: Math.round(def.hp * (0.85 + diffScale * 0.2)),
        maxHp: Math.round(def.hp * (0.85 + diffScale * 0.2)),
        speed: def.speed * Math.min(1.55, 0.92 + diffScale * 0.1),
        damage: def.damage,
        radius: def.behavior === 'SPLITTER' ? 20 : 15,
        color: def.color,
        shape: def.shape,
        behavior: def.behavior,
        name: def.name,
        telegraphSec: def.telegraphSec,
        stateTimer: 1.1 + Math.random() * 1.2,
        telegraphing: false,
        dashDirX: 0,
        dashDirY: 0,
        hitFlash: 0,
        squash: 1,
        lane,
      });
    };

    // Seed initial items
    for (let i = 0; i < 4; i++) {
      spawnCollectible();
    }

    const buildHudSnapshot = (): HudSnapshot => ({
      hp: Math.max(0, Math.round(player.hp)),
      maxHp: player.maxHp,
      score: Math.round(sim.score),
      targetScore: blueprint.winCondition.targetScore,
      secondaryResource: Math.round(sim.secondary),
      elapsedSec: Math.floor(sim.elapsed),
      surviveSeconds: blueprint.winCondition.surviveSeconds,
      combo: sim.combo,
      wave: sim.wave,
      specialCooldownRemaining: Math.max(0, Number(sim.specialCooldown.toFixed(1))),
      specialReady:
        sim.specialCooldown <= 0 &&
        sim.secondary >= blueprint.specialAbility.costSecondary,
      activeMutatorBanner: sim.activeMutatorBanner,
      mechanicsTriggeredCount: sim.mechanicsTriggered,
      conceptsCollected: sim.conceptsCollected,
    });

    onHudRef.current(buildHudSnapshot());

    const triggerSpecialAbility = () => {
      const spec = blueprint.specialAbility;
      if (sim.specialCooldown > 0 || sim.secondary < spec.costSecondary) return;

      sim.secondary -= spec.costSecondary;
      sim.specialCooldown = spec.cooldownSec;
      sim.mechanicsTriggered += 1;
      soundEngine.playSpecial();

      if (spec.effect === 'SHOCKWAVE_PURGE') {
        const rad = Math.max(180, spec.radiusOrPower);
        sim.hitstop = 0.06;
        sim.shake = 12;
        rings.push({
          x: player.x,
          y: player.y,
          radius: 16,
          maxRadius: rad,
          color: blueprint.theme.accentHex,
          life: 0.42,
          maxLife: 0.42,
        });
        for (const pr of projectiles) {
          if (pr.active && !pr.fromPlayer) {
            if (Math.hypot(pr.x - player.x, pr.y - player.y) < rad) {
              pr.active = false;
            }
          }
        }
        for (const en of enemies) {
          const dx = en.x - player.x;
          const dy = en.y - player.y;
          const dist = Math.hypot(dx, dy) || 1;
          if (dist < rad) {
            en.hp -= 55;
            en.hitFlash = 0.14;
            en.x += (dx / dist) * 65;
            en.y += (dy / dist) * 65;
            spawnParticles(en.x, en.y, en.color, 8, 1.2);
          }
        }
      } else if (spec.effect === 'TIME_DILATION') {
        sim.timeDilationTimer = 4.5;
        rings.push({
          x: player.x,
          y: player.y,
          radius: 20,
          maxRadius: 420,
          color: blueprint.theme.secondaryHex,
          life: 0.5,
          maxLife: 0.5,
        });
      } else if (spec.effect === 'MAGNET_SURGE') {
        for (const col of collectibles) {
          const dx = player.x - col.x;
          const dy = player.y - col.y;
          const d = Math.hypot(dx, dy) || 1;
          col.vx = (dx / d) * 680;
          col.vy = (dy / d) * 680;
        }
        rings.push({
          x: player.x,
          y: player.y,
          radius: 280,
          maxRadius: 12,
          color: blueprint.theme.secondaryHex,
          life: 0.35,
          maxLife: 0.35,
        });
      } else if (spec.effect === 'AEGIS_BARRIER') {
        player.hp = Math.min(player.maxHp, player.hp + 25);
        player.aegisTimer = 5.0;
        spawnParticles(player.x, player.y, blueprint.theme.accentHex, 18, 0.9);
      } else if (spec.effect === 'CHAIN_OVERLOAD') {
        sim.hitstop = 0.05;
        sim.shake = 9;
        const targets = [...enemies]
          .sort(
            (a, b) =>
              Math.hypot(a.x - player.x, a.y - player.y) -
              Math.hypot(b.x - player.x, b.y - player.y)
          )
          .slice(0, 6);
        let prev: Vec2 = { x: player.x, y: player.y };
        const pts: Vec2[] = [prev];
        for (const t of targets) {
          t.hp -= 50;
          t.hitFlash = 0.16;
          pts.push({ x: t.x, y: t.y });
          spawnParticles(t.x, t.y, blueprint.theme.accentHex, 10, 1.1);
          prev = { x: t.x, y: t.y };
        }
        if (pts.length > 1) {
          bolts.push({ points: pts, color: blueprint.theme.accentHex, life: 0.32 });
        }
      }
    };

    const deployLaneTurret = (laneIdx: number) => {
      const cost = 20;
      if (sim.secondary < cost) return;
      const laneY = getLaneCenter(laneIdx);
      const existing = turrets.find((t) => t.lane === laneIdx);
      if (existing) {
        existing.hp = 100;
        sim.secondary -= cost;
        soundEngine.playSpecial();
        spawnParticles(existing.x, existing.y, blueprint.theme.accentHex, 10);
        return;
      }
      sim.secondary -= cost;
      sim.mechanicsTriggered += 1;
      turrets.push({
        lane: laneIdx,
        x: 205,
        y: laneY,
        fireCooldown: 0.2,
        hp: 100,
      });
      soundEngine.playCardPlay();
      spawnParticles(205, laneY, blueprint.theme.accentHex, 12);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (!heldKeys.has(k)) {
        justPressed.add(k);
      }
      heldKeys.add(k);
      if (
        phaseRef.current === 'PLAYING' &&
        ['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)
      ) {
        e.preventDefault();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      heldKeys.delete(e.key.toLowerCase());
    };

    const handleBlur = () => {
      heldKeys.clear();
      pointer.down = false;
    };

    const toCanvasCoords = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: ((clientX - rect.left) / rect.width) * ARENA_W,
        y: ((clientY - rect.top) / rect.height) * ARENA_H,
      };
    };

    const handlePointerMove = (e: PointerEvent) => {
      const pos = toCanvasCoords(e.clientX, e.clientY);
      pointer.x = pos.x;
      pointer.y = pos.y;
    };

    const handlePointerDown = (e: PointerEvent) => {
      const pos = toCanvasCoords(e.clientX, e.clientY);
      pointer.x = pos.x;
      pointer.y = pos.y;
      pointer.down = true;
      pointer.clicked = true;
    };

    const handlePointerUp = () => {
      pointer.down = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointerup', handlePointerUp);

    let rafId = 0;
    let lastTime = performance.now();

    const step = (now: number) => {
      rafId = requestAnimationFrame(step);
      const rawDt = (now - lastTime) / 1000;
      lastTime = now;
      const dt = Math.min(rawDt, 0.05);

      const currentPhase = phaseRef.current;

      if (currentPhase === 'TITLE_MENU') {
        // Ambient background drift for live Title backdrop
        renderScene(ctx, now * 0.001, true);
        return;
      }

      if (currentPhase !== 'PLAYING' || sim.ended) {
        renderScene(ctx, now * 0.001, false);
        return;
      }

      // Hitstop freeze frame for heavy impacts
      if (sim.hitstop > 0) {
        sim.hitstop -= dt;
        sim.shake = Math.max(0, sim.shake - dt * 35);
        renderScene(ctx, now * 0.001, false);
        return;
      }

      sim.elapsed += dt;
      sim.wave = 1 + Math.floor(sim.elapsed / 18);
      sim.specialCooldown = Math.max(0, sim.specialCooldown - dt);
      sim.timeDilationTimer = Math.max(0, sim.timeDilationTimer - dt);
      sim.shake = Math.max(0, sim.shake - dt * 28);
      player.hitFlash = Math.max(0, player.hitFlash - dt);
      player.invulnTimer = Math.max(0, player.invulnTimer - dt);
      player.fireCooldown = Math.max(0, player.fireCooldown - dt);
      player.dashCooldown = Math.max(0, player.dashCooldown - dt);
      player.aegisTimer = Math.max(0, player.aegisTimer - dt);
      player.symbiosisTimer = Math.max(0, player.symbiosisTimer - dt);
      player.squash += (1 - player.squash) * Math.min(1, dt * 14);

      if (sim.comboTimer > 0) {
        sim.comboTimer -= dt;
        if (sim.comboTimer <= 0) sim.combo = 1;
      }

      if (sim.mutatorBannerTimer > 0) {
        sim.mutatorBannerTimer -= dt;
        if (sim.mutatorBannerTimer <= 0) sim.activeMutatorBanner = null;
      }

      // Update Passive Mutators
      blueprint.mutators.forEach((mut, idx) => {
        sim.mutatorTimers[idx] -= dt;
        if (sim.mutatorTimers[idx] <= 0) {
          sim.mutatorTimers[idx] = Math.max(6, mut.intervalSec || 10);
          sim.mechanicsTriggered += 1;
          sim.activeMutatorBanner = `${mut.name} active`;
          sim.mutatorBannerTimer = 3.2;
          soundEngine.playMutator();

          if (mut.type === 'PERIODIC_SURGE') {
            spawnCollectible();
            spawnCollectible();
            rings.push({
              x: ARENA_W / 2,
              y: ARENA_H / 2,
              radius: 40,
              maxRadius: 520,
              color: blueprint.theme.secondaryHex,
              life: 0.55,
              maxLife: 0.55,
            });
          } else if (mut.type === 'GRAVITY_INVERSION') {
            const angle = Math.random() * Math.PI * 2;
            sim.gravityDirX = Math.cos(angle) * 42 * (mut.magnitude || 1.2);
            sim.gravityDirY = Math.sin(angle) * 42 * (mut.magnitude || 1.2);
          }
        }
      });

      // Player Movement
      let moveX = 0;
      let moveY = 0;
      if (heldKeys.has('w') || heldKeys.has('arrowup')) moveY -= 1;
      if (heldKeys.has('s') || heldKeys.has('arrowdown')) moveY += 1;
      if (archetype !== 'LANE_DEFENSE') {
        if (heldKeys.has('a') || heldKeys.has('arrowleft')) moveX -= 1;
        if (heldKeys.has('d') || heldKeys.has('arrowright')) moveX += 1;
      }

      const len = Math.hypot(moveX, moveY);
      if (len > 0) {
        moveX /= len;
        moveY /= len;
      }

      const speedBoost = player.symbiosisTimer > 0 ? 1.32 : 1;
      if (archetype === 'ORBIT_HARVEST') {
        const accel = player.speed * 4.4 * speedBoost;
        player.vx += (moveX * accel + sim.gravityDirX) * dt;
        player.vy += (moveY * accel + sim.gravityDirY) * dt;
        player.vx *= Math.pow(0.18, dt);
        player.vy *= Math.pow(0.18, dt);
        player.x += player.vx * dt;
        player.y += player.vy * dt;
      } else {
        player.x += (moveX * player.speed * speedBoost + sim.gravityDirX * 0.4) * dt;
        player.y += (moveY * player.speed * speedBoost + sim.gravityDirY * 0.4) * dt;
      }

      player.x = Math.max(28, Math.min(ARENA_W - 28, player.x));
      player.y = Math.max(46, Math.min(ARENA_H - 28, player.y));

      // Aim angle toward pointer or nearest enemy
      if (archetype === 'LANE_DEFENSE') {
        player.aimAngle = 0;
      } else {
        player.aimAngle = Math.atan2(pointer.y - player.y, pointer.x - player.x);
      }

      // Edge-triggered actions
      if (justPressed.has('e')) {
        triggerSpecialAbility();
      }

      if (justPressed.has('shift') && player.dashCooldown <= 0 && archetype !== 'LANE_DEFENSE') {
        const dx = moveX !== 0 || moveY !== 0 ? moveX : Math.cos(player.aimAngle);
        const dy = moveX !== 0 || moveY !== 0 ? moveY : Math.sin(player.aimAngle);
        player.x = Math.max(28, Math.min(ARENA_W - 28, player.x + dx * 115));
        player.y = Math.max(46, Math.min(ARENA_H - 28, player.y + dy * 115));
        player.invulnTimer = 0.28;
        player.dashCooldown = 1.4;
        player.squash = 1.35;
        spawnParticles(player.x, player.y, blueprint.theme.accentHex, 10, 0.8);
      }

      if (archetype === 'LANE_DEFENSE') {
        if (justPressed.has('1')) deployLaneTurret(0);
        if (justPressed.has('2')) deployLaneTurret(1);
        if (justPressed.has('3')) deployLaneTurret(2);
        if (justPressed.has('4')) deployLaneTurret(3);
        if (pointer.clicked && pointer.x > 140 && pointer.x < ARENA_W - 80) {
          let bestLane = 0;
          let bestDist = Infinity;
          for (let l = 0; l < LANE_COUNT; l++) {
            const d = Math.abs(pointer.y - getLaneCenter(l));
            if (d < bestDist) {
              bestDist = d;
              bestLane = l;
            }
          }
          if (bestDist < 60) deployLaneTurret(bestLane);
        }
      }

      // Primary Fire (Space or Mouse Hold)
      const firePressed = heldKeys.has(' ') || pointer.down;
      const fireDelay = player.symbiosisTimer > 0 ? 0.15 : 0.22;
      if (firePressed && player.fireCooldown <= 0) {
        let angle = player.aimAngle;
        if (heldKeys.has(' ') && !pointer.down && enemies.length > 0 && archetype !== 'LANE_DEFENSE') {
          let nearest = enemies[0];
          let minDist = Infinity;
          for (const en of enemies) {
            const d = Math.hypot(en.x - player.x, en.y - player.y);
            if (d < minDist) {
              minDist = d;
              nearest = en;
            }
          }
          angle = Math.atan2(nearest.y - player.y, nearest.x - player.x);
          player.aimAngle = angle;
        }
        const spd = 610;
        spawnProjectile(
          player.x + Math.cos(angle) * 20,
          player.y + Math.sin(angle) * 20,
          Math.cos(angle) * spd,
          Math.sin(angle) * spd,
          24,
          true,
          blueprint.theme.accentHex,
          6
        );
        player.fireCooldown = fireDelay;
        player.squash = 0.86;
        soundEngine.playShoot();
      }

      // Update Lane Defense Turrets
      for (const t of turrets) {
        t.fireCooldown -= dt;
        const hasEnemyInLane = enemies.some((e) => e.lane === t.lane && e.x > t.x);
        if (t.fireCooldown <= 0 && hasEnemyInLane) {
          spawnProjectile(t.x + 18, t.y, 560, 0, 20, true, blueprint.theme.secondaryHex, 5);
          t.fireCooldown = 0.72;
        }
      }

      // Spawn collectibles & enemies
      sim.collectibleTimer -= dt;
      if (sim.collectibleTimer <= 0 && collectibles.length < 7) {
        spawnCollectible();
        sim.collectibleTimer = archetype === 'ORBIT_HARVEST' ? 1.5 : 2.3;
      }

      const spawnInterval = Math.max(0.58, 1.85 - sim.elapsed * 0.016);
      sim.spawnTimer -= dt;
      if (sim.spawnTimer <= 0 && enemies.length < 22) {
        spawnEnemy();
        sim.spawnTimer = spawnInterval;
      }

      // Update collectibles (including VOLATILE_DECAY mutator)
      const hasVolatile = blueprint.mutators.some((m) => m.type === 'VOLATILE_DECAY');
      const hasSymbiosis = blueprint.mutators.some((m) => m.type === 'SYMBIOSIS_BUFF');
      const hasComboEsc = blueprint.mutators.some((m) => m.type === 'COMBO_ESCALATION');

      for (let i = collectibles.length - 1; i >= 0; i--) {
        const col = collectibles[i];
        col.age += dt;
        col.pulse += dt * 4;
        col.x += col.vx * dt;
        col.y += col.vy * dt;
        col.vx *= Math.pow(0.25, dt);
        col.vy *= Math.pow(0.25, dt);

        if (hasVolatile && col.age > col.maxAge) {
          collectibles.splice(i, 1);
          continue;
        }

        const dist = Math.hypot(col.x - player.x, col.y - player.y);
        if (dist < player.radius + 18) {
          const volatileBonus = hasVolatile && col.age > col.maxAge * 0.65 ? 2 : 1;
          const comboMult = hasComboEsc ? Math.min(4, 1 + sim.combo * 0.25) : Math.min(2.5, 1 + (sim.combo - 1) * 0.15);
          const gained = Math.round(col.points * volatileBonus * comboMult);
          sim.score += gained;
          sim.secondary = Math.min(120, sim.secondary + col.secondaryGain);
          sim.combo += 1;
          sim.comboTimer = 4.2;
          sim.conceptsCollected += 1;
          if (hasSymbiosis) {
            player.symbiosisTimer = 3.8;
          }
          soundEngine.playCollect(sim.combo);
          spawnParticles(col.x, col.y, col.color, 12, 0.85);
          collectibles.splice(i, 1);
        }
      }

      // Update projectiles
      for (const pr of projectiles) {
        if (!pr.active) continue;
        const speedScale = !pr.fromPlayer && sim.timeDilationTimer > 0 ? 0.25 : 1;
        pr.x += pr.vx * dt * speedScale;
        pr.y += pr.vy * dt * speedScale;
        pr.life -= dt;

        if (pr.life <= 0 || pr.x < -30 || pr.x > ARENA_W + 30 || pr.y < -30 || pr.y > ARENA_H + 30) {
          pr.active = false;
          continue;
        }

        if (pr.fromPlayer) {
          for (const en of enemies) {
            if (Math.hypot(pr.x - en.x, pr.y - en.y) < en.radius + pr.radius) {
              pr.active = false;
              en.hp -= pr.damage;
              en.hitFlash = 0.1;
              en.squash = 1.25;
              soundEngine.playHit(false);
              spawnParticles(pr.x, pr.y, en.color, 6, 0.7);
              break;
            }
          }
        } else {
          if (Math.hypot(pr.x - player.x, pr.y - player.y) < player.radius + pr.radius) {
            pr.active = false;
            if (player.invulnTimer <= 0 && player.aegisTimer <= 0) {
              player.hp -= pr.damage;
              player.invulnTimer = 0.45;
              player.hitFlash = 0.16;
              sim.combo = 1;
              sim.shake = 9;
              sim.hitstop = 0.04;
              soundEngine.playHit(true);
              spawnParticles(player.x, player.y, blueprint.theme.dangerHex, 14, 1.1);
            }
          }
        }
      }

      // Update enemies
      const enemyTimeScale = sim.timeDilationTimer > 0 ? 0.25 : 1;
      const hasChainReaction = blueprint.mutators.some((m) => m.type === 'CHAIN_REACTION');

      for (let i = enemies.length - 1; i >= 0; i--) {
        const en = enemies[i];
        en.hitFlash = Math.max(0, en.hitFlash - dt);
        en.squash += (1 - en.squash) * Math.min(1, dt * 12);

        if (en.hp <= 0) {
          sim.score += 30;
          sim.secondary = Math.min(120, sim.secondary + 6);
          spawnParticles(en.x, en.y, en.color, 14, 1.15);
          soundEngine.playHit(false);

          if (en.behavior === 'SPLITTER' && en.radius > 13) {
            for (let s = -1; s <= 1; s += 2) {
              enemies.push({
                ...en,
                id: nextId++,
                x: en.x + s * 18,
                y: en.y + s * 10,
                hp: 18,
                maxHp: 18,
                radius: 11,
                speed: en.speed * 1.28,
                behavior: 'CHASER',
              });
            }
          }

          if (hasChainReaction) {
            for (const other of enemies) {
              if (other.id !== en.id && Math.hypot(other.x - en.x, other.y - en.y) < 110) {
                other.hp -= 16;
                other.hitFlash = 0.1;
              }
            }
          }

          if (Math.random() < 0.35 && collectibles.length < 7) {
            spawnCollectible(en.x, en.y);
          }

          enemies.splice(i, 1);
          continue;
        }

        const dx = player.x - en.x;
        const dy = player.y - en.y;
        const dist = Math.hypot(dx, dy) || 1;
        const edt = dt * enemyTimeScale;

        if (archetype === 'LANE_DEFENSE') {
          en.x -= en.speed * 0.72 * edt;
          if (en.x < 75) {
            player.hp -= en.damage;
            player.hitFlash = 0.16;
            sim.shake = 10;
            soundEngine.playHit(true);
            enemies.splice(i, 1);
            continue;
          }
          for (let ti = turrets.length - 1; ti >= 0; ti--) {
            const tur = turrets[ti];
            if (tur.lane === en.lane && Math.abs(en.x - tur.x) < 22) {
              tur.hp -= en.damage * edt * 1.8;
              en.x += 12;
              if (tur.hp <= 0) turrets.splice(ti, 1);
            }
          }
        } else if (en.behavior === 'DASHER') {
          en.stateTimer -= edt;
          if (!en.telegraphing && en.stateTimer <= 0) {
            en.telegraphing = true;
            en.stateTimer = en.telegraphSec;
            en.dashDirX = dx / dist;
            en.dashDirY = dy / dist;
          } else if (en.telegraphing) {
            if (en.stateTimer <= 0) {
              en.telegraphing = false;
              en.stateTimer = 2.1;
              en.vx = en.dashDirX * en.speed * 3.1;
              en.vy = en.dashDirY * en.speed * 3.1;
              en.squash = 1.35;
            }
          } else {
            en.x += (en.vx + (dx / dist) * en.speed * 0.55) * edt;
            en.y += (en.vy + (dy / dist) * en.speed * 0.55) * edt;
            en.vx *= Math.pow(0.08, edt);
            en.vy *= Math.pow(0.08, edt);
          }
        } else if (en.behavior === 'SNIPER') {
          const desiredDist = 270;
          if (dist > desiredDist + 30) {
            en.x += (dx / dist) * en.speed * edt;
            en.y += (dy / dist) * en.speed * edt;
          } else if (dist < desiredDist - 40) {
            en.x -= (dx / dist) * en.speed * 0.6 * edt;
            en.y -= (dy / dist) * en.speed * 0.6 * edt;
          }
          en.stateTimer -= edt;
          if (!en.telegraphing && en.stateTimer <= 0) {
            en.telegraphing = true;
            en.stateTimer = en.telegraphSec;
            en.dashDirX = dx / dist;
            en.dashDirY = dy / dist;
          } else if (en.telegraphing && en.stateTimer <= 0) {
            en.telegraphing = false;
            en.stateTimer = 2.4;
            spawnProjectile(
              en.x,
              en.y,
              en.dashDirX * 370,
              en.dashDirY * 370,
              en.damage,
              false,
              en.color,
              6
            );
          }
        } else if (en.behavior === 'ORBITER') {
          const tangentX = -dy / dist;
          const tangentY = dx / dist;
          const radialPull = dist > 160 ? 0.55 : -0.35;
          en.x += ((dx / dist) * radialPull + tangentX * 0.85) * en.speed * edt;
          en.y += ((dy / dist) * radialPull + tangentY * 0.85) * en.speed * edt;
        } else {
          en.x += (dx / dist) * en.speed * edt;
          en.y += (dy / dist) * en.speed * edt;
        }

        // Player collision
        if (Math.hypot(en.x - player.x, en.y - player.y) < en.radius + player.radius) {
          if (player.aegisTimer > 0) {
            en.hp -= 45 * dt * 5;
            en.x -= (dx / dist) * 28;
            en.y -= (dy / dist) * 28;
          } else if (player.invulnTimer <= 0) {
            player.hp -= en.damage;
            player.invulnTimer = 0.55;
            player.hitFlash = 0.18;
            sim.combo = 1;
            sim.hitstop = 0.045;
            sim.shake = 10;
            soundEngine.playHit(true);
            spawnParticles(player.x, player.y, blueprint.theme.dangerHex, 15, 1.15);
          }
        }
      }

      // Update rings, bolts, particles
      for (let i = rings.length - 1; i >= 0; i--) {
        rings[i].life -= dt;
        if (rings[i].life <= 0) rings.splice(i, 1);
      }
      for (let i = bolts.length - 1; i >= 0; i--) {
        bolts[i].life -= dt;
        if (bolts[i].life <= 0) bolts.splice(i, 1);
      }
      for (const p of particles) {
        if (!p.active) continue;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= Math.pow(0.2, dt);
        p.vy *= Math.pow(0.2, dt);
        p.life -= dt;
        if (p.life <= 0) p.active = false;
      }

      justPressed.clear();
      pointer.clicked = false;

      // Check Victory / Game Over
      if (player.hp <= 0) {
        sim.ended = true;
        const snap = buildHudSnapshot();
        onHudRef.current(snap);
        soundEngine.playEnd(false);
        onEndRef.current(false, snap);
      } else if (
        sim.score >= blueprint.winCondition.targetScore ||
        sim.elapsed >= blueprint.winCondition.surviveSeconds
      ) {
        sim.ended = true;
        const snap = buildHudSnapshot();
        onHudRef.current(snap);
        soundEngine.playEnd(true);
        onEndRef.current(true, snap);
      } else {
        sim.hudSyncAccum += dt;
        if (sim.hudSyncAccum >= 0.08) {
          sim.hudSyncAccum = 0;
          onHudRef.current(buildHudSnapshot());
        }
      }

      renderScene(ctx, now * 0.001, false);
    };

    const drawPolygon = (
      c: CanvasRenderingContext2D,
      x: number,
      y: number,
      radius: number,
      sides: number,
      rotation: number,
      fill: string,
      stroke?: string
    ) => {
      c.beginPath();
      for (let i = 0; i < sides; i++) {
        const a = rotation + (i * Math.PI * 2) / sides;
        const px = x + Math.cos(a) * radius;
        const py = y + Math.sin(a) * radius;
        if (i === 0) c.moveTo(px, py);
        else c.lineTo(px, py);
      }
      c.closePath();
      c.fillStyle = fill;
      c.fill();
      if (stroke) {
        c.strokeStyle = stroke;
        c.lineWidth = 2;
        c.stroke();
      }
    };

    const renderScene = (c: CanvasRenderingContext2D, timeSec: number, ambientOnly: boolean) => {
      c.save();
      c.fillStyle = blueprint.theme.bgHex || '#0b101b';
      c.fillRect(0, 0, ARENA_W, ARENA_H);

      if (sim.shake > 0.2) {
        c.translate(
          (Math.random() - 0.5) * sim.shake,
          (Math.random() - 0.5) * sim.shake
        );
      }

      // Surface grid
      c.strokeStyle = 'rgba(255,255,255,0.045)';
      c.lineWidth = 1;
      for (let gx = 40; gx < ARENA_W; gx += 56) {
        c.beginPath();
        c.moveTo(gx, 0);
        c.lineTo(gx, ARENA_H);
        c.stroke();
      }
      for (let gy = 40; gy < ARENA_H; gy += 56) {
        c.beginPath();
        c.moveTo(0, gy);
        c.lineTo(ARENA_W, gy);
        c.stroke();
      }

      if (sim.timeDilationTimer > 0) {
        c.fillStyle = 'rgba(56, 189, 248, 0.08)';
        c.fillRect(0, 0, ARENA_W, ARENA_H);
      }

      if (archetype === 'LANE_DEFENSE') {
        for (let l = 0; l < LANE_COUNT; l++) {
          const ly = getLaneCenter(l);
          c.fillStyle = 'rgba(255,255,255,0.03)';
          c.fillRect(70, ly - 48, ARENA_W - 90, 96);
          c.strokeStyle = 'rgba(255,255,255,0.08)';
          c.strokeRect(70, ly - 48, ARENA_W - 90, 96);
        }
      }

      if (ambientOnly) {
        // Gentle orbital ambient shapes for live title preview
        for (let i = 0; i < 6; i++) {
          const a = timeSec * 0.4 + i * 1.05;
          const cx = ARENA_W * 0.62 + Math.cos(a) * (130 + i * 24);
          const cy = ARENA_H * 0.5 + Math.sin(a * 1.2) * (95 + i * 15);
          drawPolygon(
            c,
            cx,
            cy,
            14,
            i % 2 === 0 ? 6 : 4,
            a,
            'rgba(255,255,255,0.06)',
            blueprint.theme.accentHex
          );
        }
        c.restore();
        return;
      }

      // Turrets
      for (const tur of turrets) {
        drawPolygon(
          c,
          tur.x,
          tur.y,
          16,
          6,
          timeSec * 0.6,
          blueprint.theme.surfaceHex,
          blueprint.theme.secondaryHex
        );
        c.fillStyle = blueprint.theme.secondaryHex;
        c.fillRect(tur.x - 14, tur.y + 22, 28 * (tur.hp / 100), 4);
      }

      // Collectibles
      for (const col of collectibles) {
        const s = 1 + Math.sin(col.pulse) * 0.12;
        const sides = col.shape === 'prism' ? 3 : col.shape === 'shard' ? 4 : 8;
        drawPolygon(
          c,
          col.x,
          col.y,
          11 * s,
          sides,
          timeSec * 1.5,
          col.color,
          '#ffffff'
        );
      }

      // Rings
      for (const r of rings) {
        const progress = 1 - r.life / r.maxLife;
        const rad = r.radius + (r.maxRadius - r.radius) * progress;
        c.beginPath();
        c.arc(r.x, r.y, Math.max(2, rad), 0, Math.PI * 2);
        c.strokeStyle = r.color;
        c.globalAlpha = Math.max(0, r.life / r.maxLife);
        c.lineWidth = 4;
        c.stroke();
        c.globalAlpha = 1;
      }

      // Lightning Bolts
      for (const b of bolts) {
        c.beginPath();
        b.points.forEach((pt, idx) => {
          if (idx === 0) c.moveTo(pt.x, pt.y);
          else c.lineTo(pt.x, pt.y);
        });
        c.strokeStyle = b.color;
        c.lineWidth = 3;
        c.stroke();
      }

      // Projectiles
      for (const pr of projectiles) {
        if (!pr.active) continue;
        c.beginPath();
        c.arc(pr.x, pr.y, pr.radius, 0, Math.PI * 2);
        c.fillStyle = pr.color;
        c.fill();
      }

      // Enemies & Windup Telegraphs
      for (const en of enemies) {
        if (en.telegraphing) {
          c.beginPath();
          c.moveTo(en.x, en.y);
          c.lineTo(en.x + en.dashDirX * 190, en.y + en.dashDirY * 190);
          c.strokeStyle = 'rgba(248, 113, 113, 0.75)';
          c.setLineDash([6, 6]);
          c.lineWidth = 2;
          c.stroke();
          c.setLineDash([]);

          c.beginPath();
          c.arc(en.x, en.y, en.radius + 9, 0, Math.PI * 2);
          c.strokeStyle = '#fbbf24';
          c.lineWidth = 2;
          c.stroke();
        }

        const sides = en.shape === 'triangle' ? 3 : en.shape === 'square' ? 4 : 5;
        drawPolygon(
          c,
          en.x,
          en.y,
          en.radius * en.squash,
          sides,
          timeSec * 2 + en.id,
          en.hitFlash > 0 ? '#ffffff' : en.color,
          'rgba(0,0,0,0.45)'
        );

        if (en.hp < en.maxHp) {
          c.fillStyle = 'rgba(0,0,0,0.6)';
          c.fillRect(en.x - 14, en.y - en.radius - 10, 28, 4);
          c.fillStyle = en.color;
          c.fillRect(en.x - 14, en.y - en.radius - 10, 28 * Math.max(0, en.hp / en.maxHp), 4);
        }
      }

      // Particles
      for (const p of particles) {
        if (!p.active) continue;
        c.globalAlpha = Math.max(0, p.life / p.maxLife);
        c.beginPath();
        c.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        c.fillStyle = p.color;
        c.fill();
      }
      c.globalAlpha = 1;

      // Player
      if (player.aegisTimer > 0) {
        c.beginPath();
        c.arc(player.x, player.y, player.radius + 14, 0, Math.PI * 2);
        c.strokeStyle = blueprint.theme.accentHex;
        c.lineWidth = 3;
        c.stroke();
      }

      const playerSides =
        blueprint.player.shape === 'chevron'
          ? 3
          : blueprint.player.shape === 'hexagon'
          ? 6
          : blueprint.player.shape === 'shield'
          ? 5
          : 4;
      drawPolygon(
        c,
        player.x,
        player.y,
        player.radius * player.squash,
        playerSides,
        player.aimAngle,
        player.hitFlash > 0 ? '#ffffff' : blueprint.theme.accentHex,
        '#f8fafc'
      );

      // Aim reticle indicator
      if (archetype !== 'LANE_DEFENSE') {
        c.beginPath();
        c.arc(pointer.x, pointer.y, 7, 0, Math.PI * 2);
        c.strokeStyle = 'rgba(255,255,255,0.45)';
        c.lineWidth = 1.5;
        c.stroke();
      }

      c.restore();
    };

    rafId = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [blueprint, runKey]);

  return (
    <div className="relative flex h-full w-full items-center justify-center bg-[#0b0e14]">
      <canvas
        ref={canvasRef}
        width={ARENA_W}
        height={ARENA_H}
        className="max-h-full max-w-full cursor-crosshair rounded-lg border border-white/10 shadow-2xl"
      />
    </div>
  );
}
