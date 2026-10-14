<script lang="ts">
  import kernel, { NotificationType, Platform, type AppManifest, type AppsService, type DesktopService, type NotificationsService } from "$lib/core/api";
  import { get_app_context } from "$lib/core/contexts/app";
  import AppBadge from "$lib/core/components/apps/app-badge.svelte";
  import { Badge, Button, IconButton } from "$lib/core/components/ui";
  import { ArrowLeft as ArrowLeftIcon, Play as PlayIcon, PushPin as PushPinIcon, Sticker as StickerIcon } from "phosphor-svelte";
  import { WIDGET_FALLBACK_SIZE } from "$lib/core/api/services/apps/widget";
  import { app_commands, app_file_types, category_label } from "./library";

  let { manifest, onback }: { manifest: AppManifest; onback: () => void } = $props();

  const { app_id } = get_app_context();
  const apps = $derived(kernel.service<AppsService>("apps"));
  const desktop = $derived(kernel.service<DesktopService>("desktop"));
  const notifications = $derived(kernel.service<NotificationsService>("notifications"));

  const mobile = kernel.platform === Platform.MOBILE;
  const types = $derived(app_file_types(manifest));
  const commands = $derived(app_commands(manifest));
  const size = $derived(manifest.widget_size);

  async function pin() {
    try {
      const name = await desktop.pin(manifest.id);
      if (!name) throw new Error(`${manifest.name} isn't installed`);
      notifications.notify(app_id, { title: mobile ? "Added to the home screen" : "Pinned to the desktop", message: manifest.name });
    } catch (reason) {
      notifications.notify(app_id, { type: NotificationType.ERROR, title: `Couldn't pin ${manifest.name}`, message: String(reason) });
    }
  }

  async function add_widget() {
    try {
      const name = await desktop.pin_widget(manifest.id, { label: manifest.name });
      if (!name) throw new Error("The desktop is full");
      notifications.notify(app_id, { title: "Widget added to the desktop", message: manifest.name });
    } catch (reason) {
      notifications.notify(app_id, { type: NotificationType.ERROR, title: `Couldn't add the ${manifest.name} widget`, message: String(reason) });
    }
  }
</script>

{#snippet heading(text: string)}
  <h3 class="pb-1.5 text-2xs font-medium tracking-wide text-foreground/65 uppercase">{text}</h3>
{/snippet}

{#snippet chips(list: string[], mono = false)}
  <ul class="flex flex-wrap gap-1">
    {#each list as item (item)}
      <li><Badge class={mono ? "font-mono" : undefined}>{item}</Badge></li>
    {/each}
  </ul>
{/snippet}

<div class="flex flex-col gap-5 p-4 @4xl:p-5">
  <div class="flex items-start gap-3">
    <IconButton label="Back to all apps" class="-ml-1 @4xl:hidden" onclick={onback}>
      <ArrowLeftIcon weight="bold" />
    </IconButton>
    <span class="relative grid size-14 shrink-0 place-items-center rounded-2xl bg-background-light shadow-raised ring-1 ring-foreground/10">
      <manifest.icon class="size-8" weight="duotone" />
      <AppBadge app_id={manifest.id} />
    </span>
    <div class="min-w-0 flex-1">
      <h2 class="truncate text-base font-semibold">{manifest.name}</h2>
      <p class="flex flex-wrap items-center gap-x-2 text-ui text-foreground/80">
        {category_label(manifest)}
        <span class="font-mono text-2xs text-foreground/65">v{manifest.version}</span>
      </p>
    </div>
  </div>

  <div class="flex flex-wrap gap-1.5">
    <Button variant="primary" onclick={() => apps.launch(manifest.id)}><PlayIcon weight="fill" /> Launch</Button>
    <Button onclick={pin}><PushPinIcon weight="bold" /> {mobile ? "Add to home screen" : "Pin to desktop"}</Button>
    {#if manifest.widget && !mobile}
      <Button onclick={add_widget}><StickerIcon weight="bold" /> Add widget</Button>
    {/if}
  </div>

  {#if manifest.description}
    <p class="text-sm text-pretty">{manifest.description}</p>
  {/if}

  {#if manifest.keywords?.length}
    <section>{@render heading("Keywords")}{@render chips(manifest.keywords)}</section>
  {/if}

  {#if types.opens.length}
    <section>{@render heading("Opens")}{@render chips(types.opens, true)}</section>
  {/if}

  {#if types.works_on.length}
    <section>
      {@render heading("Works on, from Open with")}
      {@render chips(types.works_on, true)}
    </section>
  {/if}

  {#if commands.length}
    <section>
      {@render heading("Commands")}
      <ul class="flex flex-col gap-1">
        {#each commands as command (command.id)}
          <li class="flex min-w-0 items-baseline gap-2">
            <span class="shrink-0 font-mono text-2xs">{command.id}</span>
            <span class="truncate text-2xs text-foreground/65" title={command.description}>{command.description}</span>
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  {#if manifest.widget}
    <section>
      {@render heading("Widget")}
      <p class="text-ui text-foreground/80">
        {#if size}
          <span class="font-mono">{size.default.w}×{size.default.h}</span>, resizable from
          <span class="font-mono">{size.min.w}×{size.min.h}</span> to <span class="font-mono">{size.max.w}×{size.max.h}</span> cells
        {:else}
          <span class="font-mono">{WIDGET_FALLBACK_SIZE.w}×{WIDGET_FALLBACK_SIZE.h}</span> cells, fixed size
        {/if}
        {#if mobile}· desktop only{/if}
      </p>
    </section>
  {/if}

  <section>
    {@render heading("Shell")}
    <p class="font-mono text-2xs text-foreground/80">app launch {manifest.id}</p>
  </section>
</div>
