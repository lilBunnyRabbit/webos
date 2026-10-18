<script lang="ts">
  import { Button, Input, Segmented, Select, StatusBar, Switch, Toolbar } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import { format_bytes, parse_bytes } from "$lib/core/utils";
  import { paint } from "$kit/utils/image";
  import { FloppyDisk as FloppyDiskIcon, WarningCircle as WarningCircleIcon } from "phosphor-svelte";
  import type { Snippet } from "svelte";
  import { z } from "zod";
  import {
    DEFAULT_OUTPUT,
    DEFAULT_SPEC,
    Gradient,
    MAX_SIDE,
    Pattern,
    TestFormat,
    plan_output,
    test_image_name,
    test_image_schema,
    test_output_schema,
    type TestImageSpec,
  } from "./test-image";
  import { generate_test_image, pictures_folder } from "./test-image-job";
  import { render_canvas } from "./test-image-render";

  const { picker }: { picker: Snippet } = $props();
  const { app_id, window: win, storage } = get_app_context();

  const SizeBy = { DIMENSIONS: "dimensions", BYTES: "bytes" } as const;
  type SizeBy = (typeof SizeBy)[keyof typeof SizeBy];

  const settings = storage.persisted(
    "test-image",
    { spec: DEFAULT_SPEC, format: DEFAULT_OUTPUT.format, quality: DEFAULT_OUTPUT.quality, by: SizeBy.DIMENSIONS as SizeBy, target: "500MB" },
    z.object({
      spec: test_image_schema,
      format: test_output_schema.shape.format,
      quality: test_output_schema.shape.quality,
      by: z.enum([SizeBy.DIMENSIONS, SizeBy.BYTES]),
      target: z.string(),
    })
  );

  const PATTERNS = [
    { value: Pattern.RINGS, label: "Pixel rings" },
    { value: Pattern.CHECKER, label: "Checkerboard" },
    { value: Pattern.SPECTRUM, label: "Spectrum" },
    { value: Pattern.GRADIENT, label: "Gradient" },
    { value: Pattern.SOLID, label: "Solid" },
    { value: Pattern.NOISE, label: "Noise" },
  ];
  const GRADIENTS = [
    { value: Gradient.HORIZONTAL, label: "Horizontal" },
    { value: Gradient.VERTICAL, label: "Vertical" },
    { value: Gradient.DIAGONAL, label: "Diagonal" },
    { value: Gradient.RADIAL, label: "Radial" },
  ];
  const FORMATS = [
    { value: TestFormat.PNG, label: "PNG" },
    { value: TestFormat.JPEG, label: "JPEG" },
    { value: TestFormat.WEBP, label: "WebP" },
    { value: TestFormat.SVG, label: "SVG" },
    { value: TestFormat.BMP, label: "BMP" },
  ];
  const PRESETS = [
    { value: "", label: "Preset…" },
    { value: "1920x1080", label: "1080p · 1920 × 1080" },
    { value: "3840x2160", label: "4K · 3840 × 2160" },
    { value: "7680x4320", label: "8K · 7680 × 4320" },
    { value: "1080x1920", label: "Portrait · 1080 × 1920" },
    { value: "1024x1024", label: "Square · 1024" },
    { value: "16384x16384", label: "Canvas limit · 16384" },
    { value: "32x32", label: "Icon · 32" },
  ];

  const spec = $derived(settings.value.spec);
  const target = $derived(settings.value.by === SizeBy.BYTES ? parse_bytes(settings.value.target) : null);
  const output = $derived({ format: settings.value.format, quality: settings.value.quality, target });
  const plan = $derived(
    settings.value.by === SizeBy.BYTES && target === null
      ? ({ ok: false, error: "Give a size like 500MB or 2GB" } as const)
      : plan_output(spec, output)
  );
  const sized = $derived<TestImageSpec>(plan.ok ? { ...spec, width: plan.width, height: plan.height } : spec);
  const preview = $derived(render_canvas(sized, settings.value.format, Math.min(1, 1024 / Math.max(sized.width, sized.height))));

  const uses_cell = $derived(spec.pattern === Pattern.RINGS || spec.pattern === Pattern.CHECKER);
  const uses_colors = $derived(spec.pattern === Pattern.CHECKER || spec.pattern === Pattern.GRADIENT || spec.pattern === Pattern.SOLID);
  const has_quality = $derived(settings.value.format === TestFormat.JPEG || settings.value.format === TestFormat.WEBP);

  function update(patch: Partial<TestImageSpec>) {
    const next = test_image_schema.safeParse({ ...settings.value.spec, ...patch });
    if (next.success) settings.value.spec = next.data;
  }

  const number_of = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);

  function set_number(key: keyof TestImageSpec, value: unknown) {
    const n = number_of(value);
    if (n !== null) update({ [key]: n });
  }

  function use_preset(value: string) {
    const [width, height] = value.split("x").map(Number);
    if (width && height) update({ width, height });
  }

  async function generate() {
    if (!plan.ok) return;
    const folder = await pictures_folder().catch(() => "/home");
    const path = await win.pick_save({
      name: test_image_name(spec, plan.width, plan.height, settings.value.format),
      accept: ["image/*"],
      start_path: folder,
      title: "Save test image as",
    });
    if (path) await generate_test_image(app_id, $state.snapshot(spec), $state.snapshot(output), path);
  }
</script>

{#snippet swatch(label: string, key: "color" | "color_2" | "ink")}
  <label class="flex items-center justify-between gap-2 text-ui">
    {label}
    <span class="flex items-center gap-2">
      <span class="font-mono text-2xs text-foreground/80 uppercase">{spec[key]}</span>
      <span class="relative size-7 shrink-0 cursor-pointer overflow-hidden rounded-md ring-1 ring-foreground/15 ring-inset" style:background={spec[key]}>
        <input type="color" class="absolute inset-0 cursor-pointer opacity-0" aria-label={label} value={spec[key]} oninput={(event) => update({ [key]: event.currentTarget.value })} />
      </span>
    </span>
  </label>
{/snippet}

{#snippet number(label: string, key: keyof TestImageSpec, min: number, max: number, unit = "")}
  <label class="flex items-center justify-between gap-2 text-ui">
    {label}
    <span class="flex items-center gap-1.5">
      <Input type="number" size="sm" {min} {max} class="w-24 font-mono tabular-nums" value={spec[key] as number} oninput={(event) => set_number(key, event.currentTarget.valueAsNumber)} />
      <span class="w-4 font-mono text-2xs text-foreground/80">{unit}</span>
    </span>
  </label>
{/snippet}

<div class="grid h-full grid-rows-[auto_minmax(0,1fr)_auto]">
  <Toolbar>
    {@render picker()}
    <span class="min-w-0 flex-1 truncate px-1 text-ui font-medium">Test image</span>
    <Select size="sm" class="w-auto" aria-label="Format" options={FORMATS} bind:value={settings.value.format} />
    <Button variant="primary" size="sm" disabled={!plan.ok} onclick={generate}><FloppyDiskIcon weight="bold" /> Generate…</Button>
  </Toolbar>

  <div class="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] @2xl:grid-cols-[18rem_minmax(0,1fr)] @2xl:grid-rows-[minmax(0,1fr)]">
    <aside class="flex max-h-64 flex-col gap-5 overflow-auto border-b border-foreground/8 bg-background-light p-3 @2xl:max-h-none @2xl:border-r @2xl:border-b-0">
      <div class="flex flex-col gap-2.5">
        <h3 class="px-0.5 text-2xs font-medium tracking-wide text-foreground/65 uppercase">Size</h3>
        <Segmented
          size="sm"
          label="Size by"
          class="self-start"
          bind:value={settings.value.by}
          options={[
            { value: SizeBy.DIMENSIONS, label: "Dimensions" },
            { value: SizeBy.BYTES, label: "File size" },
          ]}
        />
        {#if settings.value.by === SizeBy.BYTES}
          <label class="flex items-center justify-between gap-2 text-ui">
            Exact size
            <Input size="sm" class="w-28 font-mono" placeholder="500MB" bind:value={settings.value.target} />
          </label>
          <p class="px-0.5 text-2xs text-foreground/65">Uncompressed PNG or BMP, padded to the byte. Width and height below set the shape.</p>
        {/if}
        {@render number("Width", "width", 1, MAX_SIDE, "px")}
        {@render number("Height", "height", 1, MAX_SIDE, "px")}
        <Select size="sm" aria-label="Preset size" options={PRESETS} value="" onchange={(event) => { use_preset(event.currentTarget.value); event.currentTarget.value = ""; }} />
      </div>

      <div class="flex flex-col gap-2.5">
        <h3 class="px-0.5 text-2xs font-medium tracking-wide text-foreground/65 uppercase">Pattern</h3>
        <Select size="sm" aria-label="Pattern" options={PATTERNS} value={spec.pattern} onchange={(event) => update({ pattern: event.currentTarget.value as Pattern })} />
        {#if uses_cell}{@render number("Pixel size", "cell", 1, 100_000, "px")}{/if}
        {#if spec.pattern === Pattern.RINGS}{@render number("Colours", "hues", 1, 64)}{/if}
        {#if spec.pattern === Pattern.RINGS || spec.pattern === Pattern.SPECTRUM}{@render number("Saturation", "saturation", 0, 100, "%")}{/if}
        {#if spec.pattern === Pattern.RINGS}{@render number("Lightness", "lightness", 0, 100, "%")}{/if}
        {#if spec.pattern === Pattern.GRADIENT}
          <Select size="sm" aria-label="Gradient direction" options={GRADIENTS} value={spec.gradient} onchange={(event) => update({ gradient: event.currentTarget.value as Gradient })} />
        {/if}
        {#if uses_colors}{@render swatch(spec.pattern === Pattern.SOLID ? "Colour" : "First colour", "color")}{/if}
        {#if spec.pattern === Pattern.CHECKER || spec.pattern === Pattern.GRADIENT}{@render swatch("Second colour", "color_2")}{/if}
        {#if spec.pattern === Pattern.NOISE}{@render number("Seed", "seed", 0, 0xffffffff)}{/if}
      </div>

      <div class="flex flex-col gap-2.5">
        <h3 class="px-0.5 text-2xs font-medium tracking-wide text-foreground/65 uppercase">Markings</h3>
        {@render number("Rulers every", "rulers", 0, 100_000, "px")}
        <label class="flex items-center justify-between gap-2 text-ui">
          Grid lines
          <Switch checked={spec.grid} disabled={spec.rulers === 0} onchange={(event) => update({ grid: event.currentTarget.checked })} />
        </label>
        <label class="flex items-center justify-between gap-2 text-ui">
          Centre crosshair
          <Switch checked={spec.crosshair} onchange={(event) => update({ crosshair: event.currentTarget.checked })} />
        </label>
        <label class="flex items-center justify-between gap-2 text-ui">
          Corner markers
          <Switch checked={spec.corners} onchange={(event) => update({ corners: event.currentTarget.checked })} />
        </label>
        {@render number("Border", "border", 0, 10_000, "px")}
        <label class="flex flex-col gap-1.5 text-ui">
          Label
          <Input size="sm" placeholder="No label" value={spec.label} oninput={(event) => update({ label: event.currentTarget.value })} />
        </label>
        <p class="px-0.5 text-2xs text-foreground/65">&lbrace;w&rbrace;, &lbrace;h&rbrace; and &lbrace;format&rbrace; are filled in.</p>
        {@render swatch("Ink", "ink")}
      </div>

      {#if has_quality}
        <div class="flex flex-col gap-2.5">
          <h3 class="px-0.5 text-2xs font-medium tracking-wide text-foreground/65 uppercase">Output</h3>
          <label class="flex items-center justify-between gap-2 text-ui">
            Quality
            <span class="flex items-center gap-1.5">
              <Input type="number" size="sm" min={1} max={100} class="w-24 font-mono tabular-nums" bind:value={settings.value.quality} />
              <span class="w-4 font-mono text-2xs text-foreground/80">%</span>
            </span>
          </label>
        </div>
      {/if}
    </aside>

    <div class="stage grid min-h-0 grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)] place-items-center p-6">
      {#if plan.ok}
        <canvas {@attach paint(preview)} class="max-h-full max-w-full ring-1 ring-foreground/15 [image-rendering:pixelated]" aria-label="Preview, {sized.width} by {sized.height}"></canvas>
      {:else}
        <p role="alert" class="flex max-w-sm items-start gap-2 text-ui text-error"><WarningCircleIcon weight="bold" class="mt-0.5 size-4 shrink-0" />{plan.error}</p>
      {/if}
    </div>
  </div>

  <StatusBar>
    {#if plan.ok}
      <span>{plan.width} × {plan.height} px</span>
      <span class="hidden @sm:block">{plan.note}</span>
      {#if plan.bytes !== null}<span class="ml-auto">{format_bytes(plan.bytes)}</span>{/if}
    {:else}
      <span class="text-error">Can't generate</span>
    {/if}
  </StatusBar>
</div>

<style>
  .stage {
    background: var(--background-darker);
  }
</style>
