<script lang="ts">
  import type { LiveContext, LiveLayer, LiveTarget } from "../registry";
  import { centre, type Point } from "../geometry";
  import { read_tokens, watch_theme } from "../theme";
  import { TurretsMode, type TurretsOptions } from "./options";
  import { BARREL_LENGTH, BOLT_LENGTH, PACES, ParticleKind, TurretsSim, type WallHit } from "./sim";
  import { PewSynth } from "./sound";
  import { shield_impacts } from "./impacts";
  import { bite_outline, damage_store, type Bite } from "./damage";
  import kernel, { type FilesService } from "$lib/core/api";
  import { DodgeGame } from "./dodge.svelte";
  import DodgeHud from "./dodge-hud.svelte";

  interface Props {
    context: LiveContext;
    options: TurretsOptions;
    layer: LiveLayer;
  }

  let { context, options, layer }: Props = $props();

  const TOKENS = ["foreground", "primary", "accent", "background_darkest"] as const;
  /** Pews per frame at most; a frantic volley would otherwise stack six oscillators. */
  const MAX_PEWS = 3;

  const draws_turrets = $derived(layer === "background");
  const fires = $derived(layer === "background" ? options.mode === TurretsMode.SHIELD : options.mode !== TurretsMode.SHIELD);
  /** The overlay in shield mode: only the sparks of bolts hitting a shield, drawn above it. */
  const sparks_only = $derived(!draws_turrets && !fires);
  const pace = $derived(PACES[options.pace]);
  /** Only shield hits chip, so Follow mode never damages anything. */
  const damages = $derived(sparks_only && options.damage && options.mode === TurretsMode.SHIELD && !context.preview);

  const dodging = $derived(!draws_turrets && options.mode === TurretsMode.DODGE && !context.preview);

  const sim = new TurretsSim();
  const game = new DodgeGame(() => kernel.service<FilesService>("files"));
  const synth = new PewSynth();

  let canvas = $state<HTMLCanvasElement | null>(null);
  let colours = $state(read_tokens(TOKENS));
  let frame = 0;
  let last = 0;
  let pending: WallHit[] = [];

  $effect(() => watch_theme(() => (colours = read_tokens(TOKENS))));

  $effect(() => {
    if (!options.sound || !fires || context.preview) return;
    return synth.arm();
  });

  $effect(() => () => {
    cancelAnimationFrame(frame);
    frame = 0;
    synth.close();
  });

  $effect(() => {
    if (!dodging) return;
    void game.load();
    return () => game.stop();
  });

  $effect(() => {
    if (dodging && (context.pointer === null || context.paused)) game.pause();
  });

  // A mode or pace change starts clean, so a bolt fired under the old rules doesn't hang in the wrong layer.
  $effect(() => {
    void fires;
    void options.mode;
    void pace;
    sim.reset();
  });

  $effect(() => {
    if (!sparks_only || context.preview) return;
    return shield_impacts.listen((impact) => {
      if (!canvas || context.paused) return;
      sim.burst(local(impact, canvas.getBoundingClientRect()), ParticleKind.SPARK);
      if (damages) pending.push(impact);
      if (!frame) {
        last = 0;
        frame = requestAnimationFrame(tick);
      }
    });
  });

  $effect(() => {
    if (!damages) {
      pending = [];
      return;
    }
    return damage_store.on_repair(() => {
      if (!frame) still();
    });
  });

  // Hits land on the rects as they are now; whatever is no longer on screen is pruned in the same pass.
  function settle_damage(windows: LiveTarget[], widgets: LiveTarget[]) {
    const hits = pending;
    pending = [];
    for (const hit of hits) {
      const window = windows.find((target) => target.id === hit.id);
      const target = window ?? widgets.find((item) => item.id === hit.id);
      if (target) damage_store.chip(hit.id, window !== undefined, { edge: hit.edge, at: hit }, target.rect, context.pointer);
    }
    damage_store.prune(new Set([...windows, ...widgets].map((target) => target.id)));
  }

  function local(point: Point, origin: DOMRect): Point {
    return { x: point.x - origin.x, y: point.y - origin.y };
  }

  function fit(element: HTMLCanvasElement, rect: DOMRect): CanvasRenderingContext2D | null {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(rect.width * ratio);
    const height = Math.round(rect.height * ratio);
    if (element.width !== width || element.height !== height) {
      element.width = width;
      element.height = height;
    }
    const ctx = element.getContext("2d");
    ctx?.setTransform(ratio, 0, 0, ratio, 0, 0);
    return ctx;
  }

  function scene(element: HTMLCanvasElement) {
    const rect = element.getBoundingClientRect();
    const turrets = context.cells.map((cell) => local(centre(cell), rect));
    const unit = Math.max(0.5, Math.min(1, Math.min(context.cells[0]?.width ?? 40, context.cells[0]?.height ?? 40) / 40));
    return { rect, turrets, unit };
  }

  // A chip replaces the target's bite list, so the list itself keys its outline; a resize rebuilds it too.
  const paths = new WeakMap<Bite[], { width: number; height: number; path: Path2D }>();

  function bite_path(bites: Bite[], width: number, height: number): Path2D {
    const cached = paths.get(bites);
    if (cached && cached.width === width && cached.height === height) return cached.path;
    const path = new Path2D();
    const rect = { x: 0, y: 0, width, height };
    for (const bite of bites) {
      const [first, ...rest] = bite_outline(bite, rect);
      path.moveTo(first.x, first.y);
      for (const point of rest) path.lineTo(point.x, point.y);
      path.closePath();
    }
    paths.set(bites, { width, height, path });
    return path;
  }

  /**
   * Back to front, each target's bites clipped to its rect; then every window above it is cleared, so a bite on a window
   * never shows through one in front. Widgets sit behind all windows.
   */
  function draw_damage(ctx: CanvasRenderingContext2D, origin: DOMRect, windows: LiveTarget[], widgets: LiveTarget[]) {
    const stack = [...widgets, ...windows];
    stack.forEach((target, index) => {
      const bites = damage_store.damage.get(target.id)?.bites;
      if (!bites?.length) return;
      const { width, height } = target.rect;
      const path = bite_path(bites, width, height);
      ctx.save();
      ctx.translate(target.rect.x - origin.x, target.rect.y - origin.y);
      ctx.beginPath();
      ctx.rect(0, 0, width, height);
      ctx.clip();
      // Rim first, fill over it: overlapping bites keep only the outer half of the rim, never lines inside a hole.
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = colours.foreground;
      ctx.lineWidth = 2;
      ctx.stroke(path);
      ctx.globalAlpha = 1;
      ctx.fillStyle = colours.background_darkest;
      ctx.fill(path);
      ctx.restore();
      for (const above of windows.slice(Math.max(0, index - widgets.length + 1))) {
        ctx.clearRect(above.rect.x - origin.x, above.rect.y - origin.y, above.rect.width, above.rect.height);
      }
    });
  }

  function draw(ctx: CanvasRenderingContext2D, rect: DOMRect, turrets: Point[], unit: number) {
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.lineCap = "round";

    if (damages && (pending.length > 0 || damage_store.damage.size > 0)) {
      const windows = context.windows;
      const widgets = context.widgets;
      settle_damage(windows, widgets);
      draw_damage(ctx, rect, windows, widgets);
    }

    if (draws_turrets) {
      ctx.fillStyle = colours.foreground;
      ctx.globalAlpha = 0.3;
      ctx.beginPath();
      for (const turret of turrets) {
        ctx.moveTo(turret.x + 2 * unit, turret.y);
        ctx.arc(turret.x, turret.y, 2 * unit, 0, Math.PI * 2);
      }
      ctx.fill();

      ctx.strokeStyle = colours.foreground;
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = 1.5 * unit;
      ctx.beginPath();
      turrets.forEach((turret, index) => {
        const angle = sim.angles[index] ?? -Math.PI / 2;
        ctx.moveTo(turret.x, turret.y);
        ctx.lineTo(turret.x + Math.cos(angle) * BARREL_LENGTH * unit, turret.y + Math.sin(angle) * BARREL_LENGTH * unit);
      });
      ctx.stroke();
    }

    if (sim.bolts.any()) {
      ctx.globalAlpha = 1;
      ctx.strokeStyle = colours.primary;
      ctx.shadowColor = colours.primary;
      ctx.shadowBlur = 8 * unit;
      ctx.lineWidth = 2 * unit;
      ctx.beginPath();
      for (const bolt of sim.bolts.items) {
        if (!bolt.active) continue;
        const speed = Math.hypot(bolt.vx, bolt.vy) || 1;
        ctx.moveTo(bolt.x, bolt.y);
        ctx.lineTo(bolt.x - (bolt.vx / speed) * BOLT_LENGTH * unit, bolt.y - (bolt.vy / speed) * BOLT_LENGTH * unit);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    for (const particle of sim.particles.items) {
      if (!particle.active) continue;
      const left = particle.life / particle.max_life;
      const puff = particle.kind === ParticleKind.PUFF;
      ctx.globalAlpha = left;
      ctx.fillStyle = puff ? colours.accent : colours.primary;
      ctx.shadowColor = colours.primary;
      ctx.shadowBlur = puff ? 0 : 6 * unit;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, (puff ? 2.5 : 2) * unit * (0.4 + 0.6 * left), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }

  /** The pointer moves windows too, so while there is damage the overlay follows them frame by frame. */
  function wants_pointer_frames(): boolean {
    if (!context.pointer) return false;
    return !sparks_only || (damages && damage_store.damage.size > 0);
  }

  function tick(now: number) {
    frame = 0;
    if (!canvas) return;
    const dt = last ? (now - last) / 1000 : 0;
    last = now;

    const { rect, turrets, unit } = scene(canvas);
    const pointer = context.pointer && !sparks_only ? local(context.pointer, rect) : null;
    const walls =
      fires && options.mode === TurretsMode.SHIELD
        ? [...context.windows, ...context.widgets].map(({ id, rect: shield }) => ({ id, x: shield.x - rect.x, y: shield.y - rect.y, width: shield.width, height: shield.height }))
        : null;
    const events = sim.update(dt, { turrets: sparks_only ? [] : turrets, pointer, fire: fires, pace, walls, width: rect.width, height: rect.height });
    if (dodging) game.step({ dt_ms: dt * 1000, running: context.pointer !== null && !context.paused, hits: events.hits });
    for (const impact of events.impacts) shield_impacts.emit({ ...impact, x: impact.x + rect.x, y: impact.y + rect.y });

    if (options.sound) {
      for (let shot = 0; shot < Math.min(events.shots, MAX_PEWS); shot++) synth.pew(pace.pitch, options.volume);
      if (events.hits > 0) synth.pop(options.volume);
    }

    const ctx = fit(canvas, rect);
    if (ctx) draw(ctx, rect, turrets, unit);

    if (!context.paused && (wants_pointer_frames() || sim.busy)) frame = requestAnimationFrame(tick);
    else last = 0;
  }

  /** One frame without stepping: after a resize, a theme change or a pause. */
  function still() {
    if (!canvas) return;
    const { rect, turrets, unit } = scene(canvas);
    if (context.preview) {
      sim.reset();
      const target = { x: rect.width * 0.68, y: rect.height * 0.42 };
      sim.aim_all(turrets, target);
      if (fires) {
        const nearest = turrets
          .map((turret, index) => ({ index, distance: Math.hypot(turret.x - target.x, turret.y - target.y) }))
          .sort((a, b) => a.distance - b.distance)
          .slice(4, 7);
        nearest.forEach(({ index, distance }, order) => sim.fire(turrets[index], target, 1, distance * (0.3 + order * 0.15)));
      }
    } else {
      sim.sync(turrets.length);
    }
    const ctx = fit(canvas, rect);
    if (ctx) draw(ctx, rect, turrets, unit);
  }

  $effect(() => {
    if (!canvas) return;
    const element = canvas;
    const observer = new ResizeObserver(() => {
      if (!frame) still();
    });
    observer.observe(element);
    return () => observer.disconnect();
  });

  $effect(() => {
    void colours;
    void context.cells;
    void draws_turrets;
    void damages;
    if (!frame) still();
  });

  $effect(() => {
    if (!canvas) return;
    // Bolts frozen mid-air would hang over a maximized window, so a pause clears them.
    if (context.paused) {
      if (context.preview) return;
      cancelAnimationFrame(frame);
      frame = 0;
      last = 0;
      sim.reset();
      still();
      return;
    }
    if ((wants_pointer_frames() || sim.busy) && !frame) {
      last = 0;
      frame = requestAnimationFrame(tick);
    }
  });
</script>

<canvas bind:this={canvas} class="absolute inset-0 size-full"></canvas>
{#if dodging && !context.paused}
  <DodgeHud {game} />
{/if}
