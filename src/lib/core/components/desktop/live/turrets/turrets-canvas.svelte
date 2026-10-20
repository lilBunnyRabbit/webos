<script lang="ts">
  import type { LiveContext, LiveLayer } from "../registry";
  import { centre, type Point } from "../geometry";
  import { read_tokens, watch_theme } from "../theme";
  import { TurretsMode, type TurretsOptions } from "./options";
  import { BARREL_LENGTH, BOLT_LENGTH, PACES, ParticleKind, TurretsSim } from "./sim";
  import { PewSynth } from "./sound";

  interface Props {
    context: LiveContext;
    options: TurretsOptions;
    layer: LiveLayer;
  }

  let { context, options, layer }: Props = $props();

  const TOKENS = ["foreground", "primary", "accent"] as const;
  /** Pews per frame at most; a frantic volley would otherwise stack six oscillators. */
  const MAX_PEWS = 3;

  const draws_turrets = $derived(layer === "background");
  const fires = $derived(options.mode === (layer === "background" ? TurretsMode.SHIELD : TurretsMode.FOLLOW));
  const pace = $derived(PACES[options.pace]);

  const sim = new TurretsSim();
  const synth = new PewSynth();

  let canvas = $state<HTMLCanvasElement | null>(null);
  let colours = $state(read_tokens(TOKENS));
  let frame = 0;
  let last = 0;

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

  // A mode or pace change starts clean, so a bolt fired under the old rules doesn't hang in the wrong layer.
  $effect(() => {
    void fires;
    void pace;
    sim.reset();
  });

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

  function draw(ctx: CanvasRenderingContext2D, rect: DOMRect, turrets: Point[], unit: number) {
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.lineCap = "round";

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

  function tick(now: number) {
    frame = 0;
    if (!canvas) return;
    const dt = last ? (now - last) / 1000 : 0;
    last = now;

    const { rect, turrets, unit } = scene(canvas);
    const pointer = context.pointer ? local(context.pointer, rect) : null;
    const walls =
      fires && options.mode === TurretsMode.SHIELD
        ? [...context.windows, ...context.widgets].map((shield) => ({ x: shield.x - rect.x, y: shield.y - rect.y, width: shield.width, height: shield.height }))
        : null;
    const events = sim.update(dt, { turrets, pointer, fire: fires, pace, walls, width: rect.width, height: rect.height });

    if (options.sound) {
      for (let shot = 0; shot < Math.min(events.shots, MAX_PEWS); shot++) synth.pew(pace.pitch, options.volume);
      if (events.hits > 0) synth.pop(options.volume);
    }

    const ctx = fit(canvas, rect);
    if (ctx) draw(ctx, rect, turrets, unit);

    if (!context.paused && (context.pointer || sim.busy)) frame = requestAnimationFrame(tick);
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
    if ((context.pointer || sim.busy) && !frame) {
      last = 0;
      frame = requestAnimationFrame(tick);
    }
  });
</script>

{#if draws_turrets || fires}
  <canvas bind:this={canvas} class="absolute inset-0 size-full"></canvas>
{/if}
