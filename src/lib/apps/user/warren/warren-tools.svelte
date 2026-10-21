<script lang="ts">
  import kernel, { AiAvailability, BUILTIN_FONTS, FONT_DIRECTORY, type AiService, type FilesService, type FontChoice, type SettingsService } from "$lib/core/api";
  import { PATHS } from "$lib/core/api/services/files/hierarchy";
  import { Button, IconButton, Input, Segmented, Select, Spinner, Switch } from "$lib/core/components/ui";
  import { error_message } from "$lib/core/utils";
  import {
    ArrowsClockwise as ArrowsClockwiseIcon,
    CaretRight as CaretRightIcon,
    Eraser as EraserIcon,
    Image as ImageIcon,
    Trash as TrashIcon,
    ListChecks as ListChecksIcon,
    Minus as MinusIcon,
    FileDoc as FileDocIcon,
    FilePdf as FilePdfIcon,
    Link as LinkIcon,
    MagnifyingGlass as MagnifyingGlassIcon,
    ListBullets as ListBulletsIcon,
    ListNumbers as ListNumbersIcon,
    Scissors as ScissorsIcon,
    Sparkle as SparkleIcon,
    TextB as TextBIcon,
    TextAlignCenter as TextAlignCenterIcon,
    TextAlignJustify as TextAlignJustifyIcon,
    TextAlignLeft as TextAlignLeftIcon,
    TextAlignRight as TextAlignRightIcon,
    TextItalic as TextItalicIcon,
    TextStrikethrough as TextStrikethroughIcon,
    TextSubscript as TextSubscriptIcon,
    TextSuperscript as TextSuperscriptIcon,
    TextUnderline as TextUnderlineIcon,
  } from "phosphor-svelte";
  import type { Snippet } from "svelte";
  import { z } from "zod";
  import { BlockStyle, Zone, type Margin, type WarrenEditor } from "./editor.svelte";
  import { Align, PAGE_TOKEN, PAGES_TOKEN } from "./model";
  import { GOAL_MAX } from "./format";
  import {
    FLOWS,
    FONT_SIZES,
    geometry,
    MARGIN_MAX,
    margin_preset,
    MarginPreset,
    ORIENTATIONS,
    PAGE_SIZES,
    preset_margins,
    type Flow,
    type Margins,
    type Orientation,
    type PageSize,
  } from "./page";
  import { find_word, reading_minutes, type Counts, type Repeat } from "./words";

  interface Props {
    editor: WarrenEditor;
    text: string;
    counts: Counts;
    repeats: Repeat[];
    open: Record<string, boolean>;
    ontoggle: (group: string, open: boolean) => void;
    onexport: (format: "docx" | "pdf") => void;
    onchanged: (count: number, word: string) => void;
    onlink: () => void;
    link_anchor: string;
    onfind: () => void;
    /** Counts of the selected text; `null` for a caret. */
    selection: Counts | null;
    smart: boolean;
    onsmart: (on: boolean) => void;
    /** A heading was picked in the outline. */
    ongo: (key: string) => void;
    onpicture: (event: MouseEvent) => void;
    /** Switching off a header or footer that has content asks first. */
    onzone: (zone: Margin, on: boolean) => void;
    units: Unit;
    onunits: (units: Unit) => void;
  }

  type Unit = "mm" | "in";

  let { editor, text, counts, repeats, open, ontoggle, onexport, onchanged, onlink, link_anchor, onfind, selection, smart, onsmart, ongo, onpicture, onzone, units, onunits }: Props = $props();

  const ai = $derived(kernel.service<AiService>("ai"));
  const settings = $derived(kernel.service<SettingsService>("settings"));
  const files = $derived(kernel.service<FilesService>("files"));

  let installed = $state<string[]>([]);

  $effect(() => {
    void files.revision(FONT_DIRECTORY);
    void files.revision(PATHS.etc);
    let stale = false;
    settings.installed_fonts().then((names) => !stale && (installed = names));
    return () => (stale = true);
  });

  const encode_font = (choice: FontChoice | undefined) =>
    !choice || choice.kind === "default" ? "default" : choice.kind === "builtin" ? `builtin:${choice.id}` : `file:${choice.name}`;

  function decode_font(value: string): FontChoice | undefined {
    if (value.startsWith("builtin:")) return { kind: "builtin", id: value.slice(8) };
    if (value.startsWith("file:")) return { kind: "file", name: value.slice(5) };
    return undefined;
  }

  const font_options = $derived.by(() => {
    const current = editor.page.font;
    const names = current?.kind === "file" && !installed.includes(current.name) ? [...installed, current.name] : installed;
    return [
      { value: "default", label: "Inter" },
      ...Object.entries(BUILTIN_FONTS).map(([id, font]) => ({ value: `builtin:${id}`, label: font.name })),
      ...names.map((name) => ({ value: `file:${name}`, label: name.replace(/\.[^.]+$/, "") })),
    ];
  });
  const ai_on = $derived(ai.features.prompt !== AiAvailability.NO);

  const ORIENTATION_OPTIONS = ORIENTATIONS.map((value) => ({ value, label: value === "portrait" ? "Portrait" : "Landscape" }));
  const MARGIN_OPTIONS = [
    { value: MarginPreset.NORMAL, label: "Normal" },
    { value: MarginPreset.NARROW, label: "Narrow" },
    { value: MarginPreset.WIDE, label: "Wide" },
    { value: MarginPreset.CUSTOM, label: "Custom" },
  ];
  const UNIT_OPTIONS: { value: Unit; label: string }[] = [
    { value: "mm", label: "mm" },
    { value: "in", label: "in" },
  ];
  const SIDES = [
    { key: "top", label: "Top" },
    { key: "bottom", label: "Bottom" },
    { key: "left", label: "Left" },
    { key: "right", label: "Right" },
  ] as const;
  const ZONES = [
    { zone: Zone.HEADER, label: "Header", hint: "On every page, above the text" },
    { zone: Zone.FOOTER, label: "Footer", hint: "On every page, below the text" },
  ] as const;
  const NUMBER_OPTIONS = [
    { value: "none", label: "None" },
    { value: "footer:center", label: "Bottom, centre" },
    { value: "footer:right", label: "Bottom, right" },
    { value: "footer:left", label: "Bottom, left" },
    { value: "header:right", label: "Top, right" },
    { value: "header:center", label: "Top, centre" },
    { value: "header:left", label: "Top, left" },
  ];
  const WIDTH_PRESETS = [25, 50, 75, 100];
  const PICTURE_ALIGN_BUTTONS = [
    { value: Align.LEFT, label: "Picture left", icon: TextAlignLeftIcon },
    { value: Align.CENTER, label: "Picture centred", icon: TextAlignCenterIcon },
    { value: Align.RIGHT, label: "Picture right", icon: TextAlignRightIcon },
  ] as const;

  let custom = $state(false);
  const preset = $derived(custom ? MarginPreset.CUSTOM : margin_preset(editor.page));
  const margins = $derived(geometry(editor.page).margins);
  const numbers = $derived(editor.page_numbers ? `${editor.page_numbers.zone}:${editor.page_numbers.align}` : "none");
  const in_zone = $derived(editor.active !== Zone.BODY);

  const to_unit = (mm: number) => (units === "in" ? Math.round((mm / 25.4) * 100) / 100 : Math.round(mm * 10) / 10);
  const from_unit = (value: number) => (units === "in" ? value * 25.4 : value);

  function pick_preset(value: string) {
    custom = value === MarginPreset.CUSTOM;
    if (value === MarginPreset.NORMAL) editor.set_page({ margins: undefined });
    else if (value === MarginPreset.NARROW || value === MarginPreset.WIDE) editor.set_page({ margins: preset_margins(value, editor.page.size) });
  }

  function set_margin(side: keyof Margins, field: HTMLInputElement) {
    const value = from_unit(Number(field.value));
    if (!field.value.trim() || !Number.isFinite(value)) {
      field.value = String(to_unit(margins[side]));
      return;
    }
    const mm = Math.min(MARGIN_MAX, Math.max(0, Math.round(value * 10) / 10));
    custom = true;
    editor.set_page({ margins: { ...margins, [side]: mm } });
    field.value = String(to_unit(mm));
  }

  function set_numbers(value: string) {
    if (value === "none") return editor.set_page_numbers(null);
    const [zone, align] = value.split(":") as [Margin, Align];
    editor.set_page_numbers({ zone, align });
  }

  const SIZE_OPTIONS = FONT_SIZES.map((size) => ({ value: String(size), label: `${size} pt` }));
  const PAGE_OPTIONS = PAGE_SIZES.map((size) => ({ value: size, label: size }));
  const FLOW_LABELS: Record<Flow, string> = { sheets: "Sheets", continuous: "Continuous" };
  const FLOW_OPTIONS = FLOWS.map((flow) => ({ value: flow, label: FLOW_LABELS[flow] }));
  const ALIGN_BUTTONS = [
    { value: Align.LEFT, label: "Align left", icon: TextAlignLeftIcon },
    { value: Align.CENTER, label: "Centre", icon: TextAlignCenterIcon },
    { value: Align.RIGHT, label: "Align right", icon: TextAlignRightIcon },
    { value: Align.JUSTIFY, label: "Justify", icon: TextAlignJustifyIcon },
  ];
  const SCRIPT_BUTTONS = [
    { label: "Strikethrough (Mod+Shift+X)", icon: TextStrikethroughIcon, pressed: () => editor.strike, run: () => editor.toggle_strike() },
    { label: "Subscript (Mod+Shift+,)", icon: TextSubscriptIcon, pressed: () => editor.subscript, run: () => editor.toggle_subscript() },
    { label: "Superscript (Mod+Shift+.)", icon: TextSuperscriptIcon, pressed: () => editor.superscript, run: () => editor.toggle_superscript() },
  ];
  const STYLES = [
    { value: BlockStyle.PARAGRAPH, label: "Body" },
    { value: BlockStyle.H1, label: "H1" },
    { value: BlockStyle.H2, label: "H2" },
    { value: BlockStyle.H3, label: "H3" },
  ];

  let replacement = $state("");
  let synonyms = $state<{ word: string; list: string[] } | null>(null);
  let thinking = $state(false);
  let ai_error = $state("");

  const word = $derived(editor.word);
  const occurrences = $derived(word ? find_word(text, word).length : 0);
  const size_options = $derived(
    SIZE_OPTIONS.some((option) => option.value === String(editor.size)) ? SIZE_OPTIONS : [{ value: String(editor.size), label: `${editor.size} pt` }, ...SIZE_OPTIONS]
  );

  const keep_focus = (event: PointerEvent) => event.preventDefault();
  const smart_id = $props.id();
  const zone_id = `${smart_id}-zone`;

  function commit_goal(field: HTMLInputElement) {
    const value = Math.round(Number(field.value.trim()));
    const goal = field.value.trim() && Number.isFinite(value) && value > 0 ? Math.min(value, GOAL_MAX) : null;
    editor.set_goal(goal);
    field.value = goal ? String(goal) : "";
  }

  function change_everywhere() {
    const target = replacement.trim();
    if (!word || !target) return;
    onchanged(editor.change_everywhere(word, target), word);
    replacement = "";
  }

  function change_here() {
    const target = replacement.trim();
    if (!target) return;
    editor.replace_word_here(target);
    editor.focus();
    replacement = "";
  }

  async function suggest() {
    const asked = word;
    thinking = true;
    ai_error = "";
    try {
      const result = await ai.extract(
        [
          { role: "system", content: "You are a thesaurus. Give up to eight single words or short phrases that mean the same as the given word, most common first." },
          { role: "user", content: `Synonyms for "${asked}".` },
        ],
        z.object({ synonyms: z.array(z.string().min(1).max(40)).max(8) })
      );
      synonyms = { word: asked, list: result.synonyms.filter((item) => item.toLowerCase() !== asked.toLowerCase()) };
    } catch (reason) {
      ai_error = error_message(reason);
    } finally {
      thinking = false;
    }
  }
</script>

{#snippet group(id: string, title: string, body: Snippet)}
  <details class="group/tools border-b border-foreground/8" open={open[id] ?? true} ontoggle={(event) => ontoggle(id, event.currentTarget.open)}>
    <summary class="flex h-9 cursor-pointer list-none items-center gap-1.5 px-3 text-2xs font-semibold tracking-wide text-foreground/65 uppercase select-none hover:text-foreground pointer-coarse:h-11 [&::-webkit-details-marker]:hidden">
      <CaretRightIcon weight="bold" class="size-3 transition-transform group-open/tools:rotate-90" />
      {title}
    </summary>
    <div class="flex flex-col gap-2 px-3 pb-3">
      {@render body()}
    </div>
  </details>
{/snippet}

{#snippet text_group()}
  <div class="flex items-center gap-1">
    <IconButton label="Bold (Mod+B)" pressed={editor.bold} onpointerdown={keep_focus} onclick={() => editor.toggle_bold()}><TextBIcon weight="bold" /></IconButton>
    <IconButton label="Italic (Mod+I)" pressed={editor.italic} onpointerdown={keep_focus} onclick={() => editor.toggle_italic()}><TextItalicIcon weight="bold" /></IconButton>
    <IconButton label="Underline (Mod+U)" pressed={editor.underline} onpointerdown={keep_focus} onclick={() => editor.toggle_underline()}><TextUnderlineIcon weight="bold" /></IconButton>
    <IconButton label={editor.link ? "Edit link" : "Add link"} pressed={!!editor.link} style="anchor-name: {link_anchor}" onpointerdown={keep_focus} onclick={onlink}><LinkIcon weight="bold" /></IconButton>
  </div>
  <div class="flex items-center gap-1">
    {#each SCRIPT_BUTTONS as button (button.label)}
      <IconButton label={button.label} pressed={button.pressed()} onpointerdown={keep_focus} onclick={button.run}><button.icon weight="bold" /></IconButton>
    {/each}
    <IconButton label="Clear formatting (Mod+\)" onpointerdown={keep_focus} onclick={() => editor.clear_formatting()}><EraserIcon weight="bold" /></IconButton>
  </div>
  <div class="flex items-center gap-1">
    <Select
      size="sm"
      class="min-w-0 flex-1"
      aria-label="Document font"
      title="Font for the whole document. Add fonts in Settings › Appearance › Fonts."
      value={encode_font(editor.page.font)}
      options={font_options}
      onchange={(event) => {
        editor.set_page({ font: decode_font(event.currentTarget.value) });
        editor.focus();
      }}
    />
    <Select
      size="sm"
      class="w-24 shrink-0"
      aria-label="Font size"
      value={String(editor.size)}
      options={size_options}
      onchange={(event) => {
        editor.set_size(Number(event.currentTarget.value));
        editor.focus();
      }}
    />
  </div>
  <label for={smart_id} class="flex min-h-8 cursor-pointer items-center justify-between gap-2 text-ui pointer-coarse:min-h-11">
    <span>Smart quotes and dashes <span class="block text-2xs text-foreground/65">“curly” quotes, -- to –, ... to …</span></span>
    <Switch id={smart_id} checked={smart} onchange={(event) => onsmart(event.currentTarget.checked)} />
  </label>
{/snippet}

{#snippet paragraph_group()}
  <div class="grid grid-cols-4 gap-1">
    {#each STYLES as style (style.value)}
      <Button size="sm" variant="quiet" pressed={editor.block === style.value} onpointerdown={keep_focus} onclick={() => editor.set_block(style.value)}>{style.label}</Button>
    {/each}
  </div>
  <div class="grid grid-cols-4 gap-1" role="group" aria-label="Alignment">
    {#each ALIGN_BUTTONS as item (item.value)}
      <IconButton label={item.label} class="w-full" pressed={editor.align === item.value} onpointerdown={keep_focus} onclick={() => editor.set_align(item.value)}><item.icon weight="bold" /></IconButton>
    {/each}
  </div>
  <div class="grid grid-cols-3 gap-1">
    <Button size="sm" variant="quiet" class="px-1" pressed={editor.block === BlockStyle.BULLET} onpointerdown={keep_focus} onclick={() => editor.set_block(BlockStyle.BULLET)}>
      <ListBulletsIcon weight="bold" />Bullets
    </Button>
    <Button size="sm" variant="quiet" class="px-1" pressed={editor.block === BlockStyle.NUMBER} onpointerdown={keep_focus} onclick={() => editor.set_block(BlockStyle.NUMBER)}>
      <ListNumbersIcon weight="bold" />Numbers
    </Button>
    <Button size="sm" variant="quiet" class="px-1" pressed={editor.block === BlockStyle.CHECK} onpointerdown={keep_focus} onclick={() => editor.set_block(BlockStyle.CHECK)}>
      <ListChecksIcon weight="bold" />Checks
    </Button>
  </div>
  <Button size="sm" onpointerdown={keep_focus} onclick={() => editor.insert_rule()}><MinusIcon weight="bold" />Insert horizontal line</Button>
{/snippet}

{#snippet page_group()}
  <Segmented size="sm" label="Page size" options={PAGE_OPTIONS} bind:value={() => editor.page.size, (size: PageSize) => editor.set_page({ size })} />
  <Segmented
    size="sm"
    label="Orientation"
    options={ORIENTATION_OPTIONS}
    bind:value={() => editor.page.orientation ?? "portrait", (orientation: Orientation) => editor.set_page({ orientation: orientation === "landscape" ? orientation : undefined })}
  />
  <label class="flex items-center justify-between gap-2 text-ui">
    <span>Margins</span>
    <Select size="sm" class="w-28" aria-label="Margins" value={preset} options={MARGIN_OPTIONS} onchange={(event) => pick_preset(event.currentTarget.value)} />
  </label>
  {#if preset === MarginPreset.CUSTOM}
    <div class="grid grid-cols-2 gap-1.5" role="group" aria-label="Custom margins">
      {#each SIDES as side (side.key)}
        <label class="flex min-w-0 flex-col gap-1 text-2xs text-foreground/65">
          <span>{side.label}</span>
          <Input
            size="sm"
            class="w-full text-right tabular-nums"
            type="number"
            min="0"
            step={units === "in" ? 0.05 : 1}
            inputmode="decimal"
            aria-label="{side.label} margin in {units === 'in' ? 'inches' : 'millimetres'}"
            value={to_unit(margins[side.key])}
            onchange={(event) => set_margin(side.key, event.currentTarget)}
          />
        </label>
      {/each}
    </div>
    <Segmented size="sm" label="Margin units" options={UNIT_OPTIONS} bind:value={() => units, onunits} />
  {/if}
  {#each ZONES as item (item.zone)}
    <label for="{zone_id}-{item.zone}" class="flex min-h-8 cursor-pointer items-center justify-between gap-2 text-ui pointer-coarse:min-h-11">
      <span>{item.label} <span class="block text-2xs text-foreground/65">{item.hint}</span></span>
      <Switch id="{zone_id}-{item.zone}" checked={editor.has(item.zone)} onchange={(event) => onzone(item.zone, event.currentTarget.checked)} />
    </label>
  {/each}
  <label class="flex flex-col gap-1 text-ui">
    <span>Page numbers</span>
    <Select size="sm" class="w-full" aria-label="Page numbers" value={numbers} options={NUMBER_OPTIONS} onchange={(event) => set_numbers(event.currentTarget.value)} />
  </label>
  <div class="grid grid-cols-2 gap-1">
    <Button size="sm" disabled={!in_zone} title="Typed as {PAGE_TOKEN}; each page shows its own number" onpointerdown={keep_focus} onclick={() => editor.insert_token(PAGE_TOKEN)}>Page number</Button>
    <Button size="sm" disabled={!in_zone} title="Typed as {PAGES_TOKEN}; shows how many pages there are" onpointerdown={keep_focus} onclick={() => editor.insert_token(PAGES_TOKEN)}>Page count</Button>
  </div>
  {#if !in_zone}<p class="-mt-1 text-2xs text-foreground/65">Click into a header or footer to add page fields there.</p>{/if}
  <Segmented size="sm" label="Page flow" options={FLOW_OPTIONS} bind:value={() => editor.page.flow, (flow: Flow) => editor.set_page({ flow })} />
  <Button size="sm" onpointerdown={keep_focus} onclick={() => editor.insert_page_break()}><ScissorsIcon weight="bold" />Insert page break</Button>
{/snippet}

{#snippet picture_group()}
  <Button size="sm" disabled={editor.adding > 0} onpointerdown={keep_focus} onclick={onpicture}>
    {#if editor.adding}<Spinner label="Adding the picture" />{:else}<ImageIcon weight="bold" />{/if}Insert picture…
  </Button>
  {#if editor.image}
    {@const image = editor.image}
    <div class="flex items-center justify-between gap-2 text-ui">
      <span>Width</span>
      <span class="font-mono text-2xs text-foreground/65 tabular-nums">{image.width}%</span>
    </div>
    <div class="grid grid-cols-4 gap-1" role="group" aria-label="Picture width">
      {#each WIDTH_PRESETS as width (width)}
        <Button size="sm" variant="quiet" pressed={image.width === width} onpointerdown={keep_focus} onclick={() => editor.update_image({ width })}>{width}%</Button>
      {/each}
    </div>
    <div class="grid grid-cols-3 gap-1" role="group" aria-label="Picture alignment">
      {#each PICTURE_ALIGN_BUTTONS as item (item.value)}
        <IconButton label={item.label} class="w-full" pressed={image.align === item.value} onpointerdown={keep_focus} onclick={() => editor.update_image({ align: item.value })}><item.icon weight="bold" /></IconButton>
      {/each}
    </div>
    <label class="flex flex-col gap-1 text-ui">
      <span>Description <span class="text-2xs text-foreground/65">for screen readers and Word</span></span>
      <Input size="sm" placeholder="What the picture shows" value={image.alt} onchange={(event) => editor.update_image({ alt: event.currentTarget.value.trim() })} />
    </label>
    <Button size="sm" variant="quiet" onpointerdown={keep_focus} onclick={() => editor.remove_image()}><TrashIcon weight="bold" />Remove picture</Button>
  {:else}
    <p class="text-2xs text-foreground/65">Paste or drop pictures onto the page too. Click one to size, align or describe it.</p>
  {/if}
{/snippet}

{#snippet words_group()}
  <Button size="sm" onclick={onfind}><MagnifyingGlassIcon weight="bold" />Find and replace</Button>
  <p class="font-mono text-2xs text-foreground/80 tabular-nums">
    {counts.words.toLocaleString("en")} words · {counts.characters.toLocaleString("en")} characters{counts.words ? ` · ${reading_minutes(counts.words)} min read` : ""}
    {#if selection}<br />Selected: {selection.words.toLocaleString("en")} words · {selection.characters.toLocaleString("en")} characters{/if}
  </p>
  <label class="flex items-center justify-between gap-2 text-ui">
    <span>Word goal</span>
    <Input
      size="sm"
      class="w-24 text-right tabular-nums"
      type="number"
      min="1"
      max={GOAL_MAX}
      inputmode="numeric"
      placeholder="None"
      value={editor.goal ?? ""}
      onchange={(event) => commit_goal(event.currentTarget)}
    />
  </label>
  <div class="flex flex-col gap-1.5">
    {#if word}
      <p class="text-ui">
        <span class="text-foreground/65">Selected</span> <span class="font-medium">“{word}”</span>
        <span class="font-mono text-2xs text-foreground/65 tabular-nums">×{occurrences}</span>
      </p>
      <Input size="sm" placeholder="Change to…" aria-label="Change to" bind:value={replacement} onkeydown={(event) => event.key === "Enter" && change_everywhere()} />
      <div class="grid grid-cols-2 gap-1">
        <Button size="sm" disabled={!replacement.trim()} onclick={change_here}>This one</Button>
        <Button size="sm" variant="primary" disabled={!replacement.trim()} onclick={change_everywhere}><ArrowsClockwiseIcon weight="bold" />Everywhere</Button>
      </div>
      {#if ai_on}
        {#if synonyms?.word === word}
          {#if synonyms.list.length}
            <div class="flex flex-wrap gap-1" aria-label="Synonyms">
              {#each synonyms.list as synonym (synonym)}
                <Button size="sm" variant="quiet" class="bg-foreground/6" pressed={replacement === synonym} onclick={() => (replacement = synonym)}>{synonym}</Button>
              {/each}
            </div>
          {:else}
            <p class="text-2xs text-foreground/65">No synonyms for this one.</p>
          {/if}
        {:else}
          <Button size="sm" variant="quiet" disabled={thinking} onclick={suggest}>
            {#if thinking}<Spinner label="Finding synonyms" />{:else}<SparkleIcon weight="bold" />{/if}Suggest synonyms
          </Button>
        {/if}
        {#if ai_error}<p class="text-2xs text-error">{ai_error}</p>{/if}
      {/if}
    {:else}
      <p class="text-2xs text-foreground/65">Select a word to change it everywhere{ai_on ? " or find synonyms" : ""}.</p>
    {/if}
  </div>
  {#if repeats.length}
    <div class="flex flex-col">
      <p class="pt-1 pb-0.5 text-2xs text-foreground/65">Used most</p>
      {#each repeats as repeat (repeat.word)}
        <button
          type="button"
          class="flex h-8 items-center justify-between rounded-md px-2 text-left text-ui hover:bg-foreground/6 focus-visible:bg-primary/12 focus-visible:outline-none pointer-coarse:h-10"
          title="Select the next “{repeat.word}”"
          onclick={() => editor.select_next(repeat.word)}
        >
          <span class="truncate">{repeat.word}</span>
          <span class="font-mono text-2xs text-foreground/65 tabular-nums">×{repeat.count}</span>
        </button>
      {/each}
    </div>
  {/if}
{/snippet}

{#snippet outline_group()}
  {#if editor.outline.length}
    <nav class="flex flex-col" aria-label="Outline">
      {#each editor.outline as heading (heading.key)}
        <button
          type="button"
          class="flex h-8 min-w-0 items-center rounded-md pr-2 text-left text-ui hover:bg-foreground/6 focus-visible:bg-primary/12 focus-visible:outline-none pointer-coarse:h-11"
          class:font-semibold={heading.level === 1}
          style="padding-left: {0.5 + (heading.level - 1) * 0.875}rem"
          onclick={() => ongo(heading.key)}
        >
          <span class="truncate">{heading.text || "Untitled heading"}</span>
        </button>
      {/each}
    </nav>
  {:else}
    <p class="text-2xs text-foreground/65">Headings show up here. Click one to jump to it.</p>
  {/if}
{/snippet}

{#snippet export_group()}
  <div class="grid grid-cols-2 gap-1">
    <Button size="sm" onclick={() => onexport("docx")}><FileDocIcon weight="bold" />Word</Button>
    <Button size="sm" onclick={() => onexport("pdf")}><FilePdfIcon weight="bold" />PDF</Button>
  </div>
{/snippet}

<div class="flex flex-col">
  {@render group("text", "Text", text_group)}
  {@render group("paragraph", "Paragraph", paragraph_group)}
  {@render group("picture", "Picture", picture_group)}
  {@render group("page", "Page", page_group)}
  {@render group("words", "Words", words_group)}
  {@render group("export", "Export", export_group)}
  {@render group("outline", "Outline", outline_group)}
</div>
