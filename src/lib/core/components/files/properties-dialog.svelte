<script lang="ts">
  import kernel, { type DialogProps, type FilesService } from "$lib/core/api";
  import { split_path, join_path } from "$lib/core/api/services/files/path";
  import { format_bytes, format_datetime } from "$lib/core/utils";
  import { Button, Spinner } from "../ui";
  import FileIcon from "./file-icon.svelte";

  let { path, kind, resolve }: DialogProps<true> & { path: string; kind: "file" | "directory" } = $props();

  const files = $derived(kernel.service<FilesService>("files"));
  const name = $derived(split_path(path).at(-1) ?? "/");
  const location = $derived(join_path(split_path(path).slice(0, -1)));

  interface Details {
    rows: [string, string][];
    type?: string;
  }

  const details = $derived.by(async (): Promise<Details> => {
    if (kind === "file") {
      const file = await files.get_file(path);
      if (!file) throw new Error("It no longer exists.");
      return {
        type: file.type,
        rows: [
          ["Kind", file.type || "File"],
          ["Size", `${format_bytes(file.size)} (${file.size.toLocaleString()} bytes)`],
          ["Modified", format_datetime(file.lastModified)],
          ["Location", location],
        ],
      };
    }

    const directory = await files.get_directory(path);
    if (!directory) throw new Error("It no longer exists.");
    const [size, items] = await Promise.all([files.get_directory_size(directory), files.list(directory, { include_metadata: false })]);
    const folders = items.filter((item) => item.kind === "directory").length;
    return {
      rows: [
        ["Kind", "Folder"],
        ["Size", format_bytes(size)],
        ["Contains", `${items.length - folders} files, ${folders} folders`],
        ["Location", location],
      ],
    };
  });
</script>

<div class="grid w-[min(26rem,calc(100vw-2rem))] gap-4 rounded-2xl bg-background-lighter p-5 shadow-popover">
  <div class="flex items-center gap-3">
    <span class="grid size-12 shrink-0 place-items-center rounded-xl bg-background-light ring-1 ring-foreground/10">
      {#await details}
        <FileIcon {name} {kind} weight="duotone" class="size-6" />
      {:then loaded}
        <FileIcon {name} {kind} mime_type={loaded.type} weight="duotone" class="size-6" />
      {:catch}
        <FileIcon {name} {kind} weight="duotone" class="size-6" />
      {/await}
    </span>
    <div class="min-w-0">
      <h2 class="truncate text-sm font-semibold" title={name}>{name}</h2>
      <p class="text-ui text-foreground/65">Properties</p>
    </div>
  </div>

  {#await details}
    <div class="grid h-28 place-items-center"><Spinner label="Reading properties" /></div>
  {:then loaded}
    <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-xl bg-background-light p-4 ring-1 ring-foreground/8">
      {#each loaded.rows as [label, value] (label)}
        <dt class="text-ui text-foreground/80">{label}</dt>
        <dd class="min-w-0 truncate text-right font-mono text-2xs leading-5" title={value}>{value}</dd>
      {/each}
    </dl>
  {:catch error}
    <p class="text-ui text-error">Couldn't read properties. {error instanceof Error ? error.message : ""}</p>
  {/await}

  <div class="flex justify-end">
    <!-- svelte-ignore a11y_autofocus -->
    <Button variant="secondary" autofocus onclick={() => resolve(true)}>Close</Button>
  </div>
</div>
