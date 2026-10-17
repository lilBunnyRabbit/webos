<script lang="ts">
  import kernel, { NotificationType, type DialogsService, type FilesService, type NotificationsService } from "$lib/core/api";
  import { Button, CopyButton, EmptyState, IconButton, Spinner, Toolbar, button } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import { error_message } from "$lib/core/utils";
  import {
    ArrowClockwise as ArrowClockwiseIcon,
    ArrowSquareOut as ArrowSquareOutIcon,
    FolderOpen as FolderOpenIcon,
    Globe as GlobeIcon,
    Plus as PlusIcon,
    WarningCircle as WarningCircleIcon,
    X as XIcon,
  } from "phosphor-svelte";
  import { untrack } from "svelte";
  import { z } from "zod";
  import AddDialog from "./add-dialog.svelte";
  import Favicon from "./favicon.svelte";
  import { read_web_app, write_web_app } from "./store";
  import { ALLOW, EXTENSION, NOT_LOADING_AFTER_MS, SANDBOX, favicon_url, is_own_origin, parse_web_app } from "./web-app";

  const { path: initial_path }: { path?: string } = $props();

  const { window: win, storage, app_id } = get_app_context();
  const files = $derived(kernel.service<FilesService>("files"));
  const dialogs = $derived(kernel.service<DialogsService>("dialogs"));
  const notifications = $derived(kernel.service<NotificationsService>("notifications"));

  let path = $state(untrack(() => initial_path));
  let revision = $state(0);
  let frame = $state<"loading" | "loaded" | "stalled">("loading");
  const hint_closed = storage.window("hint_closed", false, z.boolean());

  const loading = $derived(
    path ? read_web_app(files, path).then((text) => (text === null ? { missing: true as const } : { missing: false as const, app: parse_web_app(text) })) : null
  );

  function show(next: string) {
    path = next;
    frame = "loading";
  }

  function reload() {
    revision++;
    frame = "loading";
  }

  async function pick() {
    const chosen = await win.pick_file({ accept: [EXTENSION], title: "Open a web app" });
    if (chosen) show(chosen);
  }

  async function add() {
    const added = await dialogs.show(AddDialog, {}, { window: win.id });
    if (!added) return;
    try {
      show(await write_web_app(files, added.folder, added.app));
    } catch (reason) {
      notifications.notify(app_id, { type: NotificationType.ERROR, title: "Couldn't save the web app", message: error_message(reason) });
    }
  }

  $effect(() => {
    const current = loading;
    let alive = true;
    win.set_title(null);
    void current?.then((result) => {
      if (alive && !result.missing && result.app) win.set_title(result.app.name);
    });
    return () => {
      alive = false;
    };
  });

  $effect(() => {
    if (frame !== "loading") return;
    void revision;
    const timer = setTimeout(() => (frame = "stalled"), NOT_LOADING_AFTER_MS);
    return () => clearTimeout(timer);
  });
</script>

{#if !loading}
  <EmptyState icon={GlobeIcon} title="No web app open" description="Add a website to keep it on the desktop, or open a .webapp file.">
    {#snippet actions()}<Button variant="primary" onclick={add}><PlusIcon weight="bold" /> Add web app…</Button><Button onclick={pick}><FolderOpenIcon weight="bold" /> Open…</Button>{/snippet}
  </EmptyState>
{:else}
  {#await loading}
    <div class="grid h-full place-items-center"><Spinner label="Reading the web app" /></div>
  {:then loaded}
    {#if loaded.missing}
      <EmptyState icon={WarningCircleIcon} tone="error" title="File not found" description={path} />
    {:else if !loaded.app}
      <EmptyState icon={WarningCircleIcon} tone="error" title="Not a web app" description="The file needs a name and an http or https address." />
    {:else if is_own_origin(loaded.app.url, location.origin)}
      <EmptyState icon={WarningCircleIcon} tone="error" title="WebOS can't open itself" description="A web app from this site could reach your files, so it isn't shown." />
    {:else}
      {@const app = loaded.app}
      {@const host = new URL(app.url).host}
      <div class="grid h-full grid-rows-[auto_1fr_auto]">
        <Toolbar>
          <Favicon src={favicon_url(app)} class="ml-1 size-4" />
          <span class="min-w-0 flex-1 truncate text-ui">
            {app.name} <span class="font-mono text-2xs text-foreground/65">{host}</span>
          </span>
          <IconButton label="Reload" size="sm" onclick={reload}><ArrowClockwiseIcon weight="bold" /></IconButton>
          <CopyButton text={app.url} label="Copy address" />
          <a href={app.url} target="_blank" rel="noopener noreferrer" aria-label="Open in a browser tab" title="Open in a browser tab" class={button({ variant: "quiet", size: "sm", icon: true })}>
            <ArrowSquareOutIcon weight="bold" />
          </a>
        </Toolbar>

        <div class="relative min-h-0">
          {#key revision}
            <iframe
              src={app.url}
              title={app.name}
              sandbox={SANDBOX}
              allow={ALLOW}
              allowfullscreen
              referrerpolicy="strict-origin-when-cross-origin"
              class="block size-full border-0 bg-white"
              onload={() => (frame = "loaded")}
            ></iframe>
          {/key}
          {#if frame === "loading"}
            <div class="absolute inset-0 grid place-items-center bg-background"><Spinner label="Loading {host}" /></div>
          {:else if frame === "stalled"}
            <EmptyState class="absolute inset-0 bg-background" icon={GlobeIcon} title="Not loading?" description="This site may refuse to be shown inside other pages.">
              {#snippet actions()}<a href={app.url} target="_blank" rel="noopener noreferrer" class={button({ variant: "primary" })}><ArrowSquareOutIcon weight="bold" /> Open in a browser tab</a><Button onclick={reload}><ArrowClockwiseIcon weight="bold" /> Retry</Button>{/snippet}
            </EmptyState>
          {/if}
        </div>

        {#if frame === "loaded" && !hint_closed.value}
          <div class="flex min-h-9 flex-wrap items-center gap-x-3 gap-y-1 border-t border-foreground/8 bg-background-light py-1 pr-1 pl-3 text-ui text-foreground/80">
            <span class="min-w-0 flex-1">Blank page? Some sites refuse to be shown inside other pages.</span>
            <a href={app.url} target="_blank" rel="noopener noreferrer" class={button({ variant: "quiet", size: "sm" })}>Open in a tab</a>
            <IconButton label="Hide this hint" size="sm" onclick={() => (hint_closed.value = true)}><XIcon weight="bold" /></IconButton>
          </div>
        {/if}
      </div>
    {/if}
  {:catch error}
    <EmptyState icon={WarningCircleIcon} tone="error" title="Couldn't read the file" description={error_message(error)} />
  {/await}
{/if}
