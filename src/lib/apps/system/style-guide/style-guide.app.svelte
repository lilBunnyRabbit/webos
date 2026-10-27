<script lang="ts">
  import kernel, { type AppListing, type AppsService, type DialogsService, type SettingsService } from "$lib/core/api";
  import { get_app_context } from "$lib/core/contexts/app";
  import AppAnnouncement, { type AnnouncedApp } from "$lib/core/components/announcement/app-announcement.svelte";
  import {
    Badge,
    BoardOverlay,
    Button,
    Checkbox,
    CopyButton,
    EmptyState,
    Grabber,
    IconButton,
    Input,
    Kbd,
    ResizeHandle,
    Section,
    Segmented,
    Select,
    SettingRow,
    SideNav,
    Slider,
    Spinner,
    StatusBar,
    Switch,
    Textarea,
    Toolbar,
  } from "$lib/core/components/ui";
  import {
    Bell as BellIcon,
    PaintBrush as PaintBrushIcon,
    FloppyDisk as FloppyDiskIcon,
    PaintBucket as PaintBucketIcon,
    Shapes as ShapesIcon,
    CursorClick as CursorClickIcon,
    Eraser as EraserIcon,
    Folder as FolderIcon,
    Mountains as MountainsIcon,
    MagnifyingGlass as MagnifyingGlassIcon,
    PaperPlaneTilt as PaperPlaneTiltIcon,
    PencilSimple as PencilSimpleIcon,
    Plus as PlusIcon,
    SquaresFour as SquaresFourIcon,
    Stack as StackIcon,
    Swatches as SwatchesIcon,
    TextAa as TextAaIcon,
    Toolbox as ToolboxIcon,
    Trash as TrashIcon,
    Warning as WarningIcon,
  } from "phosphor-svelte";
  import { z } from "zod";
  import { reveal_setting } from "$lib/core/components/ui/setting-anchor";
  import { swipe_dismiss } from "$lib/core/utils/swipe-dismiss";
  import { ai_icon } from "$kit/components/ai-icon";
  import { AiGate } from "$kit/components/ai-gate";
  import { CropFrame } from "$kit/components/crop-frame";
  import { DropZone, type SourceFile } from "$kit/components/drop-zone";
  import { QuadFrame } from "$kit/components/quad-frame";
  import type { Quad } from "$kit/utils/perspective";
  import { SwipeCompare } from "$kit/components/swipe-compare";
  import { QrFrames } from "$kit/components/qr-transfer";
  import { Waveform, type Span } from "$kit/components/waveform";
  import type { Pcm } from "$kit/utils/audio";
  import { encode_frames } from "$kit/utils/qr-transfer";

  const SECTIONS = [
    { value: "colour", label: "Colour", icon: SwatchesIcon, group: "Foundations" },
    { value: "type", label: "Type", icon: TextAaIcon, group: "Foundations" },
    { value: "surfaces", label: "Surfaces", icon: StackIcon, group: "Foundations" },
    { value: "actions", label: "Actions", icon: CursorClickIcon, group: "Components" },
    { value: "inputs", label: "Inputs", icon: SquaresFourIcon, group: "Components" },
    { value: "feedback", label: "Feedback", icon: BellIcon, group: "Components" },
    { value: "kit", label: "App kit", icon: ToolboxIcon, group: "Components" },
  ] as const;
  type SectionId = (typeof SECTIONS)[number]["value"];

  const { storage } = get_app_context();
  const section = storage.window<SectionId>("section", "colour", z.enum(SECTIONS.map((item) => item.value)));
  const open = storage.window<boolean>("open", false, z.boolean());
  const current = $derived(SECTIONS.find((item) => item.value === section.value) ?? SECTIONS[0]);

  const LADDER = ["background-darkest", "background-darker", "background-dark", "background", "background-light", "background-lighter", "background-lightest"];
  const BRAND = ["foreground", "primary", "secondary", "tertiary", "accent", "cottontail"];
  const STATES = ["success", "warning", "error", "info"];
  const TYPE = [
    { name: "text-lg / semibold", sample: "Window and page titles", class: "text-lg font-semibold" },
    { name: "text-base / semibold", sample: "Card and dialog titles", class: "text-base font-semibold" },
    { name: "text-sm / semibold", sample: "Section headings", class: "text-sm font-semibold" },
    { name: "text-sm", sample: "Reading text and longer descriptions", class: "text-sm" },
    { name: "text-ui", sample: "The default for controls, rows and app UI", class: "text-ui" },
    { name: "text-2xs", sample: "Captions, metadata, column headers", class: "text-2xs text-foreground/80" },
    { name: "font-mono text-2xs", sample: "1.42 MB · 3f9a1c2 · oklch(0.745 0.0699 122.47)", class: "font-mono text-2xs" },
  ];
  const RADII = ["xs", "sm", "md", "lg", "xl", "2xl"];
  const SHADOWS = ["raised", "popover", "window", "window-focused"];

  let name = $state("Notes");
  let query = $state("");
  let notify = $state(true);
  let compact = $state(false);
  let agree = $state(true);
  let view = $state<"list" | "grid">("list");
  let sort = $state<"name" | "size" | "date">("name");
  let notes = $state("");
  let volume = $state(60);
  let bold = $state(true);
  let italic = $state(false);
  let large = $state(true);
  let tool = $state<"pencil" | "eraser">("pencil");
  let speed = $state<"slow" | "normal" | "fast">("normal");
  let pane = $state({ size: 160, collapsed: false });
  const DEMO_PAGES = [
    { value: "theme", label: "Theme", icon: SwatchesIcon, group: "Personalise" },
    { value: "text", label: "Text", icon: TextAaIcon, group: "Personalise" },
    { value: "alerts", label: "Alerts", icon: BellIcon, group: "System" },
  ];
  let demo_page = $state("text");
  let demo_open = $state(false);
  let demo_width = $state<"wide" | "narrow">("wide");
  let demo_root: HTMLElement | null = $state(null);
  let sheet_open = $state(false);
  let split = $state(50);
  let crop = $state({ x: 60, y: 40, width: 200, height: 120 });
  let dropped = $state.raw<SourceFile[]>([]);
  let quad = $state<Quad>([
    { x: 92, y: 30 },
    { x: 250, y: 46 },
    { x: 236, y: 178 },
    { x: 70, y: 160 },
  ]);
  const WAVE_RATE = 8000;
  const wave: Pcm = {
    sample_rate: WAVE_RATE,
    channels: [
      Float32Array.from({ length: WAVE_RATE * 2 }, (_, i) => {
        const t = i / WAVE_RATE;
        return Math.sin(2 * Math.PI * 180 * t) * Math.abs(Math.sin(Math.PI * t * 2.5)) * 0.9;
      }),
    ],
  };
  let trim = $state({ start: 0.2, end: 1.8 });
  let wave_selection = $state<Span | null>({ start: 0.8, end: 1.1 });

  const apps = $derived(kernel.service<AppsService>("apps"));
  const dialogs = $derived(kernel.service<DialogsService>("dialogs"));
  const settings = $derived(kernel.service<SettingsService>("settings"));
  /** A sheet of paper photographed at an angle, in the theme's own shades. */
  const paper_photo = $derived.by(() => {
    const { background_darkest: table, foreground: paper, background_dark: ink } = settings.theme;
    const lines = [0, 1, 2, 3, 4].map((row) => `<path d="M${106 - row * 4} ${60 + row * 22}l${110 + row * 2} ${8 + row * 0.5}" stroke="${ink}" stroke-width="5" stroke-linecap="round"/>`);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><rect width="320" height="200" fill="${table}"/><path d="M92 30 250 46 236 178 70 160Z" fill="${paper}"/>${lines.join("")}</svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
  });

  // Paint with made-up highlights, so the cards and the "Start menu" strip both show.
  const SAMPLE_HIGHLIGHTS = [
    { icon: PaintBrushIcon, title: "Brushes and pencil", text: "Draw freehand at any size, with smoothing for steady lines." },
    { icon: PaintBucketIcon, title: "Fill", text: "Flood an area with the current colour in one click." },
    { icon: ShapesIcon, title: "Shapes and text", text: "Lines, rectangles, ellipses and text on their own layer until placed." },
    { icon: FloppyDiskIcon, title: "Your files", text: "Opens and saves PNG, JPEG and WebP in your folders." },
  ];
  const pick = (id: string) => apps.listings({ all: true }).find((listing) => listing.id === id);
  const sample_apps = $derived.by((): AnnouncedApp[] => {
    const paint = pick("paint");
    const list = [
      paint && { ...paint, highlights: () => Promise.resolve({ default: SAMPLE_HIGHLIGHTS }) },
      pick("maze"),
      pick("calculator"),
    ].filter((manifest): manifest is AppListing => Boolean(manifest));
    return list.map((manifest) => ({ manifest, version: "1.5.0" }));
  });
  const many_apps = $derived(
    ["paint", "maze", "snake", "sudoku", "kanban", "clock"].flatMap((id) => {
      const manifest = pick(id);
      return manifest ? [{ manifest, version: "0.34.0" }] : [];
    })
  );
  const ai_icons = $derived(["terminal", "calculator", "text-editor", "file-explorer"].flatMap((id) => pick(id)?.icon ?? []).map((icon) => ai_icon(icon)));
  const AI_ICON_SIZES = ["size-4", "size-6", "size-9", "size-12"];
</script>

{#snippet swatch(token: string)}
  <div class="flex items-center gap-2.5">
    <span class="size-9 shrink-0 rounded-lg ring-1 ring-foreground/12 ring-inset" style:background="var(--{token})"></span>
    <span class="min-w-0">
      <span class="block truncate text-ui font-medium">{token}</span>
      <span class="block truncate font-mono text-2xs text-foreground/80">--{token}</span>
    </span>
  </div>
{/snippet}

{#snippet scene(blurred: boolean)}
  <div class={["grid size-full place-items-center bg-background-light text-primary", blurred && "blur-[3px]"]}>
    <MountainsIcon weight="duotone" class="size-1/2" />
  </div>
{/snippet}

{#snippet sharp()}{@render scene(false)}{/snippet}
{#snippet blurred()}{@render scene(true)}{/snippet}

{#snippet specimen(label: string)}
  <span class="font-mono text-2xs text-foreground/80">{label}</span>
{/snippet}

<SideNav label="Style guide sections" back_label="Style Guide" items={[...SECTIONS]} bind:value={section.value} bind:open={open.value}>
  <main class="min-h-0 flex-1 overflow-y-auto">
    <div class="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-6">
      <header>
        <h1 class="text-lg font-semibold">{current.label}</h1>
        <p class="text-ui text-foreground/65">Live in the current theme. Rules and rationale: <span class="font-mono">docs/design</span>.</p>
      </header>

      {#if section.value === "colour"}
        <Section title="Surface ladder" description="Darkest at the bottom of the stack. At most three shades inside one window or panel." flush>
          <div class="flex overflow-hidden rounded-xl ring-1 ring-foreground/10">
            {#each LADDER as token (token)}
              <div class="flex h-24 flex-1 flex-col justify-end p-2" style:background="var(--{token})">
                <span class="font-mono text-2xs text-foreground/80">{token.replace("background", "bg")}</span>
              </div>
            {/each}
          </div>
        </Section>
        <Section title="Text and brand" description="Brand colours never touch each other: separate them with space or a surface." flush>
          <div class="grid grid-cols-2 gap-3 @xl:grid-cols-3">
            {#each BRAND as token (token)}{@render swatch(token)}{/each}
          </div>
        </Section>
        <Section title="States" description="Only for state. Tinted fills use 12–15% of the state colour with the full colour as ink." flush>
          <div class="grid grid-cols-2 gap-3 @xl:grid-cols-4">
            {#each STATES as token (token)}{@render swatch(token)}{/each}
          </div>
        </Section>
        <Section title="Opacity modifiers" description="Alpha on existing colours, never new colours." flush>
          <div class="grid grid-cols-2 gap-2 @xl:grid-cols-5">
            {#each [["hover", "85"], ["secondary", "80"], ["active", "70"], ["muted", "65"], ["disabled", "38"]] as [label, alpha] (label)}
              <div class="rounded-lg bg-background-light p-3 ring-1 ring-foreground/8">
                <span class="block text-ui font-medium" style:opacity={Number(alpha) / 100}>{label}</span>
                {@render specimen(`opacity-${alpha}`)}
              </div>
            {/each}
          </div>
        </Section>
      {:else if section.value === "type"}
        <Section title="Scale" description="Inter for everything you read, Hack for values.">
          {#each TYPE as item (item.name)}
            <div class="flex flex-col gap-1 px-4 py-3">
              {@render specimen(item.name)}
              <span class={item.class}>{item.sample}</span>
            </div>
          {/each}
        </Section>
      {:else if section.value === "surfaces"}
        <Section title="Radius" flush>
          <div class="grid grid-cols-3 gap-3 @xl:grid-cols-6">
            {#each RADII as radius (radius)}
              <div class="flex flex-col items-center gap-2">
                <span class="size-14 bg-background-lighter ring-1 ring-foreground/12" style:border-radius="var(--radius-{radius})"></span>
                {@render specimen(`rounded-${radius}`)}
              </div>
            {/each}
          </div>
        </Section>
        <Section title="Elevation" description="Shadows are cast in the darkest shade, so they stay on-palette in every theme." flush>
          <div class="grid grid-cols-2 gap-6 rounded-xl bg-background-darker p-6 @xl:grid-cols-4">
            {#each SHADOWS as shadow (shadow)}
              <div class="flex flex-col items-center gap-3">
                <span class="h-16 w-full rounded-xl bg-background-light" style:box-shadow="var(--shadow-{shadow})"></span>
                {@render specimen(`shadow-${shadow}`)}
              </div>
            {/each}
          </div>
        </Section>
        <Section title="App frame" description="Toolbar and status bar sit one shade lighter than content, split by hairlines." flush>
          <div class="overflow-hidden rounded-xl ring-1 ring-foreground/10">
            <Toolbar>
              <IconButton label="New" size="sm"><PlusIcon weight="bold" /></IconButton>
              <span class="flex-1 px-1 text-ui font-medium">Toolbar</span>
              <Input size="sm" placeholder="Filter" class="w-36">
                {#snippet leading()}<MagnifyingGlassIcon weight="bold" />{/snippet}
              </Input>
            </Toolbar>
            <div class="h-24 bg-background p-4 text-ui text-foreground/65">Content on background</div>
            <StatusBar><span>3 items</span><span class="ml-auto">1.42 MB</span></StatusBar>
          </div>
        </Section>
        <Section title="Side navigation" description="Grouped pages; with the page as its child it drills in below @2xl: the list first, Back returns." flush>
          {#snippet actions()}
            <Segmented label="Demo width" size="sm" bind:value={demo_width} options={[{ value: "wide", label: "Wide" }, { value: "narrow", label: "Narrow" }]} />
          {/snippet}
          <div class={["@container mx-auto h-80 overflow-hidden rounded-xl ring-1 ring-foreground/10", demo_width === "wide" ? "w-full" : "w-80"]}>
            <SideNav label="Demo pages" back_label="Demo" items={DEMO_PAGES} bind:value={demo_page} bind:open={demo_open}>
              {#snippet header()}
                <Input size="sm" placeholder="Search" aria-label="Search the demo">
                  {#snippet leading()}<MagnifyingGlassIcon weight="bold" />{/snippet}
                </Input>
              {/snippet}
              <div bind:this={demo_root} class="min-h-0 flex-1 overflow-y-auto bg-background p-4">
                <Section title={DEMO_PAGES.find((item) => item.value === demo_page)?.label} description="Section and SettingRow take a setting anchor.">
                  <SettingRow setting="demo-size" label="Text size">
                    {#snippet children({ id, describedby })}
                      <Button {id} aria-describedby={describedby} size="sm" onclick={() => demo_root && reveal_setting(demo_root, "demo-size")}>Ring this row</Button>
                    {/snippet}
                  </SettingRow>
                </Section>
              </div>
            </SideNav>
          </div>
        </Section>
        <Section title="Resize handle" description="A splitter between two panes: drag, arrow keys, Home and End; double-click or Enter folds the pane." flush>
          <div class="flex h-32 overflow-hidden rounded-xl ring-1 ring-foreground/10">
            <div class="min-w-0 flex-1 bg-background p-4 text-ui text-foreground/65">Content</div>
            <ResizeHandle
              axis="column"
              label="Panel width"
              size={pane.size}
              min={96}
              max={240}
              rest={0}
              collapsed={pane.collapsed}
              onpreview={(size, collapsed) => (pane = { size: collapsed ? pane.size : size, collapsed })}
              oncommit={(size, collapsed) => (pane = { size, collapsed })}
            />
            <div class="shrink-0 overflow-hidden bg-background-light p-4 text-ui text-foreground/65" style:width="{pane.collapsed ? 0 : pane.size}px">Panel</div>
          </div>
        </Section>
      {:else if section.value === "actions"}
        <Section title="Button variants" description="One primary action per view. Danger only for destructive actions.">
          {#each ["md", "sm", "lg"] as const as size (size)}
            <div class="flex flex-wrap items-center gap-2 px-4 py-3">
              <Button variant="primary" {size}><PaperPlaneTiltIcon weight="bold" /> Primary</Button>
              <Button variant="secondary" {size}>Secondary</Button>
              <Button variant="quiet" {size}>Quiet</Button>
              <Button variant="danger" {size}><TrashIcon weight="bold" /> Danger</Button>
              <Button {size} disabled>Disabled</Button>
              <span class="ml-auto">{@render specimen(size)}</span>
            </div>
          {/each}
        </Section>
        <Section title="Icon buttons" description="Always labelled: the label is the tooltip and the accessible name.">
          <div class="flex flex-wrap items-center gap-2 px-4 py-3">
            <IconButton label="Add"><PlusIcon weight="bold" /></IconButton>
            <IconButton label="Open folder" variant="secondary"><FolderIcon weight="bold" /></IconButton>
            <IconButton label="Send" variant="primary"><PaperPlaneTiltIcon weight="bold" /></IconButton>
            <IconButton label="Delete" variant="danger"><TrashIcon weight="bold" /></IconButton>
          </div>
        </Section>
        <Section title="Toggles" description="pressed: a button that stays on. Sets aria-pressed and the primary tint; the label stays the same.">
          <div class="flex flex-wrap items-center gap-2 px-4 py-3">
            <Button size="sm" variant="quiet" pressed={bold} onclick={() => (bold = !bold)}>Bold</Button>
            <Button size="sm" variant="quiet" pressed={italic} onclick={() => (italic = !italic)}>Italic</Button>
            <IconButton label="Large text" size="sm" pressed={large} onclick={() => (large = !large)}><TextAaIcon weight="bold" /></IconButton>
            <span class="flex gap-1" role="group" aria-label="Tool">
              <IconButton label="Pencil" size="sm" pressed={tool === "pencil"} onclick={() => (tool = "pencil")}>
                <PencilSimpleIcon weight={tool === "pencil" ? "fill" : "bold"} />
              </IconButton>
              <IconButton label="Eraser" size="sm" pressed={tool === "eraser"} onclick={() => (tool = "eraser")}>
                <EraserIcon weight={tool === "eraser" ? "fill" : "bold"} />
              </IconButton>
            </span>
          </div>
        </Section>
        <Section title="Copy button" description="Copies text to the clipboard, shows Copied for a moment, disabled while there's nothing to copy.">
          <div class="flex flex-wrap items-center gap-3 px-4 py-3">
            <code class="font-mono text-ui">3f9a1c2e</code>
            <CopyButton text="3f9a1c2e" label="Copy hash" />
            <span class="ml-auto flex items-center gap-2 text-ui text-foreground/65">Nothing to copy <CopyButton text="" /></span>
          </div>
        </Section>
      {:else if section.value === "inputs"}
        <Section title="Fields" description="Recessed in dark themes, raised paper in light ones (light-dark()); a 30% ring marks the edge.">
          <SettingRow label="Name">
            {#snippet children({ id })}<Input {id} bind:value={name} class="w-56" />{/snippet}
          </SettingRow>
          <SettingRow label="Search" description="With a leading icon">
            {#snippet children({ id, describedby })}
              <Input {id} aria-describedby={describedby} bind:value={query} placeholder="Search apps" class="w-56">
                {#snippet leading()}<MagnifyingGlassIcon weight="bold" />{/snippet}
              </Input>
            {/snippet}
          </SettingRow>
          <SettingRow label="Sort by" description="Customizable native select">
            {#snippet children({ id, describedby })}
            <Select
              {id}
              aria-describedby={describedby}
              bind:value={sort}
              class="w-40"
              options={[
                { value: "name", label: "Name" },
                { value: "size", label: "Size" },
                { value: "date", label: "Date modified" },
              ]}
            />
            {/snippet}
          </SettingRow>
          <SettingRow label="View" description="Segmented: a radio group drawn as one control; arrow keys move the choice">
            {#snippet children({ id, describedby })}
              <Segmented {id} aria-describedby={describedby} label="View" bind:value={view} options={[{ value: "list", label: "List" }, { value: "grid", label: "Grid" }]} />
            {/snippet}
          </SettingRow>
          <SettingRow label="Speed" description="Segmented sm: in a toolbar, next to sm buttons">
            {#snippet children({ id, describedby })}
              <Segmented
                {id}
                aria-describedby={describedby}
                size="sm"
                label="Speed"
                bind:value={speed}
                options={[
                  { value: "slow", label: "Slow" },
                  { value: "normal", label: "Normal" },
                  { value: "fast", label: "Fast" },
                ]}
              />
            {/snippet}
          </SettingRow>
          <SettingRow label="Volume" description="Slider: a native range input, md and sm">
            {#snippet children({ id, describedby })}
              <span class="flex w-56 flex-col">
                <Slider {id} aria-describedby={describedby} min={0} max={100} bind:value={volume} class="w-full" />
                <Slider aria-label="Volume (small)" size="sm" min={0} max={100} bind:value={volume} class="w-full" />
              </span>
            {/snippet}
          </SettingRow>
          <SettingRow label="Notifications" description="Switch: on/off that applies immediately">
            {#snippet children({ id, describedby })}<Switch {id} aria-describedby={describedby} bind:checked={notify} />{/snippet}
          </SettingRow>
          <SettingRow label="Compact rows">
            {#snippet children({ id })}<Switch {id} bind:checked={compact} />{/snippet}
          </SettingRow>
          <SettingRow label="Checkbox" description="For choices that apply on submit">
            <label class="flex items-center gap-2 text-ui"><Checkbox bind:checked={agree} /> Remember this</label>
          </SettingRow>
        </Section>
        <Section title="Text area" description="The field surface over several lines; mono for code and data, without spellcheck.">
          <div class="flex flex-col gap-3 p-4">
            <Textarea bind:value={notes} rows={3} aria-label="Notes" placeholder="Notes" />
            <Textarea mono value={'{ "name": "Notes", "size": 1420 }'} rows={3} readonly aria-label="JSON" />
          </div>
        </Section>
      {:else if section.value === "kit"}
        <Section
          title="Swipe compare"
          description="Two versions of a picture under one divider, from $kit: drag or use the slider to wipe, pinch or Ctrl+scroll to zoom, drag to pan when zoomed in."
          flush
        >
          <div class="flex h-72 flex-col overflow-hidden rounded-xl bg-background-darker ring-1 ring-foreground/10">
            <SwipeCompare width={320} height={200} left={sharp} right={blurred} left_label="Sharp" right_label="Blurred" bind:split class="flex-1" />
          </div>
        </Section>
        <Section
          title="Crop frame"
          description="A crop over a picture at any scale, from $kit: drag inside to move, drag a handle to resize, arrow keys move and Shift+arrows resize. Image Editor's crop uses it."
          flush
        >
          <div class="flex flex-col gap-2">
            <div class="relative aspect-[320/200] w-full max-w-sm overflow-hidden rounded-xl ring-1 ring-foreground/10">
              {@render sharp()}
              <CropFrame bind:rect={crop} bounds={{ width: 320, height: 200 }} />
            </div>
            <span class="font-mono text-2xs text-foreground/80 tabular-nums">{Math.round(crop.width)} × {Math.round(crop.height)} at {Math.round(crop.x)}, {Math.round(crop.y)}</span>
          </div>
        </Section>
        <Section
          title="Quad frame"
          description="Four corners over a picture, from $kit: drag a corner or focus it and use the arrow keys (Shift for bigger steps) to line it up with a skewed page; a magnifier shows the picture under a dragged corner. Font Maker's scan step, Doc Scan and Shopping List's photo step use it."
          flush
        >
          <div class="flex flex-col gap-2">
            <QuadFrame bind:quad image={{ src: paper_photo, width: 320, height: 200 }} alt="A sheet of paper on a table" loupe class="aspect-[320/200] w-full max-w-sm overflow-hidden rounded-xl ring-1 ring-foreground/10" />
            <span class="font-mono text-2xs text-foreground/80 tabular-nums">{quad.map((corner) => `${Math.round(corner.x)},${Math.round(corner.y)}`).join("  ")}</span>
          </div>
        </Section>
        <Section
          title="Drop zone"
          description="A panel that takes files, from $kit: drag files from File Explorer or the device onto it, or paste one, and it lists what arrived. PDF Tools and Doc Scan use it."
          flush
        >
          <DropZone ondrop={(sources) => (dropped = sources)} label="Drop files here" accept={[]} multiple active class="grid min-h-28 max-w-sm place-items-center rounded-xl bg-background-darker p-4 text-center text-ui text-foreground/80 ring-1 ring-foreground/10">
            {#if dropped.length}
              <span class="font-mono text-2xs tabular-nums">{dropped.map((source) => source.path ?? source.name).join(", ")}</span>
            {:else}
              Drop or paste files here
            {/if}
          </DropZone>
        </Section>
        <Section
          title="Waveform"
          description="A sound to trim and cut, from $kit: drag the tabs below the sound to trim and the tabs in the ruler to move the selection; a grabbed tab gets ◀ ▶ nudges and a millisecond readout. Drag along the ruler or across the sound to select (touch and hold when zoomed in on touch), Esc clears it. Zoom with the buttons, Ctrl+scroll or a pinch, and scroll sideways. Soundboard's Edit audio uses it."
          flush
        >
          <div class="flex flex-col gap-2">
            <Waveform pcm={wave} bind:start={trim.start} bind:end={trim.end} bind:selection={wave_selection} playhead={1.4} label="Demo sound" class="max-w-sm" />
            <span class="font-mono text-2xs text-foreground/80 tabular-nums"
              >{trim.start.toFixed(2)}–{trim.end.toFixed(2)} s{wave_selection ? `, selected ${wave_selection.start.toFixed(2)}–${wave_selection.end.toFixed(2)} s` : ""}</span
            >
          </div>
        </Section>
        <Section
          title="AI gate"
          description="Wraps an app that needs on-device AI, from $kit: checking, then why it's unavailable or a one-time download notice, then the app. Live on this device. Ask uses it."
          flush
        >
          <div class="flex h-72 max-w-sm flex-col overflow-auto rounded-xl bg-background ring-1 ring-foreground/10">
            <AiGate features={["prompt"]} title="This app isn't available on this device">
              {#snippet children({ notice })}
                {@render notice?.()}
                <div class="grid flex-1 place-items-center p-4 text-ui text-foreground/80">The app goes here</div>
              {/snippet}
            </AiGate>
          </div>
        </Section>
        <Section
          title="AI icon"
          description="An app that needs on-device AI wraps its icon in ai_icon, from $kit: a primary sparkle cut into the top-right corner, in the same box, so every place that draws the icon shows it. Ask, Unsaid, Doodlehop and Alibi use it."
          flush
        >
          <div class="flex flex-col gap-3">
            {#each AI_ICON_SIZES as size (size)}
              <div class="flex items-center gap-4">
                {#each ai_icons as Icon, index (index)}
                  <Icon class={size} weight="duotone" />
                {/each}
                <span class="font-mono text-2xs text-foreground/65">{size}</span>
              </div>
            {/each}
            <div class="flex w-fit items-center gap-4 rounded-lg bg-primary/15 px-3 py-2 text-primary">
              {#each ai_icons as Icon, index (index)}
                <Icon class="size-6" weight="fill" />
              {/each}
              <span class="font-mono text-2xs">primary ink</span>
            </div>
          </div>
        </Section>
        <Section
          title="QR frames"
          description="Data too big for one QR code as a cycle of codes, from $kit: the other phone's QrCollect gathers them in any order. Shopping List and Cards share with it."
        >
          {#await encode_frames("DEMO", { lists: Array.from({ length: 12 }, (_, index) => ({ id: crypto.randomUUID(), name: `List ${index + 1}` })) }) then frames}
            <QrFrames {frames} label="Demo share" />
          {/await}
        </Section>
      {:else}
        <Section title="Badges" flush>
          <div class="flex flex-wrap gap-2">
            <Badge>neutral</Badge>
            <Badge tone="primary">primary</Badge>
            <Badge tone="success">success</Badge>
            <Badge tone="warning">warning</Badge>
            <Badge tone="error">error</Badge>
            <Badge tone="info">info</Badge>
          </div>
        </Section>
        <Section title="Keys and progress" flush>
          <div class="flex flex-wrap items-center gap-4 text-ui">
            <span class="flex items-center gap-1"><Kbd>⌘</Kbd><Kbd>K</Kbd> search</span>
            <span class="flex items-center gap-2"><Spinner /> Loading</span>
          </div>
        </Section>
        <Section title="Board overlay" description="A game's pause and end screen over its board: title, one mono line, actions with the primary last." flush>
          <div class="relative size-56 overflow-hidden rounded-lg bg-background-darker ring-1 ring-foreground/8">
            <div class="grid size-full grid-cols-4 gap-1.5 p-2">
              {#each Array.from({ length: 16 }, (_, i) => i) as cell (cell)}<span class="rounded-md bg-foreground/8"></span>{/each}
            </div>
            <BoardOverlay title="Game over" detail="Score 1234 · Best 2048">
              <Button size="sm" variant="quiet">Undo</Button>
              <Button size="sm" variant="primary">New game</Button>
            </BoardOverlay>
          </div>
        </Section>
        <Section
          title="App announcement"
          description="Shown once after an update that adds apps: a page per app with Later and Open, or one list past four. Highlights and the preview come from the manifest."
        >
          <div class="flex flex-col items-center gap-3">
            <AppAnnouncement apps={sample_apps} resolve={() => {}} inline class="max-w-full shadow-raised" />
            <div class="flex flex-wrap justify-center gap-2">
              <Button size="sm" onclick={() => dialogs.show(AppAnnouncement, { apps: sample_apps })}>Show as dialog</Button>
              <Button size="sm" onclick={() => dialogs.show(AppAnnouncement, { apps: many_apps })}>Show with {many_apps.length} apps</Button>
            </div>
          </div>
        </Section>
        <Section
          title="Bottom sheet"
          description="A grabber on top; by touch it follows the finger down and closes past a quarter of its height or on a flick, otherwise springs back. The list scrolls first. Back, the scrim and Done close it too."
          flush
        >
          <div class="relative h-72 overflow-hidden rounded-lg bg-background-darker ring-1 ring-foreground/8">
            <div class="grid size-full place-items-center">
              <Button size="sm" onclick={() => (sheet_open = true)}>Open sheet</Button>
            </div>
            {#if sheet_open}
              <div class="absolute inset-0 flex flex-col justify-end">
                <button type="button" tabindex="-1" aria-label="Close" class="absolute inset-0 bg-(--overlay)" onclick={() => (sheet_open = false)}></button>
                <div
                  role="dialog"
                  aria-label="Sample sheet"
                  class="relative flex max-h-[85%] flex-col overflow-hidden rounded-t-2xl bg-background-light shadow-raised ring-1 ring-foreground/10 motion-safe:animate-sheet-in"
                  {@attach swipe_dismiss({ on_dismiss: () => (sheet_open = false) })}
                >
                  <Grabber class="mt-2 mb-1" />
                  <ul class="min-h-0 flex-1 overflow-y-auto px-2">
                    {#each Array.from({ length: 12 }, (_, i) => i + 1) as row (row)}
                      <li class="flex h-10 items-center px-2 text-ui">Row {row}</li>
                    {/each}
                  </ul>
                  <div class="flex justify-end border-t border-foreground/8 p-2">
                    <Button size="sm" variant="primary" onclick={() => (sheet_open = false)}>Done</Button>
                  </div>
                </div>
              </div>
            {/if}
          </div>
        </Section>
        <Section title="Empty state" description="Icon tile, one line of title, one of help, optional actions. Errors tint the icon only and tuck the raw error into Details.">
          <EmptyState icon={FolderIcon} title="This folder is empty" description="Upload files or create a folder from the toolbar." class="py-8">
            {#snippet actions()}<Button size="sm" variant="primary"><PlusIcon weight="bold" /> New folder</Button>{/snippet}
          </EmptyState>
          <EmptyState
            icon={WarningIcon}
            tone="error"
            title="Paint didn't load"
            description="Its code didn't download. The connection may have dropped, or WebOS changed since this page opened."
            details={"TypeError: Failed to fetch dynamically imported module: https://example.com/webos/assets/paint-3f2a.js"}
            class="py-8"
          >
            {#snippet actions()}<Button size="sm" variant="primary">Try again</Button><Button size="sm" variant="quiet">Close window</Button>{/snippet}
          </EmptyState>
        </Section>
      {/if}
    </div>
  </main>
</SideNav>
