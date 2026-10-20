<script lang="ts">
  import kernel, { WallpaperFit, WallpaperPreset, type SettingsService, type Wallpaper } from "$lib/core/api";
  import { get_app_context } from "$lib/core/contexts/app";
  import { Button, Section, Segmented, SettingRow, Slider } from "$lib/core/components/ui";
  import WallpaperView from "$lib/core/components/desktop/wallpaper.svelte";
  import { report_file_error } from "$lib/core/components/files/file-explorer.errors";
  import { cn } from "$lib/core/utils";
  import { Check as CheckIcon, Image as ImageIcon } from "phosphor-svelte";
  import { Platform } from "$lib/core/api/kernel/platform";
  import { LIVE_WALLPAPERS, live_options_of } from "$lib/core/components/desktop/live/registry";
  import AppByline from "$lib/core/components/apps/app-byline.svelte";

  const settings = $derived(kernel.service<SettingsService>("settings"));
  const { window: win } = get_app_context();

  const LIVE = Object.entries(LIVE_WALLPAPERS).map(([id, entry]) => ({ id, entry }));
  const live = $derived(settings.wallpaper.kind === "live" ? { id: settings.wallpaper.id, entry: LIVE_WALLPAPERS[settings.wallpaper.id] } : null);

  const PRESETS: { preset: WallpaperPreset; label: string }[] = [
    { preset: WallpaperPreset.GRID, label: "Grid" },
    { preset: WallpaperPreset.GLOW, label: "Glow" },
    { preset: WallpaperPreset.TINT, label: "Tint" },
    { preset: WallpaperPreset.PLAIN, label: "Plain" },
  ];

  const FITS = [
    { value: WallpaperFit.FILL, label: "Fill" },
    { value: WallpaperFit.FIT, label: "Fit" },
    { value: WallpaperFit.TILE, label: "Tile" },
    { value: WallpaperFit.CENTER, label: "Center" },
  ];

  const image = $derived(settings.wallpaper.kind === "image" ? settings.wallpaper : null);
  let busy = $state(false);

  async function set_image(source: string | File) {
    busy = true;
    try {
      await settings.set_wallpaper_image(source);
    } catch (error) {
      report_file_error("Couldn't set the wallpaper", error);
    } finally {
      busy = false;
    }
  }

  async function choose() {
    const path = await win.pick_file({ accept: ["image/*"], title: "Choose a wallpaper" });
    if (path) await set_image(path);
  }

  function update(change: Partial<Extract<Wallpaper, { kind: "image" }>>) {
    if (image) settings.wallpaper = { ...image, ...change };
  }
</script>

{#snippet tile(label: string, active: boolean, onselect: () => void, preview: Wallpaper | null, dots = false)}
  <button
    aria-pressed={active}
    class={cn("group flex flex-col gap-1.5 rounded-xl p-1.5 text-left transition-colors duration-150", active ? "bg-foreground/10" : "hover:bg-foreground/6")}
    onclick={onselect}
    disabled={busy}
  >
    <span
      class={cn(
        "relative isolate grid aspect-[16/10] w-full place-items-center overflow-hidden rounded-lg ring-1 transition-shadow",
        active ? "ring-2 ring-primary" : "ring-foreground/12",
        dots && "dots"
      )}
    >
      {#if preview}
        <WallpaperView value={preview} />
      {:else}
        <ImageIcon class="size-6 text-foreground/50" weight="duotone" />
      {/if}
    </span>
    <span class="flex items-center gap-1 px-0.5 text-ui">
      {label}
      {#if active}<CheckIcon class="size-3.5 text-primary" weight="bold" />{/if}
    </span>
  </button>
{/snippet}

<Section title="Wallpaper" description="Behind the desktop and the phone's home screen. Presets follow the theme." flush>
  <div class="flex flex-col gap-4">
    <div class="grid grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] gap-2">
      {#each PRESETS as { preset, label } (preset)}
        {@const value: Wallpaper = { kind: "preset", preset }}
        {@render tile(
          label,
          (settings.wallpaper.kind === "preset" && settings.wallpaper.preset === preset) ||
            (settings.wallpaper.kind === "live" && kernel.platform === Platform.MOBILE && preset === WallpaperPreset.GRID),
          () => (settings.wallpaper = value),
          value,
          preset === WallpaperPreset.GRID
        )}
      {/each}
      {@render tile(image ? "Image" : "Image…", image !== null, () => !image && choose(), image)}
    </div>

    <div class="flex flex-wrap gap-2">
      <Button variant="secondary" size="sm" onclick={choose} disabled={busy}>Choose image…</Button>
    </div>

    {#if image}
      <div class="flex flex-col gap-1">
        <SettingRow label="Fit" description="How the image fills the screen.">
          {#snippet children({ id, describedby })}
            <Segmented {id} aria-describedby={describedby} label="Fit" size="sm" options={FITS} bind:value={() => image.fit, (fit) => update({ fit })} />
          {/snippet}
        </SettingRow>
        <SettingRow label="Dim" description="Fades the image toward the theme, so icons stay readable.">
          {#snippet children({ id, describedby })}
            <Slider {id} aria-describedby={describedby} class="w-40" min={0} max={60} bind:value={() => Math.round(image.dim * 100), (dim) => update({ dim: dim / 100 })} />
          {/snippet}
        </SettingRow>
        <SettingRow label="Blur">
          {#snippet children({ id, describedby })}
            <Slider {id} aria-describedby={describedby} class="w-40" min={0} max={20} bind:value={() => image.blur, (blur) => update({ blur })} />
          {/snippet}
        </SettingRow>
      </div>
    {/if}
  </div>
</Section>

{#if kernel.platform !== Platform.MOBILE}
  <Section title="Live wallpapers" description="Animated, and they react to the pointer and your windows. Desktop only." flush>
    <div class="flex flex-col gap-4">
      <div class="grid grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] gap-2">
        {#each LIVE as { id, entry } (id)}
          {@const value: Wallpaper = { kind: "live", id }}
          {@render tile(entry.name, live?.id === id, () => (settings.wallpaper = value), value)}
        {/each}
      </div>

      {#if live?.entry}
        {@const { id, entry } = live}
        <AppByline manifest={entry} class="px-0.5" />
        {#if entry.settings}
          {#await entry.settings() then { default: Options }}
            <Options value={live_options_of(id, settings.live_options[id])} onchange={(next) => (settings.live_options = { ...settings.live_options, [id]: next })} />
          {/await}
        {/if}
      {/if}
    </div>
  </Section>
{/if}

<style>
  .dots::after {
    content: "";
    position: absolute;
    inset: 0;
    pointer-events: none;
    background-image: radial-gradient(circle at center, color-mix(in oklch, var(--foreground) 22%, transparent) 1px, transparent 1.5px);
    background-size: 14px 14px;
  }
</style>
