<script lang="ts">
  import kernel, { type AppListing, type AppsService, type DialogsService } from "$lib/core/api";
  import { get_app_context } from "$lib/core/contexts/app";
  import AppAnnouncement, { type AnnouncedApp } from "$lib/core/components/announcement/app-announcement.svelte";
  import {
    Badge,
    BoardOverlay,
    Button,
    Checkbox,
    CopyButton,
    EmptyState,
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
  } from "phosphor-svelte";
  import { z } from "zod";
  import { CropFrame } from "$kit/components/crop-frame";
  import { SwipeCompare } from "$kit/components/swipe-compare";
  import { QrFrames } from "$kit/components/qr-transfer";
  import { Waveform, type Span } from "$kit/components/waveform";
  import type { Pcm } from "$kit/utils/audio";
  import { encode_frames } from "$kit/utils/qr-transfer";

  const SECTIONS = [
    { value: "colour", label: "Colour", icon: SwatchesIcon },
    { value: "type", label: "Type", icon: TextAaIcon },
    { value: "surfaces", label: "Surfaces", icon: StackIcon },
    { value: "actions", label: "Actions", icon: CursorClickIcon },
    { value: "inputs", label: "Inputs", icon: SquaresFourIcon },
    { value: "feedback", label: "Feedback", icon: BellIcon },
    { value: "kit", label: "App kit", icon: ToolboxIcon },
  ] as const;
  type SectionId = (typeof SECTIONS)[number]["value"];

  const { storage } = get_app_context();
  const section = storage.window<SectionId>("section", "colour", z.enum(SECTIONS.map((item) => item.value)));
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
  let split = $state(50);
  let crop = $state({ x: 60, y: 40, width: 200, height: 120 });
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

  // Paint with made-up highlights, so the cards and the "Start menu" strip both show.
  const SAMPLE_HIGHLIGHTS = [
    { icon: PaintBrushIcon, title: "Brushes and pencil", text: "Draw freehand at any size, with smoothing for steady lines." },
    { icon: PaintBucketIcon, title: "Fill", text: "Flood an area with the current colour in one click." },
    { icon: ShapesIcon, title: "Shapes and text", text: "Lines, rectangles, ellipses and text on their own layer until placed." },
    { icon: FloppyDiskIcon, title: "Your files", text: "Opens and saves PNG, JPEG and WebP in your folders." },
  ];
  const pick = (id: string) => apps.listings().find((listing) => listing.id === id);
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

<div class="flex h-full flex-col @2xl:flex-row">
  <SideNav label="Style guide sections" items={[...SECTIONS]} bind:value={section.value} />

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
          description="A crop over a picture at any scale, from $kit: drag inside to move, drag a handle to resize, arrow keys move and Shift+arrows resize. Image Editor's crop and Shopping List's photo step use it."
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
          title="Waveform"
          description="A sound to trim and cut, from $kit: drag the handles to trim, drag across the middle to select, Esc clears the selection. Soundboard's Edit audio uses it."
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
        <Section title="Empty state" description="Icon tile, one line of title, one of help, optional action.">
          <EmptyState icon={FolderIcon} title="This folder is empty" description="Upload files or create a folder from the toolbar." class="py-8">
            {#snippet actions()}<Button size="sm" variant="primary"><PlusIcon weight="bold" /> New folder</Button>{/snippet}
          </EmptyState>
        </Section>
      {/if}
    </div>
  </main>
</div>
