<script lang="ts">
  import { IconButton, Segmented, Select, Slider, Switch } from "$lib/core/components/ui";
  import { X as XIcon } from "phosphor-svelte";
  import {
    FONT_LABELS,
    FONT_SIZE,
    LINE_HEIGHT,
    Font,
    MARGIN_LABELS,
    Margins,
    Orientation,
    PAGE_SIZE_LABELS,
    PageSize,
    TEMPLATE_LABELS,
    Template,
    type PdfSettings,
  } from "./layout";

  let { settings = $bindable(), onclose }: { settings: PdfSettings; onclose: () => void } = $props();

  const uid = $props.id();

  const options = <T extends string>(labels: Record<T, string>, values: Record<string, T>) =>
    Object.values(values).map((value) => ({ value, label: labels[value] }));

  const toggles: { key: "toc" | "show_title" | "show_date" | "page_numbers"; label: string }[] = [
    { key: "toc", label: "Table of contents" },
    { key: "show_title", label: "Title in the header" },
    { key: "show_date", label: "Date in the header" },
    { key: "page_numbers", label: "Page numbers" },
  ];
</script>

<aside
  aria-label="Page settings"
  class="absolute inset-y-0 right-0 z-10 flex w-full max-w-80 flex-col border-l border-hairline bg-background-light shadow-popover @3xl:static @3xl:w-72 @3xl:shadow-none"
>
  <header class="flex h-10 shrink-0 items-center justify-between border-b border-hairline pr-1.5 pl-4">
    <h2 class="text-ui font-semibold">Page settings</h2>
    <IconButton label="Close page settings" size="sm" onclick={onclose}><XIcon weight="bold" /></IconButton>
  </header>

  <div class="flex min-h-0 flex-1 flex-col gap-5 overflow-auto px-4 py-4">
    <section class="flex flex-col gap-2.5">
      <h3 class="text-2xs font-medium tracking-wide text-foreground/65 uppercase">Template</h3>
      <Segmented label="Template" bind:value={settings.template} options={options(TEMPLATE_LABELS, Template)} class="self-start" />
    </section>

    <section class="flex flex-col gap-2.5">
      <h3 class="text-2xs font-medium tracking-wide text-foreground/65 uppercase">Page</h3>
      <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <span class="text-ui">Size</span>
        <Segmented size="sm" label="Page size" bind:value={settings.page_size} options={options(PAGE_SIZE_LABELS, PageSize)} />
      </div>
      <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <span class="text-ui">Orientation</span>
        <Segmented
          size="sm"
          label="Orientation"
          bind:value={settings.orientation}
          options={[
            { value: Orientation.PORTRAIT, label: "Portrait" },
            { value: Orientation.LANDSCAPE, label: "Landscape" },
          ]}
        />
      </div>
      <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <span class="text-ui">Margins</span>
        <Segmented size="sm" label="Margins" bind:value={settings.margins} options={options(MARGIN_LABELS, Margins)} />
      </div>
    </section>

    <section class="flex flex-col gap-2.5">
      <h3 class="text-2xs font-medium tracking-wide text-foreground/65 uppercase">Text</h3>
      <div class="flex items-center justify-between gap-3">
        <label class="text-ui" for="{uid}-font">Font</label>
        <Select id="{uid}-font" size="sm" class="w-36" bind:value={settings.font} options={options(FONT_LABELS, Font)} />
      </div>
      <div class="flex flex-col">
        <div class="flex items-center justify-between gap-3">
          <label class="text-ui" for="{uid}-font-size">Size</label>
          <span class="font-mono text-2xs text-foreground/80 tabular-nums">{settings.font_size} pt</span>
        </div>
        <Slider id="{uid}-font-size" size="sm" bind:value={settings.font_size} {...FONT_SIZE} />
      </div>
      <div class="flex flex-col">
        <div class="flex items-center justify-between gap-3">
          <label class="text-ui" for="{uid}-line-height">Line height</label>
          <span class="font-mono text-2xs text-foreground/80 tabular-nums">{settings.line_height.toFixed(2)}</span>
        </div>
        <Slider id="{uid}-line-height" size="sm" bind:value={settings.line_height} {...LINE_HEIGHT} />
      </div>
    </section>

    <section class="flex flex-col gap-1">
      <h3 class="mb-1.5 text-2xs font-medium tracking-wide text-foreground/65 uppercase">Contents, header and footer</h3>
      {#each toggles as toggle (toggle.key)}
        <label class="flex min-h-8 cursor-pointer items-center justify-between gap-3 text-ui pointer-coarse:min-h-10">
          {toggle.label}
          <Switch bind:checked={settings[toggle.key]} />
        </label>
      {/each}
    </section>
  </div>
</aside>
