<script lang="ts">
  import kernel, { type FilesService } from "$lib/core/api";
  import { base_name } from "$lib/core/api/services/files/path";
  import { Button, EmptyState, IconButton, Input, Segmented, Spinner, StatusBar, Textarea, Toolbar } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import { error_message, format_bytes } from "$lib/core/utils";
  import {
    ArrowClockwise as ArrowClockwiseIcon,
    Code as CodeIcon,
    FileHtml as FileHtmlIcon,
    FolderOpen as FolderOpenIcon,
    Globe as GlobeIcon,
    ShareNetwork as ShareNetworkIcon,
  } from "phosphor-svelte";
  import { untrack } from "svelte";
  import { z } from "zod";
  import { explain_fetch_error, type FetchProblem } from "../api-client/request";
  import { blind_spots, evaluate } from "./checks";
  import ChecksView from "./checks-view.svelte";
  import ImageView from "./image-view.svelte";
  import manifest from "./index";
  import { fetch_page, normalize_url, probe_image, probe_robots, type ImageProbe, type RobotsInfo } from "./page";
  import { parse_html, suggested_base, type FetchInfo } from "./parse";
  import type { Platform } from "./platforms";
  import PreviewsView from "./previews-view.svelte";
  import RawView from "./raw-view.svelte";

  const { path, url }: { path?: string; url?: string } = $props();

  const Source = { URL: "url", HTML: "html", FILE: "file" } as const;
  type Source = (typeof Source)[keyof typeof Source];
  const View = { PREVIEWS: "previews", CHECKS: "checks", IMAGE: "image", RAW: "raw" } as const;
  type View = (typeof View)[keyof typeof View];

  interface Loaded {
    html: string;
    name: string;
    response: FetchInfo | null;
  }

  const { window: win, storage } = get_app_context();
  const files = $derived(kernel.service<FilesService>("files"));

  const initial = untrack(() => ({ path, url }));
  const source = storage.window<Source>("source", initial.path ? Source.FILE : Source.URL, z.enum([Source.URL, Source.HTML, Source.FILE]));
  const address = storage.window<string>("url", initial.url ?? "", z.string());
  const view = storage.window<View>("view", View.PREVIEWS, z.enum([View.PREVIEWS, View.CHECKS, View.IMAGE, View.RAW]));

  let pasted = $state("");
  let base = $state("");
  let loaded = $state.raw<Loaded | null>(null);
  let problem = $state.raw<FetchProblem | null>(null);
  let controller = $state.raw<AbortController | null>(null);
  let reading = $state(false);
  let focus = $state<Platform | null>(null);

  let image_probe = $state.raw<ImageProbe | null>(null);
  let probing = $state(false);
  let robots = $state.raw<RobotsInfo | null>(null);

  const meta = $derived(loaded ? parse_html(loaded.html, base.trim() || null, loaded.response) : null);
  const image_url = $derived(meta?.derived.image && /^(https?|blob|data):/i.test(meta.derived.image) ? meta.derived.image : null);
  const origin = $derived.by(() => {
    if (!meta?.url || !/^https?:/i.test(meta.url)) return null;
    return new URL(meta.url).origin;
  });
  const input = $derived(meta ? { meta, image: image_probe, robots } : null);
  const reports = $derived(input ? evaluate(input) : []);
  const notes = $derived(input ? blind_spots(input) : []);
  const size = $derived(loaded ? new Blob([loaded.html]).size : 0);
  const unfurl = $derived(reports.filter((report) => report.will_unfurl).length);

  $effect(() => {
    const target = image_url;
    image_probe = null;
    if (!target) return;
    const own = new AbortController();
    probing = true;
    void probe_image(target, own.signal).then((probe) => {
      if (own.signal.aborted) return;
      image_probe = probe;
      probing = false;
    });
    return () => {
      own.abort();
      probing = false;
    };
  });

  $effect(() => {
    const target = origin;
    robots = null;
    if (!target) return;
    const own = new AbortController();
    void probe_robots(target, own.signal).then((info) => {
      if (!own.signal.aborted) robots = info;
    });
    return () => own.abort();
  });

  $effect(() => win.set_title(loaded ? loaded.name : null));
  $effect(() => () => controller?.abort());

  function show(next: Loaded, suggested_from_html: boolean) {
    loaded = next;
    problem = null;
    if (suggested_from_html) base = suggested_base(parse_html(next.html, null));
  }

  async function fetch_url() {
    const target = normalize_url(address.value);
    if (!target) return;
    address.value = target;
    controller?.abort();
    const own = new AbortController();
    controller = own;
    problem = null;
    try {
      const page = await fetch_page(target, own.signal);
      base = page.url;
      show({ html: page.html, name: new URL(page.url).host, response: page.info }, false);
    } catch (reason) {
      if (own.signal.aborted) return;
      loaded = null;
      problem = explain_fetch_error(reason, target, { online: navigator.onLine, protocol: location.protocol });
    } finally {
      if (controller === own) controller = null;
    }
  }

  function cancel() {
    controller?.abort();
    controller = null;
  }

  function check_pasted() {
    if (!pasted.trim()) return;
    show({ html: pasted, name: "Pasted HTML", response: null }, true);
  }

  async function read(file: File | null, label: string) {
    reading = true;
    try {
      if (!file) throw new Error(`File not found: ${label}`);
      show({ html: await file.text(), name: file.name, response: null }, true);
    } catch (reason) {
      loaded = null;
      problem = { title: "Couldn't read the file", detail: error_message(reason) };
    } finally {
      reading = false;
    }
  }

  async function open_path(target: string) {
    source.value = Source.FILE;
    await read(await files.get_file(target).catch(() => null), target);
  }

  async function pick() {
    const chosen = await win.pick_file({ accept: manifest.tools, title: "Open in Link Preview" });
    if (chosen) await open_path(chosen);
  }

  function switch_source(next: Source) {
    source.value = next;
    loaded = null;
    problem = null;
  }

  function select(platform: Platform) {
    focus = platform;
    view.value = View.CHECKS;
  }

  if (initial.path) void open_path(initial.path);
  else if (initial.url) void fetch_url();
</script>

{#snippet file_actions()}
  <Button variant="primary" onclick={pick}><FolderOpenIcon weight="bold" /> Open a file…</Button>
{/snippet}

<div class="grid h-full grid-rows-[auto_1fr_auto]">
  <Toolbar>
    <Segmented
      size="sm"
      label="Source"
      options={[
        { value: Source.URL, label: "URL", icon: GlobeIcon },
        { value: Source.HTML, label: "HTML", icon: CodeIcon },
        { value: Source.FILE, label: "File", icon: FileHtmlIcon },
      ]}
      bind:value={() => source.value, switch_source}
    />
    <div class="flex-1"></div>
    {#if source.value === Source.FILE}
      <IconButton label="Open…" size="sm" onclick={pick}><FolderOpenIcon weight="bold" /></IconButton>
    {:else if source.value === Source.URL && loaded}
      <IconButton label="Fetch again" size="sm" disabled={controller !== null} onclick={fetch_url}><ArrowClockwiseIcon weight="bold" /></IconButton>
    {/if}
  </Toolbar>

  <div class="min-h-0 overflow-auto">
    <div class="mx-auto flex max-w-5xl flex-col gap-4 p-3 @sm:p-4">
      {#if source.value === Source.URL}
        <form
          class="flex flex-wrap gap-1.5"
          onsubmit={(event) => {
            event.preventDefault();
            void fetch_url();
          }}
        >
          <Input
            bind:value={address.value}
            class="min-w-48 flex-1 font-mono"
            aria-label="URL"
            placeholder="https://example.com or localhost:5173"
            inputmode="url"
            spellcheck="false"
            autocapitalize="off"
          />
          {#if controller}
            <Button type="button" onclick={cancel}>Cancel</Button>
          {:else}
            <Button type="submit" variant="primary" disabled={!address.value.trim()}><GlobeIcon weight="bold" /> Fetch</Button>
          {/if}
        </form>
      {:else if source.value === Source.HTML}
        <div class="flex flex-col gap-1.5">
          <Textarea
            bind:value={pasted}
            mono
            rows={5}
            aria-label="Page HTML"
            placeholder="Paste the page's HTML: open the page, View Source, select all and copy."
            onkeydown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) check_pasted();
            }}
          />
          <Button variant="primary" class="self-end" disabled={!pasted.trim()} onclick={check_pasted}>Check</Button>
        </div>
      {/if}

      {#if loaded}
        <label class="flex flex-col gap-1 @md:flex-row @md:items-center @md:gap-3">
          <span class="shrink-0 text-ui text-foreground/80">Base URL</span>
          <Input bind:value={base} size="sm" class="min-w-0 font-mono @md:flex-1" placeholder="https://your-site.com/page" inputmode="url" spellcheck="false" autocapitalize="off" />
        </label>
      {/if}

      {#if problem}
        <div role="alert" class="flex flex-col gap-1 rounded-md bg-error/12 px-3 py-2 text-ui text-error">
          <p class="font-medium">{problem.title}</p>
          {#if problem.detail}<p class="text-foreground/80">{problem.detail}</p>{/if}
          {#if source.value === Source.URL}
            <p class="text-foreground/80">
              WebOS has no server to fetch through, so only sites that allow other sites work, such as your own dev server with Access-Control-Allow-Origin. For any other page, paste its source under HTML or open a saved copy under File, then set its address as the base URL.
            </p>
          {/if}
        </div>
      {/if}

      {#if controller || reading}
        <div class="grid place-items-center py-12"><Spinner label={reading ? "Reading the file" : "Fetching"} /></div>
      {:else if meta}
        <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Segmented
            size="sm"
            label="View"
            bind:value={view.value}
            options={[
              { value: View.PREVIEWS, label: "Previews" },
              { value: View.CHECKS, label: "Checks" },
              { value: View.IMAGE, label: "Image" },
              { value: View.RAW, label: "Raw" },
            ]}
            class="max-w-full overflow-x-auto"
          />
          <span class="text-ui text-foreground/65">{unfurl} of {reports.length} unfurl</span>
        </div>

        {#if view.value === View.PREVIEWS}
          <PreviewsView {meta} {reports} onselect={select} />
        {:else if view.value === View.CHECKS}
          <ChecksView {reports} {notes} {focus} />
        {:else if view.value === View.IMAGE}
          <ImageView {meta} probe={image_probe} {probing} />
        {:else}
          <RawView {meta} />
        {/if}
      {:else if !problem}
        {#if source.value === Source.FILE}
          <EmptyState icon={FileHtmlIcon} title="No file open" description="Open a saved HTML page to see its link previews and what to fix." actions={file_actions} />
        {:else if source.value === Source.HTML}
          <EmptyState icon={CodeIcon} title="Paste a page's HTML" description="Its meta tags are read here, nothing runs. Set the base URL after so relative images resolve." />
        {:else}
          <EmptyState
            icon={ShareNetworkIcon}
            title="See how a link unfurls"
            description="Fetch a URL to preview it in Slack, X, Facebook, Discord, LinkedIn and iMessage. Only servers that allow other sites (CORS) answer, like a local dev server; for others, paste the HTML or open a file."
          />
        {/if}
      {/if}
    </div>
  </div>

  <StatusBar>
    {#if loaded}
      <span class="truncate">{loaded.name}</span>
      {#if loaded.response}<span>HTTP {loaded.response.status}</span>{/if}
      <span class="ml-auto hidden @sm:inline">{meta?.raw_meta_tags.length ?? 0} meta tags</span>
      <span class="ml-auto @sm:ml-0">{format_bytes(size)}</span>
    {:else}
      <span>{source.value === Source.FILE && path ? base_name(path) : "Nothing loaded"}</span>
    {/if}
  </StatusBar>
</div>
