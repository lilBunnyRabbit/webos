<script lang="ts">
  import { get_app_context } from "$lib/core/contexts/app";
  import {
    Badge,
    Button,
    Checkbox,
    EmptyState,
    IconButton,
    Input,
    Kbd,
    Section,
    Segmented,
    Select,
    SettingRow,
    SideNav,
    Spinner,
    StatusBar,
    Switch,
    Toolbar,
  } from "$lib/core/components/ui";
  import {
    Bell as BellIcon,
    CursorClick as CursorClickIcon,
    Folder as FolderIcon,
    MagnifyingGlass as MagnifyingGlassIcon,
    PaperPlaneTilt as PaperPlaneTiltIcon,
    Plus as PlusIcon,
    SquaresFour as SquaresFourIcon,
    Stack as StackIcon,
    Swatches as SwatchesIcon,
    TextAa as TextAaIcon,
    Trash as TrashIcon,
  } from "phosphor-svelte";
  import { z } from "zod";

  const SECTIONS = [
    { value: "colour", label: "Colour", icon: SwatchesIcon },
    { value: "type", label: "Type", icon: TextAaIcon },
    { value: "surfaces", label: "Surfaces", icon: StackIcon },
    { value: "actions", label: "Actions", icon: CursorClickIcon },
    { value: "inputs", label: "Inputs", icon: SquaresFourIcon },
    { value: "feedback", label: "Feedback", icon: BellIcon },
  ] as const;
  type SectionId = (typeof SECTIONS)[number]["value"];

  const { storage } = get_app_context();
  const section = storage.persisted<SectionId>("section", "colour", z.enum(SECTIONS.map((item) => item.value)));
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
        <Section title="Empty state" description="Icon tile, one line of title, one of help, optional action.">
          <EmptyState icon={FolderIcon} title="This folder is empty" description="Upload files or create a folder from the toolbar." class="py-8">
            {#snippet actions()}<Button size="sm" variant="primary"><PlusIcon weight="bold" /> New folder</Button>{/snippet}
          </EmptyState>
        </Section>
      {/if}
    </div>
  </main>
</div>
