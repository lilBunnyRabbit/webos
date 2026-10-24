<script lang="ts">
  import kernel, { type SettingsService } from "$lib/core/api";
  import LogoMark from "$lib/core/components/brand/logo-mark.svelte";
  import type { IconComponent } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import { cn } from "$lib/core/utils";
  import { motion_reduced } from "$lib/core/utils/motion";
  import { untrack } from "svelte";
  import { fade } from "svelte/transition";
  import { local_box } from "./local-box";
  import type { Shape } from "./shapes";
  import { ParticleStage } from "./stage.svelte";

  interface Props {
    shape: Shape;
    ready: boolean;
    /** The figure forms out of a swarm once it's ready, with no static mark in its place before. */
    swarm?: boolean;
    /** A canvas the host lays over a larger area (a whole pane), so the swarm can fly beyond the figure's own box. */
    surface?: { stage: HTMLElement | null; canvas: HTMLCanvasElement | null } | null;
    /** Reduced motion has no swarm: a lit principle shows its icon in the slot instead. */
    icon?: IconComponent | null;
    class?: string;
  }

  let { shape, ready, swarm = false, surface = null, icon = null, class: class_name }: Props = $props();

  const { window: handle } = get_app_context();
  const settings = $derived(kernel.service<SettingsService>("settings"));
  // Reduced motion gets the crisp mark itself: no WebGL context, no shader compile, no frozen dot field.
  const solid = motion_reduced();

  const particles = new ParticleStage();
  let stage: HTMLElement | null = $state(null);
  let canvas: HTMLCanvasElement | null = $state(null);
  let figure: HTMLElement | null = $state(null);

  $effect(() => {
    const host = surface ?? { stage, canvas };
    const nodes = !solid && ready && host.stage && host.canvas && figure ? { stage: host.stage, canvas: host.canvas, figure } : null;
    if (!nodes) return;
    return untrack(() => {
      const release = particles.mount(nodes, swarm);
      particles.show(first);
      return release;
    });
  });

  // The figure keeps its first shape until that has formed: a new one asked for mid-flight would retarget the swarm
  // before the logo was ever whole.
  const first = untrack(() => shape);
  let formed = $state(false);
  $effect(() => {
    if (particles.painted && particles.gathered) formed = true;
  });

  $effect(() => {
    particles.show(formed ? shape : first);
  });

  $effect(() => particles.set_visible(handle.is_visible));

  $effect(() => {
    surface?.canvas?.classList.toggle("lit", particles.painted);
  });

  // The host's canvas knows where the figure rests (--fx, --fy, --fw, --fh), so its mask can keep the dots that pass
  // behind text faint while the logo itself stays at full strength.
  $effect(() => {
    const host = surface?.canvas;
    const box = figure;
    if (!host || !box) return;
    const place = () => {
      const inner = local_box(host, box);
      if (inner) {
        host.style.setProperty("--fx", `${inner.x + inner.width / 2}px`);
        host.style.setProperty("--fy", `${inner.y + inner.height / 2}px`);
        host.style.setProperty("--fw", `${inner.width}px`);
        host.style.setProperty("--fh", `${inner.height}px`);
      }
      // A host that hides the figure on a short window has to hide the swarm with it: the canvas lives outside it.
      host.classList.toggle("away", box.offsetWidth < 1 || !box.checkVisibility({ visibilityProperty: true }));
    };
    const sizes = new ResizeObserver(place);
    sizes.observe(host);
    sizes.observe(box);
    return () => sizes.disconnect();
  });

  $effect(() => {
    void JSON.stringify(settings.theme);
    if (solid) return;
    const frame = requestAnimationFrame(() => particles.refresh_palette());
    return () => cancelAnimationFrame(frame);
  });
</script>

<div
  bind:this={stage}
  class={cn("band relative", class_name)}
  onpointermove={(event) => particles.pointer(event, true)}
  onpointerdown={(event) => particles.pointer(event, true)}
  onpointerleave={(event) => particles.pointer(event, false)}
  onpointercancel={(event) => particles.pointer(event, false)}
  role="presentation"
>
  {#if !solid && !surface}
    <canvas bind:this={canvas} class={cn("particles pointer-events-none absolute inset-0 size-full", particles.painted && "lit")} aria-hidden="true"></canvas>
  {/if}
  <div bind:this={figure} class="rest pointer-events-none" aria-hidden="true">
    {#if solid && icon}
      {@const Icon = icon}
      <span class="mark grid place-items-center text-primary"><Icon class="size-[78%]" weight="duotone" /></span>
    {:else if solid || !particles.available}
      <span class="mark"><LogoMark class="size-full text-primary" /></span>
    {:else if !swarm && !particles.painted}
      <span class="mark" out:fade={{ duration: 420 }}><LogoMark class="size-full text-primary" /></span>
    {/if}
  </div>
</div>

<style>
  .band {
    container-type: size;
  }

  /* Logo proportions: the box never changes shape, so a re-tile only scales the mark and never re-samples it. */
  .rest {
    position: absolute;
    inset: 0;
    margin: auto;
    width: min(92cqw, 92cqh * 8 / 7);
    height: auto;
    aspect-ratio: 8 / 7;
  }

  /* The swarm samples the logo with 8% padding on each side of this box (shapes.ts, `contain`):
     the static mark keeps the same inset, so the hand-over from mark to particles never changes size. */
  .mark {
    display: block;
    width: 100%;
    height: 100%;
    scale: 0.84;
  }

  .particles {
    opacity: 0;
    transition: opacity 420ms var(--ease-out);
  }

  .particles.lit {
    opacity: 1;
  }
</style>
