<script lang="ts">
  import kernel, { AiAvailability, type AiService, type ClipboardService } from "$lib/core/api";
  import { Button, IconButton, Spinner } from "$lib/core/components/ui";
  import { error_message } from "$lib/core/utils";
  import { Copy as CopyIcon, Sparkle as SparkleIcon, X as XIcon } from "phosphor-svelte";
  import { onMount } from "svelte";
  import { clean_help, help_messages, HELP_MODES, type HelpMode } from "./writing-help";

  interface Props {
    mode: HelpMode;
    text: string;
    onreplace: (text: string) => void;
    oninsert: (text: string) => void;
    onclose: () => void;
  }

  let { mode, text, onreplace, oninsert, onclose }: Props = $props();

  const ai = $derived(kernel.service<AiService>("ai"));
  const clipboard = $derived(kernel.service<ClipboardService>("clipboard"));
  const label = $derived(HELP_MODES.find((item) => item.mode === mode)?.label ?? "");

  let answer = $state("");
  let running = $state(true);
  let failure = $state("");
  let copied = $state(false);
  const result = $derived(clean_help(answer));
  const downloading = $derived(ai.features.prompt === AiAvailability.DOWNLOAD);

  onMount(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        for await (const piece of ai.prompt(help_messages(mode, text), { signal: controller.signal })) answer += piece;
      } catch (reason) {
        if (!controller.signal.aborted) failure = error_message(reason);
      } finally {
        running = false;
      }
    })();
    return () => controller.abort();
  });

  async function copy() {
    await clipboard.copy_text(result);
    copied = true;
  }
</script>

<div
  role="dialog"
  tabindex="-1"
  class="flex shrink-0 flex-col gap-2 border-b border-foreground/8 bg-background-light px-3 py-2"
  aria-label="Writing help"
  onkeydown={(event) => {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    onclose();
  }}
>
  <div class="flex items-center gap-2">
    <SparkleIcon weight="duotone" class="size-4 text-primary" />
    <h2 class="flex-1 text-ui font-semibold">{label}</h2>
    {#if running}<Spinner label="Writing" />{/if}
    <IconButton label="Cancel (Esc)" size="sm" onclick={onclose}><XIcon weight="bold" /></IconButton>
  </div>
  {#if failure}
    <p class="text-ui text-error">{failure}</p>
  {:else}
    <div class="max-h-48 min-h-10 overflow-y-auto rounded-md bg-background-darker px-2.5 py-2 text-ui whitespace-pre-wrap" aria-live="polite">
      {#if result}{result}{:else}<span class="text-foreground/65">{downloading ? "Downloading Chrome's AI model first, once. It runs on this device after that." : "Writing…"}</span>{/if}
    </div>
  {/if}
  <div class="flex flex-wrap items-center justify-end gap-1">
    <span class="mr-auto text-2xs text-foreground/65">On this device; check it before you use it.</span>
    <Button size="sm" variant="quiet" disabled={running || !result} onclick={copy}><CopyIcon weight="bold" />{copied ? "Copied" : "Copy"}</Button>
    <Button size="sm" disabled={running || !result} onclick={() => oninsert(result)}>Insert below</Button>
    <Button size="sm" variant="primary" disabled={running || !result} onclick={() => onreplace(result)}>Replace</Button>
  </div>
</div>
