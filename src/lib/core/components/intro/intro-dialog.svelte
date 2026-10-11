<script lang="ts">
  import kernel, { THEME_PRESETS, TaskbarPosition, type DialogProps, type SettingsService } from "$lib/core/api";
  import type { Component } from "svelte";
  import LogoLockup from "../brand/logo-lockup.svelte";
  import LogoMark from "../brand/logo-mark.svelte";
  import ThemeCard from "../theme/theme-card.svelte";
  import { Button, Kbd, Segmented } from "../ui";
  import { cn } from "$lib/core/utils";
  import {
    AppWindow as AppWindowIcon,
    ArrowLeft as ArrowLeftIcon,
    ArrowLineDown as ArrowLineDownIcon,
    ArrowLineLeft as ArrowLineLeftIcon,
    ArrowLineRight as ArrowLineRightIcon,
    ArrowLineUp as ArrowLineUpIcon,
    ArrowRight as ArrowRightIcon,
    ClockCounterClockwise as ClockCounterClockwiseIcon,
    CursorClick as CursorClickIcon,
    Flask as FlaskIcon,
    FolderSimple as FolderSimpleIcon,
    HardDrives as HardDrivesIcon,
    List as ListIcon,
    Monitor as MonitorIcon,
    Sparkle as SparkleIcon,
    SquaresFour as SquaresFourIcon,
    Warning as WarningIcon,
    WifiSlash as WifiSlashIcon,
  } from "phosphor-svelte";

  let { resolve }: DialogProps<true> = $props();

  const settings = $derived(kernel.service<SettingsService>("settings"));

  interface Point {
    icon: Component;
    title: string;
    text: string;
    tone?: "warning";
  }

  const PAGES = ["hello", "files", "around", "yours", "ready"] as const;
  let page = $state(0);
  const last = PAGES.length - 1;

  const FILES: Point[] = [
    { icon: HardDrivesIcon, title: "Stored on this device", text: "Files live in your browser's private storage. Nothing is uploaded; there is no server." },
    { icon: WifiSlashIcon, title: "Works offline", text: "Once loaded, WebOS runs without a connection. Install it from the browser to give it its own window." },
    { icon: FolderSimpleIcon, title: "Save to disk", text: "Right-click a file or folder and pick Save to disk… to keep a copy on your computer." },
    { icon: WarningIcon, title: "Clearing site data deletes them", text: "The storage belongs to this site. Clearing it in the browser removes your files and settings.", tone: "warning" },
  ];

  const AROUND: Point[] = [
    { icon: ListIcon, title: "Start menu", text: "Every app is in the start menu, the first button on the taskbar." },
    { icon: AppWindowIcon, title: "Windows", text: "Drag a title bar to move. Drop on a screen edge to snap to a half, on a corner for a quarter. Double-click to maximise." },
    { icon: CursorClickIcon, title: "Right-click everything", text: "Files, folders and the desktop all have a menu: rename, copy, Open with, properties." },
    { icon: SquaresFourIcon, title: "The desktop is a folder", text: "It's /home/Desktop. Drag icons to arrange them; pin apps to it from the start menu." },
  ];

  const READY: Point[] = [
    { icon: SparkleIcon, title: "Updates arrive on their own", text: "A notification offers to reload when a new version is ready, and tells you what changed after." },
    { icon: ClockCounterClockwiseIcon, title: "Windows come back", text: "Open windows are saved. Next visit, WebOS offers to restore them." },
    { icon: FlaskIcon, title: "Work in progress", text: "WebOS is a learning project: things change and sometimes break. Settings › What's new lists every release." },
    { icon: MonitorIcon, title: "See this again", text: "Settings › About replays this introduction." },
  ];

  const TASKBAR = [
    { value: TaskbarPosition.BOTTOM, label: "Bottom", icon: ArrowLineDownIcon },
    { value: TaskbarPosition.TOP, label: "Top", icon: ArrowLineUpIcon },
    { value: TaskbarPosition.LEFT, label: "Left", icon: ArrowLineLeftIcon },
    { value: TaskbarPosition.RIGHT, label: "Right", icon: ArrowLineRightIcon },
  ];

  const active_preset = $derived(
    THEME_PRESETS.find(({ theme }) => Object.entries(theme).every(([token, value]) => settings.theme[token as keyof typeof theme] === value))
  );

  function go(to: number) {
    page = Math.max(0, Math.min(last, to));
  }
</script>

{#snippet points(items: Point[])}
  <ul class="grid gap-3 @xl:grid-cols-2">
    {#each items as item (item.title)}
      <li class="flex gap-3 rounded-xl bg-background-light p-4 ring-1 ring-foreground/8">
        <span class={cn("grid size-9 shrink-0 place-items-center rounded-lg", item.tone === "warning" ? "bg-warning/12 text-warning" : "bg-primary/12 text-primary")}>
          <item.icon class="size-5" weight="duotone" />
        </span>
        <div class="min-w-0">
          <h3 class="text-ui font-semibold">{item.title}</h3>
          <p class="text-ui text-foreground/65">{item.text}</p>
        </div>
      </li>
    {/each}
  </ul>
{/snippet}

{#snippet heading(step: string, title: string, lead: string)}
  <header class="flex flex-col gap-1.5">
    <p class="text-2xs font-medium tracking-wide text-foreground/65 uppercase">{step}</p>
    <h1 class="text-2xl font-semibold text-balance">{title}</h1>
    <p class="text-sm text-pretty text-foreground/65">{lead}</p>
  </header>
{/snippet}

<!-- Full viewport even when replayed over a window: the host centres dialogs on a point, so this escapes with `fixed`. -->
<svelte:window
  onkeydown={(event) => {
    if ((event.target as Element).closest("input, [role=radiogroup]")) return;
    if (event.key === "ArrowRight") go(page + 1);
    else if (event.key === "ArrowLeft") go(page - 1);
  }}
/>

<div role="region" aria-label="Introduction" class="fixed inset-0 flex flex-col overflow-y-auto bg-background-darkest text-foreground">
  <div class="pointer-events-none absolute inset-x-0 top-0 h-2/3 bg-[radial-gradient(ellipse_at_top,var(--background-dark),transparent_70%)]"></div>

  <div class="relative flex items-center justify-between px-6 py-4">
    <LogoLockup height={32} />
    {#if page < last}
      <Button variant="quiet" onclick={() => resolve(true)}>Skip</Button>
    {/if}
  </div>

  <main class="relative @container mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-6 py-8">
    {#key page}
      <div class="flex animate-pop-in flex-col gap-8">
        {#if PAGES[page] === "hello"}
          <div class="flex flex-col items-center gap-6 text-center">
            <LogoMark class="h-24 w-auto text-primary" title="" aria-hidden="true" />
            <div class="flex flex-col gap-2">
              <h1 class="text-3xl font-semibold">Welcome to WebOS</h1>
              <p class="mx-auto max-w-md text-sm text-pretty text-foreground/65">
                A desktop that lives in your browser: windows, files, apps and a taskbar. No account, no install, no server.
              </p>
            </div>
            <p class="text-ui text-foreground/65">A few pages on what to expect. Takes a minute.</p>
          </div>
        {:else if PAGES[page] === "files"}
          {@render heading("Your files", "Everything stays on this device", "WebOS keeps your files in the browser, like a disk that belongs to this site.")}
          {@render points(FILES)}
        {:else if PAGES[page] === "around"}
          {@render heading("Getting around", "It works like a desktop", "If you've used Windows or macOS, most of this will feel familiar.")}
          {@render points(AROUND)}
          <p class="text-ui text-foreground/65">
            From the keyboard: <Kbd>Shift</Kbd> + <Kbd>F10</Kbd> opens the menu of a focused file, <Kbd>F2</Kbd> renames it, <Kbd>Del</Kbd> deletes it.
          </p>
        {:else if PAGES[page] === "yours"}
          {@render heading("Make it yours", "Pick a look", "Changes apply right away. Fine-tune every colour later in Settings › Appearance.")}
          <div class="grid grid-cols-2 gap-2 @xl:grid-cols-4">
            {#each THEME_PRESETS as preset (preset.name)}
              <ThemeCard {preset} active={preset === active_preset} onselect={() => (settings.theme = { ...preset.theme })} />
            {/each}
          </div>
          <div class="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-background-light p-4 ring-1 ring-foreground/8">
            <div>
              <h3 class="text-ui font-semibold">Taskbar</h3>
              <p class="text-ui text-foreground/65">Which screen edge it docks to.</p>
            </div>
            <Segmented label="Taskbar position" bind:value={settings.taskbar.position} options={TASKBAR} />
          </div>
        {:else}
          {@render heading("Ready", "What to expect", "A few things worth knowing before you start.")}
          {@render points(READY)}
        {/if}
      </div>
    {/key}
  </main>

  <footer class="relative mx-auto flex w-full max-w-3xl items-center justify-between gap-4 px-6 pt-2 pb-6">
    <div class="flex gap-1.5" aria-label="Page {page + 1} of {PAGES.length}" role="img">
      {#each PAGES as id, index (id)}
        <button
          aria-label="Go to page {index + 1}"
          class={cn("h-1.5 rounded-full transition-all duration-200", index === page ? "w-6 bg-primary" : "w-1.5 bg-foreground/20 hover:bg-foreground/40")}
          onclick={() => go(index)}
        ></button>
      {/each}
    </div>
    <div class="flex gap-2">
      {#if page > 0}
        <Button variant="quiet" size="lg" onclick={() => go(page - 1)}><ArrowLeftIcon /> Back</Button>
      {/if}
      {#if page < last}
        <!-- svelte-ignore a11y_autofocus -->
        <Button variant="primary" size="lg" autofocus onclick={() => go(page + 1)}>{page === 0 ? "Get started" : "Next"} <ArrowRightIcon /></Button>
      {:else}
        <!-- svelte-ignore a11y_autofocus -->
        <Button variant="primary" size="lg" autofocus onclick={() => resolve(true)}>Start using WebOS</Button>
      {/if}
    </div>
  </footer>
</div>
