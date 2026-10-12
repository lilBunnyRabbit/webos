<script lang="ts">
  import kernel, { type SettingsService } from "$lib/core/api";
  import { untrack } from "svelte";
  import { bar_count, draw_bars, draw_radial, draw_wave, read_palette, type Palette, type Surface } from "./draw";
  import { apply_sensitivity, decay, group_bins, log_bands, VisualizerMode, type Band } from "./spectrum";

  interface Props {
    analyser: AnalyserNode | null;
    mode: VisualizerMode;
    sensitivity: number;
    running: boolean;
  }

  const RADIAL_BANDS = 64;
  const FALL_PER_FRAME = 0.025;

  let { analyser, mode, sensitivity, running }: Props = $props();

  const settings = $derived(kernel.service<SettingsService>("settings"));

  let container = $state<HTMLDivElement>();
  let canvas = $state<HTMLCanvasElement>();
  let size = $state({ w: 0, h: 0, dpr: 1 });
  let palette = $state.raw<Palette | null>(null);

  const band_count = $derived(mode === VisualizerMode.RADIAL ? RADIAL_BANDS : bar_count(size.w));
  const bands = $derived<Band[]>(
    analyser ? log_bands({ bin_count: analyser.frequencyBinCount, band_count, sample_rate: analyser.context.sampleRate }) : []
  );

  const frequencies = $derived(new Uint8Array(analyser?.frequencyBinCount ?? 0));
  const samples = $derived(new Uint8Array(analyser?.fftSize ?? 0).fill(128));
  const grouped = $derived(new Float32Array(bands.length));
  const levels = $derived(new Float32Array(bands.length));

  $effect(() => {
    const element = container;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      size = { w: element.clientWidth, h: element.clientHeight, dpr: window.devicePixelRatio || 1 };
    });
    observer.observe(element);
    return () => observer.disconnect();
  });

  // A frame later, so the settings service has already written the new theme's variables.
  $effect(() => {
    Object.values(settings.theme);
    if (!canvas) return;
    const probe = canvas;
    const frame = requestAnimationFrame(() => (palette = read_palette(probe)));
    return () => cancelAnimationFrame(frame);
  });

  function sample() {
    if (!analyser) return;
    if (mode === VisualizerMode.WAVE) {
      analyser.getByteTimeDomainData(samples);
      return;
    }
    analyser.getByteFrequencyData(frequencies);
    group_bins(frequencies, bands, grouped);
    for (let i = 0; i < grouped.length; i++) grouped[i] = apply_sensitivity(grouped[i], sensitivity);
    decay(levels, grouped, FALL_PER_FRAME);
  }

  function draw() {
    const ctx = canvas?.getContext("2d");
    if (!ctx || !palette || !canvas) return;
    const surface: Surface = { ctx, width: canvas.width, height: canvas.height, dpr: size.dpr, palette };
    if (mode === VisualizerMode.WAVE) draw_wave(surface, samples, sensitivity);
    else if (mode === VisualizerMode.RADIAL) draw_radial(surface, levels);
    else draw_bars(surface, levels);
  }

  $effect(() => {
    if (!running || !analyser || !palette) return;
    let frame = requestAnimationFrame(function tick() {
      sample();
      draw();
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  });

  // Resizing a canvas clears it, so a paused picture is redrawn from the last sample.
  $effect(() => {
    void [mode, size, palette, levels, sensitivity];
    if (!running) untrack(draw);
  });
</script>

<div bind:this={container} class="size-full min-h-0 overflow-hidden">
  <canvas
    bind:this={canvas}
    width={Math.max(1, Math.floor(size.w * size.dpr))}
    height={Math.max(1, Math.floor(size.h * size.dpr))}
    class="block size-full"
    aria-hidden="true"
  ></canvas>
</div>
