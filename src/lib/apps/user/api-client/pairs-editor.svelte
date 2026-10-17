<script lang="ts">
  import { Button, IconButton, Input } from "$lib/core/components/ui";
  import { Plus as PlusIcon, X as XIcon } from "phosphor-svelte";
  import type { Pair } from "./http-file";

  interface Props {
    pairs: Pair[];
    label: string;
    name_placeholder?: string;
    value_placeholder?: string;
    onchange: (pairs: Pair[]) => void;
  }

  const { pairs, label, name_placeholder = "Name", value_placeholder = "Value", onchange }: Props = $props();

  const set = (index: number, patch: Partial<Pair>) => onchange(pairs.map((pair, at) => (at === index ? { ...pair, ...patch } : pair)));
</script>

<div class="flex flex-col gap-1.5">
  {#each pairs as pair, index (index)}
    <div class="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto] items-center gap-1.5">
      <Input
        size="sm"
        class="font-mono"
        aria-label="{label} name {index + 1}"
        placeholder={name_placeholder}
        value={pair.name}
        oninput={(event) => set(index, { name: event.currentTarget.value })}
      />
      <Input
        size="sm"
        class="font-mono"
        aria-label="{label} value {index + 1}"
        placeholder={value_placeholder}
        value={pair.value}
        oninput={(event) => set(index, { value: event.currentTarget.value })}
      />
      <IconButton size="sm" label="Remove" onclick={() => onchange(pairs.filter((_, at) => at !== index))}>
        <XIcon />
      </IconButton>
    </div>
  {/each}
  <Button size="sm" variant="quiet" class="self-start" onclick={() => onchange([...pairs, { name: "", value: "" }])}>
    <PlusIcon />Add {label.toLowerCase()}
  </Button>
</div>
