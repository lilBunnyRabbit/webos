<script lang="ts">
  import { Segmented } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import { untrack } from "svelte";
  import { z } from "zod";
  import ArchiveBrowse from "./archive-browse.svelte";
  import ArchiveCreate from "./archive-create.svelte";
  import ArchiveHow from "./archive-how.svelte";
  import { SAMPLE_TEXT, View } from "./views";

  const { path, paths }: { path?: string; paths?: string[] } = $props();
  const { storage } = get_app_context();

  const initial_paths = untrack(() => paths ?? []);
  const initial_path = untrack(() => path);

  const view = storage.window<View>("view", initial_paths.length ? View.CREATE : View.BROWSE, z.enum([View.BROWSE, View.CREATE, View.HOW]));
  let how_text = $state(SAMPLE_TEXT);
  let how_source = $state<string | null>(null);

  const VIEWS = [
    { value: View.BROWSE, label: "Open" },
    { value: View.CREATE, label: "Create" },
    { value: View.HOW, label: "How it works" },
  ];

  function analyze(text: string, name: string) {
    how_text = text;
    how_source = name;
    view.value = View.HOW;
  }
</script>

{#snippet tabs()}
  <Segmented size="sm" label="Mode" options={VIEWS} bind:value={view.value} />
{/snippet}

<div class="h-full">
  <div class="h-full" hidden={view.value !== View.BROWSE}>
    <ArchiveBrowse {tabs} {initial_path} on_analyze={analyze} />
  </div>
  <div class="h-full" hidden={view.value !== View.CREATE}>
    <ArchiveCreate {tabs} {initial_paths} />
  </div>
  <div class="h-full" hidden={view.value !== View.HOW}>
    <ArchiveHow {tabs} bind:text={how_text} bind:source={how_source} />
  </div>
</div>
