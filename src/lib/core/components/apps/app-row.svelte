<script lang="ts">
  import type { AppManifest } from "$lib/core/api";
  import type { HTMLButtonAttributes } from "svelte/elements";
  import { cn } from "$lib/core/utils";
  import { long_press } from "$lib/core/utils/long-press";
  import type { Position } from "$lib/core/utils/type";
  import ShortcutIcon from "../files/shortcut-icon.svelte";
  import AppBadge from "./app-badge.svelte";
  import AppProgress from "./app-progress.svelte";

  interface Props extends HTMLButtonAttributes {
    manifest: AppManifest;
    on_menu: (point: Position) => void;
    /** The label sits on the wallpaper, so a photo wallpaper gives it a backing. */
    wallpaper?: boolean;
  }

  let { manifest, on_menu, wallpaper = false, class: class_name, children, ...rest }: Props = $props();
</script>

<button
  type="button"
  {...rest}
  {@attach long_press({ on_menu })}
  class={cn("flex min-h-14 w-full items-center gap-4 rounded-2xl px-2 py-1.5 text-left transition-colors duration-150 active:bg-foreground/8", class_name)}
>
  <span class="relative grid size-11 shrink-0 place-items-center rounded-xl bg-background-light text-foreground shadow-raised ring-1 ring-foreground/10">
    <ShortcutIcon app_id={manifest.id} badge={false} class="size-6" />
    <AppProgress app_id={manifest.id} />
    <AppBadge app_id={manifest.id} />
  </span>
  <span data-wallpaper-label={wallpaper ? "" : undefined} class="truncate text-xl tracking-tight">{manifest.name}</span>
  {@render children?.()}
</button>
