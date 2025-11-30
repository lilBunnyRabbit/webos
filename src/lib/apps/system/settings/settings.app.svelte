<!-- TODO: vibed for testing -->

<script lang="ts">
  import { cn } from "$lib/core/utils";
  import kernel, { type SettingsService } from "$lib/core/api";
  import { TaskbarPosition } from "$lib/core/api/services/settings/type";
  import {
    CheckCircle2,
    Info,
    LayoutDashboard,
    Palette,
    RefreshCw,
    RotateCcw,
  } from "@lucide/svelte";

  type Section = "theme" | "taskbar" | "about";

  const settings = $derived(kernel.service<SettingsService>("settings"));

  let activeSection = $state<Section>("theme");

  // Version info - placeholder implementation
  const APP_VERSION = {
    version: "0.0.0",
    commit: "unknown",
    branch: "unknown",
    buildTime: new Date().toISOString(),
  };

  // Version checking - placeholder implementation
  let newVersion = $state<{ version: string; commit: string } | null>(null);
  let isCheckingForUpdates = $state(false);
  let isUpdating = $state(false);

  async function checkForUpdates() {
    isCheckingForUpdates = true;
    try {
      // Placeholder: fetch version.json
      const response = await fetch("/version.json");
      if (response.ok) {
        const data = await response.json();
        if (data.buildTimestamp > APP_VERSION.buildTime) {
          newVersion = { version: data.version, commit: data.commit };
        }
      }
    } catch (error) {
      console.error("Failed to check for updates:", error);
    } finally {
      isCheckingForUpdates = false;
    }
  }

  async function applyUpdate() {
    isUpdating = true;
    try {
      // Placeholder: clear caches and reload
      if ("caches" in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map((name) => caches.delete(name)));
      }
      if ("serviceWorker" in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((reg) => reg.unregister()));
      }
      window.location.reload();
    } catch (error) {
      console.error("Failed to apply update:", error);
      isUpdating = false;
    }
  }

  function resetSettings() {
    // Placeholder: reset settings
    settings.taskbar.position = TaskbarPosition.BOTTOM;
    // Reset theme to defaults - placeholder
    const computed = getComputedStyle(document.documentElement);
    settings.theme = {
      background: computed.getPropertyValue("--background").trim() || "#ffffff",
      foreground: computed.getPropertyValue("--foreground").trim() || "#222222",
      primary: computed.getPropertyValue("--primary").trim() || "#2563eb",
      secondary: computed.getPropertyValue("--secondary").trim() || "#64748b",
      accent: computed.getPropertyValue("--accent").trim() || "#d97706",
    };
  }

  const presets: [
    background: string,
    foreground: string,
    primary: string,
    secondary: string,
    accent: string,
  ][] = [
    // Dark blue-gray
    [
      "oklch(0.26 0.0233 230.47)",
      "oklch(0.76 0.0183 99.68)",
      "oklch(0.76 0.0865 123.43)",
      "oklch(0.76 0.0865 303.43)",
      "oklch(0.76 0.0865 50.47)",
    ],
    // Light version of first preset
    [
      "oklch(0.97 0.015 230.47)",
      "oklch(0.25 0.025 99.68)",
      "oklch(0.65 0.12 123.43)",
      "oklch(0.65 0.12 303.43)",
      "oklch(0.65 0.12 50.47)",
    ],
    // speed reader light
    ["rgb(255 246 231)", "rgb(100 128 150)", "rgb(219 159 118)", "rgb(172 219 118)", "rgb(219 118 118)"],
    // speed reader dark
    ["rgb(26 43 51)", "rgb(185 182 170)", "rgb(237 203 171)", "rgb(206 237 171)", "rgb(237 171 171)"],
    // Light pastel blue
    ["oklch(0.98 0.01 250)", "oklch(0.22 0.02 80)", "oklch(0.7 0.09 200)", "oklch(0.7 0.09 20)", "oklch(0.7 0.09 320)"],
    // Red & Black (looks good)
    [
      "oklch(0.45 0.22 29)", // background: rich, deep red
      "oklch(0.15 0.01 0)", // foreground: near black
      "oklch(0.85 0.02 29)", // primary: light red for highlights
      "oklch(0.7 0.13 80)", // secondary: gold/yellow accent
      "oklch(0.7 0.13 340)", // accent: magenta accent
    ],
    // Dark warm
    ["oklch(0.15 0.03 40)", "oklch(0.85 0.02 120)", "oklch(0.65 0.1 60)", "oklch(0.65 0.1 240)", "oklch(0.65 0.1 180)"],
    // Dark purple-tinted
    ["oklch(0.35 0.04 300)", "oklch(0.9 0.015 60)", "oklch(0.8 0.08 270)", "oklch(0.8 0.08 90)", "oklch(0.8 0.08 180)"],
    // Mid-tone green
    ["oklch(0.5 0.06 120)", "oklch(0.95 0.01 300)", "oklch(0.7 0.12 30)", "oklch(0.7 0.12 210)", "oklch(0.7 0.12 330)"],
    // Dark cool
    ["oklch(0.22 0.025 270)", "oklch(0.8 0.02 180)", "oklch(0.6 0.09 350)", "oklch(0.6 0.09 170)", "oklch(0.6 0.09 90)"],
    // Warm sunset
    ["oklch(0.18 0.04 30)", "oklch(0.92 0.01 50)", "oklch(0.7 0.15 40)", "oklch(0.65 0.13 320)", "oklch(0.75 0.14 60)"],
    // Ocean breeze
    ["oklch(0.95 0.02 220)", "oklch(0.2 0.03 240)", "oklch(0.6 0.14 210)", "oklch(0.65 0.1 190)", "oklch(0.7 0.12 160)"],
    // Forest night
    ["oklch(0.2 0.04 160)", "oklch(0.88 0.015 140)", "oklch(0.65 0.13 145)", "oklch(0.7 0.1 110)", "oklch(0.75 0.11 80)"],
    // Lavender dream
    [
      "oklch(0.96 0.025 310)",
      "oklch(0.28 0.04 290)",
      "oklch(0.68 0.14 285)",
      "oklch(0.72 0.11 310)",
      "oklch(0.65 0.13 340)",
    ],
    // Monochrome dark
    ["oklch(0.18 0.01 0)", "oklch(0.85 0.01 0)", "oklch(0.5 0.02 0)", "oklch(0.4 0.015 0)", "oklch(0.65 0.02 0)"],
    // Vibrant coral
    ["oklch(0.25 0.03 350)", "oklch(0.93 0.01 30)", "oklch(0.7 0.18 15)", "oklch(0.65 0.16 340)", "oklch(0.75 0.17 50)"],
    // Ultra contrast: Pure black & white with neon accents
    ["oklch(0.0 0 0)", "oklch(1.0 0 0)", "oklch(0.75 0.3 145)", "oklch(0.75 0.3 330)", "oklch(0.75 0.3 60)"],
    // Ultra contrast: Pure white with black text and electric colors
    ["oklch(1.0 0 0)", "oklch(0.0 0 0)", "oklch(0.55 0.35 265)", "oklch(0.6 0.32 340)", "oklch(0.65 0.33 100)"],
    // Ultra contrast: Deep black with bright neon
    ["oklch(0.05 0 0)", "oklch(0.98 0.01 0)", "oklch(0.8 0.28 195)", "oklch(0.8 0.28 310)", "oklch(0.8 0.28 45)"],
    // Ultra contrast: Cyberpunk
    ["oklch(0.1 0.05 290)", "oklch(0.95 0.03 180)", "oklch(0.7 0.35 325)", "oklch(0.75 0.32 200)", "oklch(0.8 0.3 55)"],
    // Ultra contrast: Terminal green
    ["oklch(0.0 0 0)", "oklch(0.85 0.22 145)", "oklch(0.75 0.25 145)", "oklch(0.65 0.2 145)", "oklch(0.8 0.28 85)"],
    // Ultra contrast: High visibility
    ["oklch(0.98 0.005 80)", "oklch(0.15 0.01 280)", "oklch(0.45 0.35 260)", "oklch(0.5 0.3 30)", "oklch(0.4 0.32 340)"],
    // Pure black & white
    ["oklch(0.0 0 0)", "oklch(1.0 0 0)", "oklch(0.6 0 0)", "oklch(0.4 0 0)", "oklch(0.8 0 0)"],
  ];

  function presetToTheme(preset: (typeof presets)[0]) {
    return {
      background: preset[0],
      foreground: preset[1],
      primary: preset[2],
      secondary: preset[3],
      accent: preset[4],
    };
  }

  function handlePresetClick(preset: (typeof presets)[0]) {
    const theme = presetToTheme(preset);
    settings.theme = { ...settings.theme, ...theme };
  }

  const updateStatus = $derived(() => {
    if (isCheckingForUpdates) {
      return "checking";
    }
    if (newVersion) {
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

  $effect(() => {
    console.log("~~~~~~~~~~~~~~~ SettingsApp mounted");
  });
</script>

<div class="flex h-full">
  <!-- Sidebar -->
  <aside class="w-48 border-r border-foreground/20 bg-background/50">
    <nav class="p-2 space-y-1">
      <button
        onclick={() => (activeSection = "theme")}
        class={cn(
          "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
          activeSection === "theme"
            ? "bg-primary/20 text-primary"
            : "text-foreground/70 hover:bg-foreground/5 hover:text-foreground"
        )}
      >
        <Palette class="w-4 h-4" />
        Theme
      </button>
      <button
        onclick={() => (activeSection = "taskbar")}
        class={cn(
          "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
          activeSection === "taskbar"
            ? "bg-primary/20 text-primary"
            : "text-foreground/70 hover:bg-foreground/5 hover:text-foreground"
        )}
      >
        <LayoutDashboard class="w-4 h-4" />
        Taskbar
      </button>
      <button
        onclick={() => (activeSection = "about")}
        class={cn(
          "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
          activeSection === "about"
            ? "bg-primary/20 text-primary"
            : "text-foreground/70 hover:bg-foreground/5 hover:text-foreground"
        )}
      >
        <Info class="w-4 h-4" />
        About
      </button>
      <button
        onclick={resetSettings}
        class="w-full text-accent hover:bg-accent/20 flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors"
      >
        <RotateCcw class="w-4 h-4" />
        Reset Settings
      </button>
    </nav>
  </aside>

  <!-- Main Content -->
  <main class="flex-1 overflow-y-auto">
    {#if activeSection === "theme"}
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
            {#each presets as preset, i}
              <button
                type="button"
                class="flex gap-1 p-4 rounded-lg hover:border-primary/60 hover:shadow-lg transition-all duration-200 cursor-pointer justify-center items-center"
                onclick={() => handlePresetClick(preset)}
                title={`Preset ${i + 1} - Click to apply`}
                style:background={preset[0]}
              >
                {#each preset.slice(1) as color, j}
                  <span
                    class="flex-1 min-w-8 min-h-8 aspect-square rounded-lg shadow-md border-2 border-background"
                    style:background={color || "#fff"}
                    style:display="inline-block"
                  ></span>
                {/each}
              </button>
            {/each}
          </div>
        </div>
      </div>
    {/if}

    {#if activeSection === "taskbar"}
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

    {#if activeSection === "about"}
      <div class="p-6 space-y-6 max-w-2xl">
        <div>
          <h2 class="text-xl font-semibold mb-4">About WebOS</h2>
          <p class="text-foreground/70 text-sm mb-6">Operating System for the web</p>
        </div>

        <!-- Version Information -->
        <div class="space-y-4 p-4 border border-foreground/20 rounded-lg bg-background/50">
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-medium">Version Information</h3>
            {#if import.meta.env.DEV}
              <span
                class="text-xs px-2 py-1 rounded bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 font-medium"
              >
                DEVELOPMENT
              </span>
            {/if}
          </div>

          <div class="space-y-2 text-sm">
            <div class="flex justify-between items-center py-2 border-b border-foreground/10">
              <span class="text-foreground/70">Version</span>
              <span class="font-mono font-medium">{APP_VERSION.version}</span>
            </div>

            <div class="flex justify-between items-center py-2 border-b border-foreground/10">
              <span class="text-foreground/70">Commit</span>
              <span class="font-mono text-xs">{APP_VERSION.commit}</span>
            </div>

            <div class="flex justify-between items-center py-2 border-b border-foreground/10">
              <span class="text-foreground/70">Branch</span>
              <span class="font-mono text-xs">{APP_VERSION.branch}</span>
            </div>

            <div class="flex justify-between items-center py-2 border-b border-foreground/10">
              <span class="text-foreground/70">Mode</span>
              <span class="text-xs">{import.meta.env.DEV ? "Development" : "Production"}</span>
            </div>

            <div class="flex justify-between items-center py-2">
              <span class="text-foreground/70">Build Time</span>
              <span class="text-xs">{new Date(APP_VERSION.buildTime).toLocaleString()}</span>
            </div>
          </div>
        </div>

        <!-- Update Check -->
        {#if !import.meta.env.DEV}
          <div class="space-y-4">
            <h3 class="text-lg font-medium">Updates</h3>

            <div class="flex items-start gap-4">
              <button
                onclick={checkForUpdates}
                disabled={isCheckingForUpdates}
                class="flex items-center gap-2 bg-primary text-background"
              >
                <RefreshCw class={cn("h-4 w-4", isCheckingForUpdates && "animate-spin")} />
                {isCheckingForUpdates ? "Checking..." : "Check for Updates"}
              </button>

              {#if updateStatus() === "available"}
                <div class="flex-1 p-3 bg-blue-500/20 border border-blue-500/30 rounded-lg">
                  <div class="flex items-start gap-2">
                    <Info class="h-5 w-5 text-blue-400 mt-0.5 shrink-0" />
                    <div class="flex-1">
                      <p class="font-medium text-blue-400">Update Available</p>
                      {#if newVersion}
                        <p class="text-sm text-foreground/70 mt-1">
                          v{newVersion.version} ({newVersion.commit})
                        </p>
                      {/if}
                      <button
                        onclick={applyUpdate}
                        disabled={isUpdating}
                        class="mt-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                      >
                        <RefreshCw class={cn("h-3 w-3 mr-1", isUpdating && "animate-spin")} />
                        {isUpdating ? "Updating..." : "Refresh to Update"}
                      </button>
                    </div>
                  </div>
                </div>
              {/if}

              {#if updateStatus() === "up-to-date"}
                <div class="flex-1 p-3 bg-green-500/20 border border-green-500/30 rounded-lg flex items-center gap-2">
                  <CheckCircle2 class="h-5 w-5 text-green-400" />
                  <p class="text-green-400 font-medium">You're up to date!</p>
                </div>
              {/if}

              {#if updateStatus() === "checking"}
                <div class="flex-1 p-3 border border-foreground/20 rounded-lg flex items-center gap-2">
                  <RefreshCw class="h-5 w-5 animate-spin" />
                  <p class="text-foreground/70">Checking for updates...</p>
                </div>
              {/if}
            </div>

            <p class="text-xs text-foreground/60">
              WebOS automatically checks for updates every 5 minutes while running.
            </p>
          </div>
        {/if}

        {#if import.meta.env.DEV}
          <div class="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
            <p class="text-sm text-foreground/70">
              <strong class="text-yellow-400">Development Mode:</strong> Automatic update checking is disabled.
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

