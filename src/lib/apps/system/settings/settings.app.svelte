<!-- TODO: vibed for testing -->

<script lang="ts">
  import { cn } from "$lib/core/utils";
  import kernel, {
    BRAND_DARK,
    THEME_PRESETS,
    TaskbarPosition,
    type SettingsService,
    type ThemePreset,
    type VersionService,
  } from "$lib/core/api";
  import LogoLockup from "$lib/core/components/brand/logo-lockup.svelte";
  import {
    ArrowClockwise as ArrowClockwiseIcon,
    ArrowCounterClockwise as ArrowCounterClockwiseIcon,
    CheckCircle as CheckCircleIcon,
    Info as InfoIcon,
    Layout as LayoutIcon,
    Palette as PaletteIcon,
  } from "phosphor-svelte";

  type Section = "theme" | "taskbar" | "about";

  const settings = $derived(kernel.service<SettingsService>("settings"));
  const version = $derived(kernel.service<VersionService>("version"));

  let active_section = $state<Section>("theme");

  function reset_settings() {
    settings.taskbar.position = TaskbarPosition.BOTTOM;
    settings.theme = { ...BRAND_DARK };
  }

  function apply_preset(preset: ThemePreset) {
    settings.theme = { ...preset.theme };
  }

  const update_status = $derived(() => {
    if (version.is_checking) {
      return "checking";
    }
    if (version.update_available) {
      return "available";
    }
    return "up-to-date";
  });

  const positions: Array<{ value: "left" | "right" | "top" | "bottom"; label: string }> = [
    { value: "top", label: "Top" },
    { value: "bottom", label: "Bottom" },
    { value: "left", label: "Left" },
    { value: "right", label: "Right" },
  ];

</script>

<div class="flex h-full">
  <!-- Sidebar -->
  <aside class="w-48 border-r border-foreground/20 bg-background/50">
    <nav class="p-2 space-y-1">
      <button
        onclick={() => (active_section = "theme")}
        class={cn(
          "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
          active_section === "theme"
            ? "bg-primary/20 text-primary"
            : "text-foreground/70 hover:bg-foreground/5 hover:text-foreground"
        )}
      >
        <PaletteIcon class="w-4 h-4" />
        Theme
      </button>
      <button
        onclick={() => (active_section = "taskbar")}
        class={cn(
          "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
          active_section === "taskbar"
            ? "bg-primary/20 text-primary"
            : "text-foreground/70 hover:bg-foreground/5 hover:text-foreground"
        )}
      >
        <LayoutIcon class="w-4 h-4" />
        Taskbar
      </button>
      <button
        onclick={() => (active_section = "about")}
        class={cn(
          "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
          active_section === "about"
            ? "bg-primary/20 text-primary"
            : "text-foreground/70 hover:bg-foreground/5 hover:text-foreground"
        )}
      >
        <InfoIcon class="w-4 h-4" />
        About
      </button>
      <button
        onclick={reset_settings}
        class="w-full text-accent hover:bg-accent/20 flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors"
      >
        <ArrowCounterClockwiseIcon class="w-4 h-4" />
        Reset Settings
      </button>
    </nav>
  </aside>

  <!-- Main Content -->
  <main class="flex-1 overflow-y-auto">
    {#if active_section === "theme"}
      <div class="p-6 space-y-6">
        <div>
          <h2 class="text-xl font-semibold mb-4">Theme Colors</h2>
          <form class="space-y-3">
            {#each Object.entries(settings.theme) as [key, value]}
              <div class="flex items-center gap-3">
                <label for={key} class="w-28 capitalize text-sm">
                  {key}
                </label>
                <input
                  id={key}
                  name={key}
                  type="text"
                  value={value}
                  oninput={(e) => {
                    settings.theme = { ...settings.theme, [key]: e.currentTarget.value };
                  }}
                  class="border border-foreground/30 rounded px-2 py-1 flex-1 text-sm bg-background"
                  style:background={key === "background" ? value : undefined}
                  style:color={key === "foreground" ? value : undefined}
                />
                <input
                  type="color"
                  value={value.startsWith("#") ? value : "#000000"}
                  onchange={(e) => {
                    settings.theme = { ...settings.theme, [key]: e.currentTarget.value };
                  }}
                  class="w-8 h-8 border border-foreground/30 rounded cursor-pointer"
                  title="Pick color"
                />
              </div>
            {/each}
          </form>
        </div>

        <div>
          <h2 class="text-xl font-semibold mb-4">Presets</h2>
          <div class="grid gap-3" style="grid-template-columns: repeat(auto-fill, minmax(220px, 1fr))">
            {#each THEME_PRESETS as preset (preset.name)}
              <button
                type="button"
                class="flex flex-col gap-2 p-3 rounded-lg border-2 border-foreground/20 hover:border-primary transition-colors cursor-pointer"
                onclick={() => apply_preset(preset)}
                title={`Apply ${preset.name}`}
                style:background={preset.theme.background}
              >
                <span class="flex gap-1 w-full">
                  {#each [preset.theme.foreground, preset.theme.primary, preset.theme.secondary, preset.theme.accent] as color, j (j)}
                    <span class="flex-1 min-w-8 min-h-8 aspect-square rounded-lg" style:background={color}></span>
                  {/each}
                </span>
                <span class="text-xs font-medium text-left" style:color={preset.theme.foreground}>{preset.name}</span>
              </button>
            {/each}
          </div>
        </div>
      </div>
    {/if}

    {#if active_section === "taskbar"}
      <div class="p-6 space-y-6">
        <div>
          <h2 class="text-xl font-semibold mb-4">Taskbar Position</h2>
          <div class="grid grid-cols-2 gap-3 max-w-md">
            {#each positions as pos}
              <button
                onclick={() => {
                  settings.taskbar.position = pos.value;
                }}
                class={cn(
                  "flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 transition-all duration-200",
                  settings.taskbar.position === pos.value
                    ? "border-primary bg-primary/20 text-primary font-medium"
                    : "border-foreground/20 hover:border-foreground/40 hover:bg-foreground/5"
                )}
              >
                {pos.label}
              </button>
            {/each}
          </div>
        </div>
      </div>
    {/if}

    {#if active_section === "about"}
      <div class="p-6 space-y-6 max-w-2xl">
        <div>
          <LogoLockup height={48} class="mb-4" />
          <h2 class="text-xl font-semibold mb-1">WebOS</h2>
          <p class="text-foreground/65 text-sm mb-6">Operating System for the web</p>
        </div>

        <!-- Version Information -->
        <div class="space-y-4 p-4 border border-foreground/20 rounded-lg bg-background/50">
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-medium">Version Information</h3>
            {#if import.meta.env.DEV}
              <span
                class="text-xs px-2 py-1 rounded text-warning border border-warning font-medium"
              >
                DEVELOPMENT
              </span>
            {/if}
          </div>

          <div class="space-y-2 text-sm">
            <div class="flex justify-between items-center py-2 border-b border-foreground/10">
              <span class="text-foreground/70">Version</span>
              <span class="font-mono font-medium">{version.info.version}</span>
            </div>

            <div class="flex justify-between items-center py-2 border-b border-foreground/10">
              <span class="text-foreground/70">Commit</span>
              <span class="font-mono text-xs">{version.info.commit}</span>
            </div>

            <div class="flex justify-between items-center py-2 border-b border-foreground/10">
              <span class="text-foreground/70">Branch</span>
              <span class="font-mono text-xs">{version.info.branch}</span>
            </div>

            <div class="flex justify-between items-center py-2 border-b border-foreground/10">
              <span class="text-foreground/70">Mode</span>
              <span class="text-xs">{import.meta.env.DEV ? "Development" : "Production"}</span>
            </div>

            <div class="flex justify-between items-center py-2">
              <span class="text-foreground/70">Build Time</span>
              <span class="text-xs">{new Date(version.info.buildTime).toLocaleString()}</span>
            </div>
          </div>
        </div>

        <!-- Update Check -->
        {#if !import.meta.env.DEV}
          <div class="space-y-4">
            <h3 class="text-lg font-medium">Updates</h3>

            <div class="flex items-start gap-4">
              <button
                onclick={() => version.check()}
                disabled={version.is_checking}
                class="flex items-center gap-2 px-3 py-1 rounded bg-primary text-background hover:opacity-85 active:opacity-70 disabled:opacity-38"
              >
                <ArrowClockwiseIcon class={cn("h-4 w-4", version.is_checking && "animate-spin")} />
                {version.is_checking ? "Checking..." : "Check for Updates"}
              </button>

              {#if update_status() === "available"}
                <div class="flex-1 p-3 border border-info rounded-lg">
                  <div class="flex items-start gap-2">
                    <InfoIcon class="h-5 w-5 text-info mt-0.5 shrink-0" />
                    <div class="flex-1">
                      <p class="font-medium text-info">Update Available</p>
                      {#if version.update_available}
                        <p class="text-sm text-foreground/70 mt-1">
                          v{version.update_available.version} ({version.update_available.commit})
                        </p>
                      {/if}
                      <button
                        onclick={() => version.apply_update()}
                        disabled={false}
                        class="mt-2 flex items-center gap-1 px-3 py-1 rounded bg-info text-background hover:opacity-85 active:opacity-70 disabled:opacity-38"
                      >
                        <ArrowClockwiseIcon class="h-3 w-3 mr-1" />
                        Refresh to Update
                      </button>
                    </div>
                  </div>
                </div>
              {/if}

              {#if update_status() === "up-to-date"}
                <div class="flex-1 p-3 border border-success rounded-lg flex items-center gap-2">
                  <CheckCircleIcon class="h-5 w-5 text-success" />
                  <p class="text-success font-medium">You're up to date!</p>
                </div>
              {/if}

              {#if update_status() === "checking"}
                <div class="flex-1 p-3 border border-foreground/20 rounded-lg flex items-center gap-2">
                  <ArrowClockwiseIcon class="h-5 w-5 animate-spin" />
                  <p class="text-foreground/70">Checking for updates...</p>
                </div>
              {/if}
            </div>

            <p class="text-xs text-foreground/60">
              WebOS automatically checks for updates every 30 minutes while running.
            </p>
          </div>
        {/if}

        {#if import.meta.env.DEV}
          <div class="p-4 border border-warning rounded-lg">
            <p class="text-sm text-foreground/70">
              <strong class="text-warning">Development Mode:</strong> Automatic update checking is disabled.
              Version checking will be enabled in production builds.
            </p>
          </div>
        {/if}

        <!-- Additional Info -->
        <div class="pt-4 border-t border-foreground/20 space-y-2 text-sm text-foreground/60">
          <p>© 2025 WebOS Project</p>
          <p>
            <a
              href="https://github.com/lilbunnyrabbit/webos"
              target="_blank"
              rel="noopener noreferrer"
              class="text-primary hover:underline"
            >
              View on GitHub
            </a>
          </p>
        </div>
      </div>
    {/if}
  </main>
</div>

