<script lang="ts">
  import { CopyButton, Input } from "$lib/core/components/ui";
  import { WarningCircle as WarningCircleIcon } from "phosphor-svelte";
  import { LONG_LINK } from "./link";

  let { link, label }: { link: string; label: string } = $props();
</script>

<div class="flex flex-col gap-1.5">
  <span class="text-2xs font-medium tracking-wide text-foreground/65 uppercase">{label}</span>
  <div class="flex items-center gap-1.5">
    <Input readonly value={link} aria-label={label} class="min-w-0 flex-1 font-mono text-2xs" onfocus={(event) => event.currentTarget.select()} />
    <CopyButton text={link} label="Copy link" size="md" />
  </div>
  <p class="font-mono text-2xs text-foreground/65 tabular-nums">{link.length.toLocaleString("en")} characters</p>
  {#if link.length > LONG_LINK}
    <p class="flex items-start gap-1.5 text-2xs text-warning">
      <WarningCircleIcon weight="fill" class="mt-px size-3.5 shrink-0" />
      Long link: some chat apps, emails and QR codes cut links over {LONG_LINK.toLocaleString("en")} characters. A shorter form travels better.
    </p>
  {/if}
</div>
