<script lang="ts">
  import type { ConflictChoice, DialogProps } from "$lib/core/api";
  import { CopySimple as CopySimpleIcon } from "phosphor-svelte";
  import { Button } from "../ui";

  let { name, folder, resolve }: DialogProps<ConflictChoice> & { name: string; folder: string } = $props();
</script>

<div class="grid w-[min(26rem,calc(100vw-2rem))] gap-4 rounded-2xl bg-background-lighter p-5 shadow-popover">
  <div class="flex items-start gap-3">
    <span class="grid size-10 shrink-0 place-items-center rounded-xl bg-warning/12 text-warning">
      <CopySimpleIcon class="size-5" weight="bold" />
    </span>
    <div class="min-w-0 pt-0.5">
      <h2 class="text-sm font-semibold break-words">“{name}” already exists</h2>
      <p class="mt-0.5 text-ui break-words text-foreground/65">
        There's already something with that name in <span class="font-mono text-2xs">{folder}</span>.
      </p>
    </div>
  </div>

  <div class="flex flex-wrap justify-end gap-2">
    <Button variant="quiet" onclick={() => resolve("skip")}>Skip</Button>
    <Button variant="secondary" onclick={() => resolve("replace")}>Replace</Button>
    <!-- svelte-ignore a11y_autofocus -->
    <Button variant="primary" autofocus onclick={() => resolve("keep_both")}>Keep both</Button>
  </div>
</div>
