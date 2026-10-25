<script lang="ts">
  import { Badge, CopyButton, SideNav } from "$lib/core/components/ui";
  import { get_app_context, json_file, type JsonFile } from "$lib/core/contexts/app";
  import { untrack } from "svelte";
  import { in_srgb_gamut, to_hex, type Color } from "./color";
  import ContrastSection from "./contrast-section.svelte";
  import ConvertSection from "./convert-section.svelte";
  import HarmonySection from "./harmony-section.svelte";
  import { format_color, parse_css } from "./models";
  import { add_colors, PaletteFileSchema, type Palette } from "./palette";
  import PaletteSection from "./palette-section.svelte";
  import PickSection from "./pick-section.svelte";
  import { DEFAULT_COLOR, initial_state, Section, SECTIONS, ToolsState } from "./state";
  import Swatch from "./swatch.svelte";
  import VisionSection from "./vision-section.svelte";

  const { path }: { path?: string } = $props();
  const { window: win, storage } = get_app_context();

  // Window state: two windows each keep their own colour, and a restored window gets its colour back.
  const tools = storage.window<ToolsState>("state", untrack(() => initial_state(path)), ToolsState);

  const color = $derived(parse_css(tools.value.color) ?? parse_css(DEFAULT_COLOR)!);
  const text = $derived(format_color(color));
  const hex = $derived(to_hex(color));
  const in_gamut = $derived(in_srgb_gamut(color));
  const current = $derived(SECTIONS.find((item) => item.value === tools.value.section) ?? SECTIONS[0]);

  function set_color(next: Color) {
    tools.value.color = next.toString();
  }

  let cell = $state.raw<JsonFile<Palette | null> | null>(null);
  $effect(() => {
    const open = tools.value.palette;
    if (!open) return;
    const next = json_file(open, null, PaletteFileSchema);
    cell = next;
    return () => {
      next.release();
      cell = null;
    };
  });

  const palette = $derived(cell?.ready && !cell.error ? cell.value : null);

  $effect(() => win.set_title(palette ? palette.name : null));

  function edit(change: (palette: Palette) => Palette) {
    if (!cell?.value) return;
    const before = $state.snapshot(cell.value) as Palette;
    const after = change(before);
    if (after !== before) cell.value = after;
  }

  function add(colors: Color[], label: string) {
    edit((before) => add_colors(before, colors.map((entry, index) => ({ name: `${label.toLowerCase()} ${index + 1}`, css: format_color(entry, 5) }))));
  }
</script>

<div class="flex h-full flex-col @2xl:flex-row">
  <SideNav label="Color tools" items={SECTIONS} bind:value={tools.value.section} />

  <main class="min-h-0 flex-1 overflow-y-auto">
    <div class="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-5 @md:px-6 @md:py-6">
      <div class="flex min-w-0 items-center gap-3 rounded-xl bg-background-light p-2.5 ring-1 ring-foreground/8">
        <Swatch {color} label="Current colour, {text}" class="size-12 shrink-0 rounded-lg @md:size-14" />
        <div class="flex min-w-0 flex-1 flex-col gap-0.5">
          <div class="flex min-w-0 items-center gap-1">
            <span class="min-w-0 truncate font-mono text-ui font-medium" title={text}>{text}</span>
            <CopyButton {text} label="Copy colour" />
          </div>
          {#if hex !== text || !in_gamut}
            <div class="flex min-w-0 items-center gap-1.5">
              {#if hex !== text}
                <span class="font-mono text-2xs text-foreground/80">{hex}</span>
                <CopyButton text={hex} label="Copy hex" />
              {/if}
              {#if !in_gamut}<Badge tone="warning" class="truncate">Outside sRGB, shown mapped</Badge>{/if}
            </div>
          {/if}
        </div>
      </div>

      <h1 class="text-lg font-semibold">{current.label}</h1>

      {#if tools.value.section === Section.PICK}
        <PickSection {color} {text} active={tools.value.section === Section.PICK} bind:model={tools.value.model} onchange={set_color} />
      {:else if tools.value.section === Section.CONVERT}
        <ConvertSection {color} />
      {:else if tools.value.section === Section.CONTRAST}
        <ContrastSection {color} {text} bind:background={tools.value.background} onchange={set_color} />
      {:else if tools.value.section === Section.VISION}
        <VisionSection {color} {palette} bind:severity={tools.value.severity} bind:source={tools.value.vision_source} onchange={set_color} />
      {:else if tools.value.section === Section.HARMONY}
        <HarmonySection
          {color}
          bind:space={tools.value.space}
          bind:steps_to={tools.value.steps_to}
          bind:steps={tools.value.steps}
          onadd={palette ? add : null}
          onchange={set_color}
        />
      {:else}
        <PaletteSection
          bind:path={tools.value.palette}
          {palette}
          ready={cell?.ready ?? false}
          error={cell?.error ?? null}
          {color}
          onedit={edit}
          onchange={set_color}
        />
      {/if}
    </div>
  </main>
</div>
