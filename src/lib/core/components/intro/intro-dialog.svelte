<script lang="ts">
  import kernel, {
    Platform,
    THEME_PRESETS,
    TaskbarPosition,
    type AppListing,
    type AppsService,
    type DesktopService,
    type DialogProps,
    type SettingsService,
  } from "$lib/core/api";
  import { INTERESTS, interest_apps } from "$lib/core/api/services/apps/suggestions";
  import { SvelteSet } from "svelte/reactivity";
  import type { Component } from "svelte";
  import LogoLockup from "../brand/logo-lockup.svelte";
  import LogoMark from "../brand/logo-mark.svelte";
  import ThemeCard from "../theme/theme-card.svelte";
  import { Button, Kbd, Segmented } from "../ui";
  import { cn } from "$lib/core/utils";
  import { installer } from "$lib/core/utils/install.svelte";
  import {
    AppWindow as AppWindowIcon,
    ArrowLeft as ArrowLeftIcon,
    ArrowLineDown as ArrowLineDownIcon,
    ArrowLineLeft as ArrowLineLeftIcon,
    ArrowLineRight as ArrowLineRightIcon,
    ArrowLineUp as ArrowLineUpIcon,
    ArrowRight as ArrowRightIcon,
    CheckCircle as CheckCircleIcon,
    ClockCounterClockwise as ClockCounterClockwiseIcon,
    CursorClick as CursorClickIcon,
    DownloadSimple as DownloadSimpleIcon,
    Flask as FlaskIcon,
    FolderSimple as FolderSimpleIcon,
    HardDrives as HardDrivesIcon,
    Info as InfoIcon,
    Laptop as LaptopIcon,
    List as ListIcon,
    Monitor as MonitorIcon,
    PushPin as PushPinIcon,
    Sparkle as SparkleIcon,
    SquaresFour as SquaresFourIcon,
    Warning as WarningIcon,
  } from "phosphor-svelte";

  let { resolve }: DialogProps<true> = $props();

  const settings = $derived(kernel.service<SettingsService>("settings"));
  const apps = $derived(kernel.service<AppsService>("apps"));
  const desktop = $derived(kernel.service<DesktopService>("desktop"));
  const mobile = kernel.platform === Platform.MOBILE;

  const interests = new SvelteSet<string>();
  const pins = new SvelteSet<string>();
  const suggested = $derived(interest_apps(interests).flatMap((id) => apps.listings().find((listing) => listing.id === id) ?? []));

  function toggle<T>(set: SvelteSet<T>, value: T) {
    if (set.has(value)) set.delete(value);
    else set.add(value);
  }

  /** Skip and Start both keep what was picked so far. */
  function finish() {
    const picked = interest_apps(interests);
    apps.install(picked);
    for (const id of picked.filter((id) => pins.has(id))) desktop.pin(id).catch((error) => console.error(`[Intro] Failed to pin ${id}`, error));
    resolve(true);
  }

  interface Point {
    icon: Component;
    title: string;
    text: string;
    tone?: "warning";
  }

  const PAGES = ["hello", "install", "files", "around", "apps", "yours", "ready"] as const;
  let page = $state(0);
  const last = PAGES.length - 1;

  const FILES: Point[] = [
    { icon: HardDrivesIcon, title: "Stored on this device", text: "Files live in your browser's private storage. Nothing is uploaded; there is no server." },
    { icon: LaptopIcon, title: "One browser, one disk", text: "Another browser or device starts empty. Save files to disk to move them over." },
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

{#snippet suggestion(manifest: AppListing)}
  <li class="flex items-center gap-3 rounded-xl bg-background-light p-3 ring-1 ring-foreground/8">
    <span class="grid size-10 shrink-0 place-items-center rounded-xl bg-background shadow-raised ring-1 ring-foreground/10">
      <manifest.icon class="size-6" weight="duotone" />
    </span>
    <div class="min-w-0 flex-1">
      <h3 class="text-ui font-semibold">{manifest.name}</h3>
      <p class="line-clamp-2 text-ui text-foreground/65">{manifest.description ?? ""}</p>
    </div>
    <Button
      variant="quiet"
      pressed={pins.has(manifest.id)}
      aria-label="{mobile ? 'Add' : 'Pin'} {manifest.name}"
      onclick={() => toggle(pins, manifest.id)}
    >
      <PushPinIcon weight={pins.has(manifest.id) ? "fill" : "bold"} />
      {pins.has(manifest.id) ? (mobile ? "Added" : "Pinned") : mobile ? "Add" : "Pin"}
    </Button>
  </li>
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
      <Button variant="quiet" onclick={finish}>Skip</Button>
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
                A desktop that lives in your browser: windows, files, apps and a taskbar. No account, no server.
              </p>
            </div>
            <p class="text-ui text-foreground/65">A few pages on what to expect. Takes a minute.</p>
          </div>
        {:else if PAGES[page] === "install"}
          {@render heading("Install", "Install WebOS first", "The most important step. It takes a few seconds.")}
          <section class="flex flex-col gap-5 rounded-2xl bg-background-light p-6 ring-2 ring-primary/40">
            <div class="flex gap-4">
              <span class="grid size-12 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
                <DownloadSimpleIcon class="size-6" weight="bold" />
              </span>
              <div class="flex min-w-0 flex-col gap-1">
                <h2 class="text-base font-semibold">Why it matters</h2>
                <p class="text-ui text-pretty text-foreground/80">WebOS gets its own window and works offline.</p>
                <p class="text-ui text-pretty text-foreground/80">The browser is far less likely to clear an installed app's storage, so your files stay put.</p>
              </div>
            </div>
            {#if installer.installed}
              <p class="flex items-center gap-2 text-sm font-medium text-success">
                <CheckCircleIcon class="size-5" weight="fill" /> Installed
              </p>
            {:else if installer.can_install}
              <Button variant="primary" size="lg" class="self-start" onclick={() => installer.install()}>
                <DownloadSimpleIcon weight="bold" /> Install WebOS
              </Button>
            {:else}
              <p class="flex items-start gap-2 rounded-lg bg-background p-3 text-ui text-foreground/80 ring-1 ring-foreground/8">
                <InfoIcon class="mt-0.5 size-4 shrink-0 text-primary" weight="duotone" />
                <span>{installer.hint}</span>
              </p>
            {/if}
          </section>
        {:else if PAGES[page] === "files"}
          {@render heading("Your files", "Everything stays on this device", "WebOS keeps your files in the browser, like a disk that belongs to this site.")}
          {@render points(FILES)}
        {:else if PAGES[page] === "around"}
          {@render heading("Getting around", "It works like a desktop", "If you've used Windows or macOS, most of this will feel familiar.")}
          {@render points(AROUND)}
          <p class="text-ui text-foreground/65">
            From the keyboard: <Kbd>Shift</Kbd> + <Kbd>F10</Kbd> opens the menu of a focused file, <Kbd>F2</Kbd> renames it, <Kbd>Del</Kbd> deletes it.
          </p>
        {:else if PAGES[page] === "apps"}
          {@render heading(
            "Apps",
            "What are you into?",
            `Pick what you're into and those apps get installed, then ${mobile ? "add favourites to the home screen" : "pin favourites to the desktop"}. Every other app is a search away.`
          )}
          <div class="flex flex-wrap gap-2" role="group" aria-label="Interests">
            {#each INTERESTS as interest (interest.id)}
              <Button size="lg" pressed={interests.has(interest.id)} title={interest.description} onclick={() => toggle(interests, interest.id)}>
                {interest.label}
              </Button>
            {/each}
          </div>
          {#if suggested.length}
            <ul class="grid gap-2 @xl:grid-cols-2">
              {#each suggested as manifest (manifest.id)}
                {@render suggestion(manifest)}
              {/each}
            </ul>
          {:else}
            <p class="text-ui text-foreground/65">Nothing picked yet: you start with the core apps. The App Library has the rest.</p>
          {/if}
        {:else if PAGES[page] === "yours"}
          {@render heading("Make it yours", "Pick a look", "Changes apply right away. Fine-tune every colour later in Settings › Theme.")}
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
        <Button variant="primary" size="lg" autofocus onclick={finish}>Start using WebOS</Button>
      {/if}
    </div>
  </footer>
</div>
