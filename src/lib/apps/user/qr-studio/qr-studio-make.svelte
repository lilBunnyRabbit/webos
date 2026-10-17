<script lang="ts">
  import kernel, { NotificationType, type ClipboardService, type FilesService, type NotificationsService } from "$lib/core/api";
  import { base_name, parent_path } from "$lib/core/api/services/files/path";
  import { Badge, Button, EmptyState, IconButton, Input, Segmented, Select, Slider, StatusBar, Switch, Toolbar } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import { error_message } from "$lib/core/utils";
  import { encode_image, ImageFormat, write_image } from "$lib/core/utils/image";
  import { create_qr_detector, detect_qr, type BarcodeDetector } from "$lib/core/utils/qr";
  import {
    Check as CheckIcon,
    Copy as CopyIcon,
    FloppyDisk as FloppyDiskIcon,
    Lightbulb as LightbulbIcon,
    QrCode as QrCodeIcon,
    WarningCircle as WarningCircleIcon,
  } from "phosphor-svelte";
  import { untrack, type Snippet } from "svelte";
  import { z } from "zod";
  import { encode, type QrCode } from "./encode/encode";
  import { Charset } from "./encode/segments";
  import { Ecc, ECC_LEVELS, ECC_RECOVERY, MAX_VERSION, MIN_VERSION } from "./encode/tables";
  import { content_payload, content_schema, ContentKind, DEFAULT_CONTENT, type Content } from "./payload";
  import QrStudioContent from "./qr-studio-content.svelte";
  import { DEFAULT_STYLE, image_side, module_path, qr_canvas, qr_svg, type Style } from "./render";

  const { tabs, initial_text, on_explain }: { tabs: Snippet; initial_text?: string; on_explain: (text: string, ecc: Ecc) => void } = $props();
  const { app_id, window: win, storage } = get_app_context();
  const files = $derived(kernel.service<FilesService>("files"));
  const clipboard = $derived(kernel.service<ClipboardService>("clipboard"));
  const notifications = $derived(kernel.service<NotificationsService>("notifications"));

  const Format = { PNG: "png", SVG: "svg" } as const;
  type Format = (typeof Format)[keyof typeof Format];
  const AUTO = "auto";

  const content = storage.window<Content>(
    "content",
    untrack(() => (initial_text === undefined ? DEFAULT_CONTENT : { ...DEFAULT_CONTENT, kind: ContentKind.TEXT, text: initial_text })),
    content_schema
  );
  const options = storage.persisted(
    "options",
    { ecc: Ecc.M as Ecc, min_version: MIN_VERSION, mask: AUTO as string, format: Format.PNG as Format },
    z.object({
      ecc: z.enum([Ecc.L, Ecc.M, Ecc.Q, Ecc.H]),
      min_version: z.number().int().min(MIN_VERSION).max(MAX_VERSION),
      mask: z.enum([AUTO, "0", "1", "2", "3", "4", "5", "6", "7"]),
      format: z.enum([Format.PNG, Format.SVG]),
    })
  );
  const style = storage.persisted<Style>(
    "style",
    DEFAULT_STYLE,
    z.object({
      quiet: z.number().int().min(0).max(20),
      scale: z.number().int().min(1).max(64),
      dark: z.string().regex(/^#[0-9a-f]{6}$/i),
      light: z.string().regex(/^#[0-9a-f]{6}$/i),
      transparent: z.boolean(),
    })
  );

  const ECCS = ECC_LEVELS.map((level) => ({ value: level, label: level }));
  const MASKS = [{ value: AUTO, label: "Auto: lowest penalty" }, ...Array.from({ length: 8 }, (_, i) => ({ value: String(i), label: `Mask ${i}` }))];
  const FORMATS = [
    { value: Format.PNG, label: "PNG" },
    { value: Format.SVG, label: "SVG" },
  ];

  const payload = $derived(content_payload(content.value));
  const ecc = $derived(payload.fixed?.ecc ?? options.value.ecc);
  type Result = { code: QrCode; error: null } | { code: null; error: string } | null;
  const result = $derived.by<Result>(() => {
    if (payload.text === "") return null;
    try {
      const code = encode(payload.text, {
        ecc,
        charset: payload.charset,
        min_version: payload.fixed?.version ?? options.value.min_version,
        max_version: payload.fixed?.version,
        mask: options.value.mask === AUTO ? null : Number(options.value.mask),
      });
      return { code, error: null };
    } catch (error) {
      return { code: null, error: error_message(error) };
    }
  });
  const code = $derived(result?.code ?? null);
  const preview_path = $derived(code ? module_path(code.size, (index) => code.modules[index] === 1, style.value.quiet) : "");
  const side = $derived(code ? code.size + style.value.quiet * 2 : 0);

  const Check = { IDLE: "idle", CHECKING: "checking", OK: "ok", FOUND: "found", DIFFERENT: "different", FAILED: "failed" } as const;
  type Check = (typeof Check)[keyof typeof Check];
  let check = $state<Check>(Check.IDLE);
  let detector: Promise<BarcodeDetector> | null = null;

  $effect(() => {
    const current = code;
    const look = $state.snapshot(style.value);
    const expected = payload.text;
    const latin2 = payload.charset === Charset.LATIN2;
    if (!current) {
      check = Check.IDLE;
      return;
    }
    let stale = false;
    check = Check.CHECKING;
    const timer = setTimeout(async () => {
      try {
        detector ??= create_qr_detector();
        const bitmap = await createImageBitmap(qr_canvas(current.size, current.modules, { ...look, transparent: false }));
        const decoded = await detect_qr(await detector, bitmap).finally(() => bitmap.close());
        if (!stale) check = decoded === null ? Check.FAILED : decoded === expected ? Check.OK : latin2 ? Check.FOUND : Check.DIFFERENT;
      } catch (reason) {
        console.warn("[QrStudio] Round-trip check failed", reason);
        if (!stale) check = Check.IDLE;
      }
    }, 250);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  });

  function report(title: string, reason?: unknown) {
    notifications.notify(app_id, { type: NotificationType.ERROR, title, message: reason === undefined ? undefined : error_message(reason) });
  }

  function svg_text(current: QrCode): string {
    return qr_svg(current.size, current.modules, $state.snapshot(style.value));
  }

  async function save() {
    if (!code) return;
    const format = options.value.format;
    const path = await win.pick_save({
      name: `qr-code.${format}`,
      accept: format === Format.SVG ? [".svg", "image/svg+xml"] : [".png", "image/png"],
      start_path: "/home",
      title: `Save QR code as ${format.toUpperCase()}`,
    });
    if (!path) return;
    try {
      if (format === Format.SVG) {
        const folder = await files.get_directory(parent_path(path));
        if (!folder) throw new Error(`Folder not found: ${parent_path(path)}`);
        await files.create_file(folder, base_name(path), { content: new Blob([svg_text(code)], { type: "image/svg+xml" }), overwrite: true });
      } else {
        await write_image(path, qr_canvas(code.size, code.modules, $state.snapshot(style.value)), { format: ImageFormat.PNG });
      }
      notifications.notify(app_id, { title: "QR code saved", message: path });
    } catch (reason) {
      report("Couldn't save the QR code", reason);
    }
  }

  let copied = $state(false);
  let copied_timer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => () => clearTimeout(copied_timer));

  async function copy() {
    if (!code) return;
    try {
      if (options.value.format === Format.SVG) await clipboard.copy_text(svg_text(code));
      else {
        const blob = await encode_image(qr_canvas(code.size, code.modules, $state.snapshot(style.value)), ImageFormat.PNG);
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      }
    } catch (reason) {
      return report("Couldn't copy to the clipboard", reason);
    }
    copied = true;
    clearTimeout(copied_timer);
    copied_timer = setTimeout(() => (copied = false), 1200);
  }

  function set_int(key: "quiet" | "scale", value: number, min: number, max: number) {
    if (Number.isFinite(value)) style.value[key] = Math.min(max, Math.max(min, Math.round(value)));
  }

  function set_min_version(value: number) {
    if (Number.isFinite(value)) options.value.min_version = Math.min(MAX_VERSION, Math.max(MIN_VERSION, Math.round(value)));
  }
</script>

{#snippet heading(text: string)}
  <h3 class="px-0.5 text-2xs font-medium tracking-wide text-foreground/65 uppercase">{text}</h3>
{/snippet}

{#snippet swatch(label: string, key: "dark" | "light", disabled = false)}
  <label class="flex items-center justify-between gap-2 text-ui" class:opacity-38={disabled}>
    {label}
    <span class="flex items-center gap-2">
      <span class="font-mono text-2xs text-foreground/80 uppercase">{style.value[key]}</span>
      <span class="relative size-7 shrink-0 cursor-pointer overflow-hidden rounded-md ring-1 ring-foreground/15 ring-inset pointer-coarse:size-9" style:background={style.value[key]}>
        <input type="color" class="absolute inset-0 cursor-pointer opacity-0" aria-label={label} {disabled} bind:value={style.value[key]} />
      </span>
    </span>
  </label>
{/snippet}

<div class="grid h-full grid-rows-[auto_minmax(0,1fr)_auto]">
  <Toolbar>
    {@render tabs()}
    <span class="min-w-0 flex-1"></span>
    <Select size="sm" class="w-auto" aria-label="Format" options={FORMATS} bind:value={options.value.format} />
    <IconButton size="sm" label={copied ? "Copied" : `Copy as ${options.value.format.toUpperCase()}`} disabled={!code} onclick={copy}>
      {#if copied}<CheckIcon weight="bold" class="text-success" />{:else}<CopyIcon weight="bold" />{/if}
    </IconButton>
    <Button variant="primary" size="sm" aria-label="Save as {options.value.format.toUpperCase()}" disabled={!code} onclick={save}><FloppyDiskIcon weight="bold" /> <span class="hidden @md:inline">Save…</span></Button>
  </Toolbar>

  <div class="min-h-0 overflow-auto @2xl:grid @2xl:grid-cols-[20rem_minmax(0,1fr)] @2xl:overflow-hidden">
    <div class="stage flex flex-col items-center justify-center gap-3 p-4 @2xl:order-2 @2xl:min-h-0 @2xl:p-6 @2xl:[container:stage/size]">
      {#if result?.code}
        <svg
          viewBox="0 0 {side} {side}"
          shape-rendering="crispEdges"
          class="aspect-square w-full max-w-72 ring-1 ring-foreground/15 preview shrink-0"
          role="img"
          aria-label="QR code, version {result.code.version}"
        >
          {#if !style.value.transparent}<rect width={side} height={side} fill={style.value.light} />{/if}
          <path fill={style.value.dark} d={preview_path} />
        </svg>
        <div class="flex flex-wrap items-center justify-center gap-2" aria-live="polite">
          {#if check === Check.OK}
            <Badge tone="success"><CheckIcon weight="bold" class="size-3" /> Decoded</Badge>
          {:else if check === Check.FOUND}
            <Badge tone="success"><CheckIcon weight="bold" class="size-3" /> Found</Badge>
            <span class="text-2xs text-foreground/65">This browser can't show ISO 8859-2 text, so only the code was checked</span>
          {:else if check === Check.DIFFERENT}
            <Badge tone="warning">Reads back differently</Badge>
          {:else if check === Check.FAILED}
            <Badge tone="error">Doesn't scan: check the colours and quiet zone</Badge>
          {:else if check === Check.CHECKING}
            <Badge>Checking…</Badge>
          {/if}
          <Button size="sm" variant="quiet" onclick={() => on_explain(payload.text, result.code.ecc)}><LightbulbIcon weight="bold" /> How it's built</Button>
        </div>
      {:else if result?.error}
        <p role="alert" class="flex max-w-sm items-start gap-2 text-ui text-error"><WarningCircleIcon weight="bold" class="mt-0.5 size-4 shrink-0" />{result.error}</p>
      {:else}
        <EmptyState icon={QrCodeIcon} title="Nothing to encode yet" description="Fill in the content and the code appears here." />
      {/if}
    </div>

    <aside class="flex flex-col gap-5 border-t border-foreground/8 bg-background-light p-3 @2xl:order-1 @2xl:min-h-0 @2xl:overflow-auto @2xl:border-t-0 @2xl:border-r">
      <div class="flex flex-col gap-2.5">
        {@render heading("Content")}
        <QrStudioContent bind:content={content.value} />
        {#if payload.problems.length}
          <ul class="flex flex-col gap-1 text-2xs text-warning">
            {#each payload.problems as problem (problem)}<li class="flex gap-1.5"><WarningCircleIcon weight="bold" class="mt-px size-3 shrink-0" />{problem}</li>{/each}
          </ul>
        {/if}
      </div>

      <div class="flex flex-col gap-2.5">
        {@render heading("Code")}
        {#if payload.fixed}
          <p class="px-0.5 text-2xs text-foreground/65">UPN codes are always version {payload.fixed.version} at ECC {payload.fixed.ecc}, so banking apps know what to expect.</p>
        {/if}
        <div class="flex items-center justify-between gap-2 text-ui">
          <span>Error correction <span class="text-2xs text-foreground/65">{ECC_RECOVERY[ecc]}%</span></span>
          {#if payload.fixed}
            <span class="font-mono text-ui">{ecc}</span>
          {:else}
            <Segmented size="sm" label="Error correction" options={ECCS} bind:value={options.value.ecc} />
          {/if}
        </div>
        <label class="flex items-center justify-between gap-2 text-ui">
          Smallest version
          <Input
            type="number"
            size="sm"
            min={MIN_VERSION}
            max={MAX_VERSION}
            class="w-20 font-mono tabular-nums"
            disabled={Boolean(payload.fixed)}
            value={payload.fixed?.version ?? options.value.min_version}
            oninput={(event) => set_min_version(event.currentTarget.valueAsNumber)}
          />
        </label>
        <Select size="sm" aria-label="Mask" options={MASKS} bind:value={options.value.mask} />
      </div>

      <div class="flex flex-col gap-2.5">
        {@render heading("Style")}
        <label class="flex flex-col gap-1 text-ui">
          <span class="flex items-baseline justify-between gap-2">
            Module size
            <span class="font-mono text-2xs text-foreground/65 tabular-nums">{style.value.scale} px{code ? ` · ${image_side(code.size, style.value)} px image` : ""}</span>
          </span>
          <Slider size="sm" min={1} max={40} bind:value={style.value.scale} />
        </label>
        <label class="flex items-center justify-between gap-2 text-ui">
          <span>Quiet zone <span class="text-2xs text-foreground/65">modules, 4 is standard</span></span>
          <Input type="number" size="sm" min={0} max={20} class="w-20 font-mono tabular-nums" value={style.value.quiet} oninput={(event) => set_int("quiet", event.currentTarget.valueAsNumber, 0, 20)} />
        </label>
        {@render swatch("Modules", "dark")}
        {@render swatch("Background", "light", style.value.transparent)}
        <label class="flex items-center justify-between gap-2 text-ui">
          Transparent background
          <Switch bind:checked={style.value.transparent} />
        </label>
      </div>
    </aside>
  </div>

  <StatusBar>
    {#if code}
      <span class="shrink-0">Version {code.version} · {code.size}×{code.size}</span>
      <span class="hidden @md:block">ECC {code.ecc} · mask {code.mask}</span>
      <span class="ml-auto shrink-0">{code.data_codewords.length} + {code.codewords.length - code.data_codewords.length}<span class="hidden @md:inline"> ECC</span> bytes</span>
    {:else}
      <span>No code</span>
    {/if}
  </StatusBar>
</div>

<style>
  .stage {
    background: var(--background-darker);
  }

  /* Only the wide layout names the stage a size container, so phones keep the plain max-width. */
  @container stage (min-width: 0) {
    .preview {
      width: min(32rem, 100cqw - 3rem, 100cqh - 6rem);
      max-width: none;
    }
  }
</style>
