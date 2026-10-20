<script lang="ts">
  import kernel, { WallpaperPreset, type FilesService, type SettingsService, type Wallpaper, type WallpaperFit } from "$lib/core/api";
  import { Platform } from "$lib/core/api/kernel/platform";

  /** `value` draws a given wallpaper instead of the current one (Settings' previews). */
  let { value, class: class_name = "" }: { value?: Wallpaper; class?: string } = $props();

  const settings = $derived(kernel.service<SettingsService>("settings"));
  const files = $derived(kernel.service<FilesService>("files"));
  const GRID: Wallpaper = { kind: "preset", preset: WallpaperPreset.GRID };
  // Live wallpapers are desktop only (ADR-057); a phone carrying one from a backup draws the grid.
  const wallpaper = $derived.by(() => {
    const chosen = value ?? settings.wallpaper;
    return chosen.kind === "live" && kernel.platform === Platform.MOBILE ? GRID : chosen;
  });
  const image_path = $derived(wallpaper.kind === "image" ? wallpaper.path : null);

  let url = $state<string | null>(null);

  $effect(() => {
    const path = image_path;
    if (!path) {
      url = null;
      return;
    }
    let object_url: string | null = null;
    let cancelled = false;
    files.get_file(path).then((file) => {
      if (cancelled) return;
      object_url = file ? URL.createObjectURL(file) : null;
      url = object_url;
    });
    return () => {
      cancelled = true;
      if (object_url) URL.revokeObjectURL(object_url);
    };
  });

  const SIZE: Record<WallpaperFit, string> = { fill: "cover", fit: "contain", tile: "auto", center: "auto" };
</script>

<!-- A missing image file falls back to the glow, so the desktop never goes blank. -->
<div class="pointer-events-none absolute inset-0 -z-10 overflow-hidden bg-background-darkest {class_name}" aria-hidden="true">
  {#if wallpaper.kind === "image" && url}
    <div
      class="absolute bg-center"
      style:inset="{-wallpaper.blur * 2}px"
      style:background-image="url({url})"
      style:background-size={SIZE[wallpaper.fit]}
      style:background-repeat={wallpaper.fit === "tile" ? "repeat" : "no-repeat"}
      style:filter={wallpaper.blur > 0 ? `blur(${wallpaper.blur}px)` : undefined}
    ></div>
    {#if wallpaper.dim > 0}
      <div class="absolute inset-0 bg-background-darkest" style:opacity={wallpaper.dim}></div>
    {/if}
  {:else}
    <div class="preset absolute inset-0" data-preset={wallpaper.kind === "preset" ? wallpaper.preset : "glow"}></div>
    {#if wallpaper.kind === "live"}
      {@const id = wallpaper.id}
      {#await import("./live/live-layer.svelte") then { default: LiveLayer }}
        <LiveLayer {id} layer="background" preview={value !== undefined} />
      {/await}
    {/if}
  {/if}
</div>

<style>
  /* Presets are shades of one surface; tint adds a single brand colour fading into it, never a blend of two. */
  .preset[data-preset="grid"],
  .preset[data-preset="glow"] {
    background: radial-gradient(ellipse 90% 70% at 50% -10%, var(--background-dark), transparent 70%);
  }

  .preset[data-preset="tint"] {
    background:
      radial-gradient(ellipse 110% 85% at 90% 120%, color-mix(in oklch, var(--primary) 30%, transparent), transparent 70%),
      radial-gradient(ellipse 90% 70% at 50% -10%, var(--background-dark), transparent 70%);
  }
</style>
