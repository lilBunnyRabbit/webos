<script lang="ts" module>
  import type { AppId, WidgetProps } from "$lib/core/api";
  import type { Component } from "svelte";

  // Loaded once per app. Moving any desktop item hands every widget a new item object; a fresh import promise from each
  // re-derivation showed the spinner for a frame although the module was cached.
  const loaded = new Map<AppId, Component<WidgetProps>>();
</script>

<script lang="ts">
  import kernel, { type AppsService, type DesktopItem } from "$lib/core/api";
  import type { WidgetSize } from "$lib/core/api/services/apps/type";
  import { Spinner } from "../ui";
  import LoadFailed from "../update/load-failed.svelte";

  type Widget = Extract<DesktopItem, { kind: "widget" }>;

  /** The app's widget component for a `.widget` entry, shared by the desktop frame and the phone home. */
  let { item, size = item.size }: { item: Widget; size?: WidgetSize } = $props();

  const apps = $derived(kernel.service<AppsService>("apps"));
  const manifest = $derived(apps.get(item.app_id));
  const widget_props = $derived.by(() => {
    if (!manifest?.props) return item.props ?? {};
    const result = manifest.props.safeParse(item.props ?? {});
    return result.success ? result.data : null;
  });
  const component = $derived.by(() => {
    if (!manifest?.widget || !widget_props) return null;
    const app_id = item.app_id;
    return loaded.get(app_id) ?? manifest.widget().then((module) => (loaded.set(app_id, module.default), module.default));
  });
</script>

{#if component && !(component instanceof Promise)}
  {@const Widget = component}
  <Widget props={widget_props ?? {}} {size} name={item.name} />
{:else if component}
  {#await component}
    <div class="grid h-full place-items-center"><Spinner /></div>
  {:then Widget}
    <Widget props={widget_props ?? {}} {size} name={item.name} />
  {:catch error}
    <LoadFailed {error} what="widget" compact />
  {/await}
{:else}
  <p class="p-3 text-ui text-foreground/65">{manifest ? (widget_props ? `${manifest.name} has no widget.` : "This widget's file is broken.") : "The app for this widget isn't installed."}</p>
{/if}
