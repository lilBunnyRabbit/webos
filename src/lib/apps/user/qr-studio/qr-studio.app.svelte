<script lang="ts">
  import { Segmented } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import { untrack } from "svelte";
  import { z } from "zod";
  import { Ecc } from "./encode/tables";
  import QrStudioHow from "./qr-studio-how.svelte";
  import QrStudioMake from "./qr-studio-make.svelte";
  import { SAMPLE_TEXT, View } from "./views";

  const { text }: { text?: string } = $props();
  const { storage } = get_app_context();

  const initial_text = untrack(() => text);
  const view = storage.window<View>("view", View.MAKE, z.enum([View.MAKE, View.HOW]));
  let how_text = $state(SAMPLE_TEXT);
  let how_ecc = $state<Ecc>(Ecc.M);

  const VIEWS = [
    { value: View.MAKE, label: "Make" },
    { value: View.HOW, label: "How it works" },
  ];

  function explain(next: string, ecc: Ecc) {
    how_text = next;
    how_ecc = ecc;
    view.value = View.HOW;
  }
</script>

{#snippet tabs()}
  <Segmented size="sm" label="Mode" options={VIEWS} bind:value={view.value} />
{/snippet}

<div class="h-full">
  <div class="h-full" hidden={view.value !== View.MAKE}>
    <QrStudioMake {tabs} {initial_text} on_explain={explain} />
  </div>
  <div class="h-full" hidden={view.value !== View.HOW}>
    <QrStudioHow {tabs} bind:text={how_text} bind:ecc={how_ecc} />
  </div>
</div>
