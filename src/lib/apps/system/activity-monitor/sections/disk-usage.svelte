<script lang="ts">
  import kernel, { type AppsService, type FilesService, type SizeNode } from "$lib/core/api";
  import { get_app_context } from "$lib/core/contexts/app";
  import { Button, IconButton, Section, Spinner } from "$lib/core/components/ui";
  import { cn, error_message, format_bytes } from "$lib/core/utils";
  import { ArrowUp as ArrowUpIcon, CaretRight as CaretRightIcon } from "phosphor-svelte";
  import { untrack } from "svelte";
  import { ancestors, squarify, tile_kind, TileKind, type Tile } from "../treemap";

  const LIST_LIMIT = 12;

  const files = $derived(kernel.service<FilesService>("files"));
  const apps = $derived(kernel.service<AppsService>("apps"));
  const { window: win } = get_app_context();

  const KINDS = [
    { kind: TileKind.FOLDER, label: "Folders", fill: "bg-primary/45" },
    { kind: TileKind.IMAGE, label: "Images", fill: "bg-secondary/45" },
    { kind: TileKind.MEDIA, label: "Video and audio", fill: "bg-tertiary/45" },
    { kind: TileKind.OTHER, label: "Other files", fill: "bg-foreground/20" },
  ];
  const fill_of = (node: SizeNode) => (KINDS.find((entry) => entry.kind === tile_kind(node)) ?? KINDS[3]).fill;

  let path = $state("/");
  let tree = $state.raw<SizeNode | null>(null);
  let failure = $state<string | null>(null);
  let loading = $state(false);
  let picked = $state.raw<SizeNode | null>(null);
  let hovered = $state.raw<SizeNode | null>(null);
  let width = $state(0);
  let height = $state(0);

  let load_id = 0;
  // Three levels: the tiles, the tiles drawn inside folder tiles, and one more so those know they're folders.
  async function load(at: string) {
    const id = ++load_id;
    loading = true;
    try {
      const next = await files.size_tree(at, 3);
      if (id !== load_id) return;
      tree = next;
      failure = null;
      if (picked && !next.children?.some((child) => child.path === picked?.path)) picked = null;
    } catch (error) {
      if (id === load_id) failure = error_message(error);
    } finally {
      if (id === load_id) loading = false;
    }
  }

  $effect(() => {
    const at = path;
    files.revision(at);
    untrack(() => load(at));
  });

  $effect(() =>
    win.on_back(() => {
      if (path === "/") return false;
      go(parent_of(path));
      return true;
    })
  );

  const parent_of = (at: string) => ancestors(at).at(-2) ?? "/";
  const shown = $derived(hovered ?? picked ?? tree);
  const tiles = $derived(tree ? squarify(tree.children ?? [], (node) => node.size, { x: 0, y: 0, width, height }) : []);
  const children = $derived(tree?.children?.filter((child) => child.size > 0) ?? []);
  const empty_count = $derived((tree?.children?.length ?? 0) - children.length);

  function inner(tile: Tile<SizeNode>): Tile<SizeNode>[] {
    if (!tile.item.children || tile.width < 48 || tile.height < 56) return [];
    return squarify(tile.item.children, (node) => node.size, { x: 4, y: 26, width: tile.width - 10, height: tile.height - 32 });
  }

  function go(at: string) {
    path = at;
    picked = null;
    hovered = null;
  }

  function choose(node: SizeNode) {
    if (node.children) go(node.path);
    else picked = node;
  }

  function reveal(node: SizeNode) {
    apps.launch("file-explorer", { path: node.children ? node.path : parent_of(node.path) });
  }

  function share(node: SizeNode): string {
    const total = tree?.size ?? 0;
    return total > 0 ? `${Math.round((node.size / total) * 1000) / 10}%` : "—";
  }

  function onkeydown(event: KeyboardEvent) {
    if ((event.key === "Backspace" || (event.altKey && event.key === "ArrowUp")) && path !== "/") {
      event.preventDefault();
      go(parent_of(path));
    }
  }
</script>

<Section title="Disk usage" description="What takes up the file system. Open a folder to look inside.">
  {#snippet actions()}
    {#if loading && tree}<Spinner label="Measuring" />{/if}
    <Button size="sm" variant="quiet" onclick={() => load(path)}>Refresh</Button>
  {/snippet}

  <div class="flex flex-col gap-3 p-3 @container">
    <nav class="flex min-w-0 items-center gap-1" aria-label="Folder">
      <IconButton label="Up a folder" size="sm" disabled={path === "/"} onclick={() => go(parent_of(path))}>
        <ArrowUpIcon class="size-4" />
      </IconButton>
      <ol class="flex min-w-0 items-center gap-0.5 overflow-x-auto text-ui">
        {#each ancestors(path) as stop, index (stop)}
          {#if index > 0}<li aria-hidden="true" class="text-foreground/40"><CaretRightIcon class="size-3" /></li>{/if}
          <li class="shrink-0">
            <Button size="sm" variant="quiet" aria-current={stop === path ? "location" : undefined} onclick={() => go(stop)}>
              {stop === "/" ? "/" : stop.split("/").at(-1)}
            </Button>
          </li>
        {/each}
      </ol>
    </nav>

    <div class="relative h-64 overflow-hidden rounded-lg bg-background-darker @md:h-80 @xl:h-96" bind:clientWidth={width} bind:clientHeight={height}>
      {#if failure}
        <div class="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
          <p class="text-ui text-error">{failure}</p>
          {#if path !== "/"}<Button size="sm" onclick={() => go("/")}>Back to /</Button>{/if}
        </div>
      {:else if !tree}
        <div class="flex h-full items-center justify-center"><Spinner label="Measuring" /></div>
      {:else if tiles.length === 0}
        <p class="flex h-full items-center justify-center text-ui text-foreground/65">Empty</p>
      {:else}
        {#each tiles as tile (tile.item.path)}
          {@const labelled = tile.width > 56 && tile.height > 28}
          <button
            type="button"
            class={cn(
              "absolute overflow-hidden rounded-md text-left transition-opacity hover:opacity-85 active:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cottontail",
              tile.item.children ? "bg-primary/15" : fill_of(tile.item),
              picked?.path === tile.item.path && "ring-2 ring-inset ring-foreground/65"
            )}
            style:left="{tile.x + 1}px"
            style:top="{tile.y + 1}px"
            style:width="{Math.max(tile.width - 2, 0)}px"
            style:height="{Math.max(tile.height - 2, 0)}px"
            aria-label="{tile.item.name}, {format_bytes(tile.item.size)}{tile.item.children ? ', folder' : ''}"
            onclick={() => choose(tile.item)}
            {onkeydown}
            onfocus={() => (picked = tile.item)}
            onpointerenter={(event) => event.pointerType === "mouse" && (hovered = tile.item)}
            onpointerleave={() => (hovered = null)}
          >
            {#if labelled}
              <span class="absolute inset-x-0 top-0 truncate px-1.5 pt-1 text-ui font-medium">{tile.item.name}</span>
            {/if}
            {#each inner(tile) as cell (cell.item.path)}
              <span
                class={cn("pointer-events-none absolute rounded-sm", fill_of(cell.item))}
                style:left="{cell.x + 1}px"
                style:top="{cell.y + 1}px"
                style:width="{Math.max(cell.width - 2, 0)}px"
                style:height="{Math.max(cell.height - 2, 0)}px"
              ></span>
            {/each}
          </button>
        {/each}
      {/if}
    </div>

    {#if shown}
      <div class="flex min-h-9 flex-wrap items-center justify-between gap-x-4 gap-y-2" aria-live="polite">
        <div class="min-w-0">
          <p class="truncate text-ui font-medium">{shown === tree ? path : shown.name}</p>
          <p class="font-mono text-ui text-foreground/65 tabular-nums">
            {format_bytes(shown.size)}{shown === tree ? "" : ` · ${share(shown)} of ${tree?.name ?? "/"}`}
          </p>
        </div>
        <div class="flex shrink-0 gap-1.5">
          {#if shown !== tree && shown.children}
            <Button size="sm" onclick={() => go(shown.path)}>Open</Button>
          {/if}
          <Button size="sm" onclick={() => reveal(shown)}>Reveal in Explorer</Button>
        </div>
      </div>
    {/if}

    <ul class="flex flex-wrap gap-x-4 gap-y-1 text-ui text-foreground/65" aria-label="Colours">
      {#each KINDS as entry (entry.kind)}
        <li class="flex items-center gap-1.5"><span class={cn("size-3 rounded-sm", entry.fill)}></span>{entry.label}</li>
      {/each}
    </ul>
  </div>

  {#if children.length > 0}
    <ul aria-label="Biggest items">
      {#each children.slice(0, LIST_LIMIT) as child (child.path)}
        <li>
          <button
            type="button"
            class={cn(
              "flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-foreground/4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cottontail pointer-coarse:py-3",
              picked?.path === child.path && "bg-foreground/6"
            )}
            onclick={() => choose(child)}
            {onkeydown}
          >
            <span class={cn("size-3 shrink-0 rounded-sm", fill_of(child))}></span>
            <span class="min-w-0 flex-1 truncate text-ui">{child.children ? `${child.name}/` : child.name}</span>
            <span class="shrink-0 font-mono text-ui text-foreground/65 tabular-nums">{share(child)}</span>
            <span class="w-20 shrink-0 text-right font-mono text-ui tabular-nums">{format_bytes(child.size)}</span>
          </button>
        </li>
      {/each}
      {#if children.length > LIST_LIMIT || empty_count > 0}
        <li class="px-4 py-2.5 text-ui text-foreground/65">
          {[
            children.length > LIST_LIMIT ? `${children.length - LIST_LIMIT} smaller items` : "",
            empty_count > 0 ? `${empty_count} empty` : "",
          ]
            .filter(Boolean)
            .join(", ")}
        </li>
      {/if}
    </ul>
  {/if}
</Section>
