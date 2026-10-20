<script lang="ts">
  import { Button, CopyButton, EmptyState, IconButton, Toolbar } from "$lib/core/components/ui";
  import { cn } from "$lib/core/utils";
  import { get_app_context } from "$lib/core/contexts/app";
  import { qr_path } from "$kit/utils/qr";
  import { QrFrames } from "$kit/components/qr-transfer";
  import { FileZip as FileZipIcon, ShareNetwork as ShareNetworkIcon, Warning as WarningIcon, X as XIcon } from "phosphor-svelte";
  import { CODE_FIELD, CODE_INK } from "./colors";

  interface Props {
    title: string;
    caption: string;
    /** What the QR holds; `null` when it doesn't fit one code. */
    text: string | null;
    /** A list as cycling codes (ADR-053), instead of `text`. */
    frames?: string[];
    onclose: () => void;
    onfile?: () => void;
  }

  let { title, caption, text, frames, onclose, onfile }: Props = $props();

  const { window: win } = get_app_context();
  const qr = $derived(text ? qr_path(text) : null);
  const can_share = typeof navigator.share === "function";

  function share() {
    if (!text) return;
    navigator.share({ text }).catch((reason: unknown) => {
      if (!(reason instanceof DOMException && reason.name === "AbortError")) console.warn("[Cards] share failed", reason);
    });
  }

  function on_keydown(event: KeyboardEvent) {
    if (event.key !== "Escape" || !win.is_focused) return;
    event.stopPropagation();
    onclose();
  }

  const focus_on_open = (node: HTMLElement) => node.focus({ preventScroll: true });
</script>

<svelte:document onkeydown={on_keydown} />

<section aria-label={title} tabindex="-1" class="absolute inset-0 z-20 flex animate-pop-in flex-col bg-background outline-none" {@attach focus_on_open}>
  <Toolbar>
    <IconButton size="sm" label="Close" onclick={onclose}><XIcon weight="bold" /></IconButton>
    <span class="min-w-0 flex-1 truncate text-ui font-medium">{title}</span>
    {#if text}
      <CopyButton text={text} label="Copy" />
      {#if can_share}<IconButton size="sm" label="Share" onclick={share}><ShareNetworkIcon weight="bold" /></IconButton>{/if}
    {/if}
  </Toolbar>
  <div class="min-h-0 flex-1 overflow-y-auto">
    {#if frames}
      <div class="mx-auto flex max-w-md flex-col items-center gap-3 p-5">
        <QrFrames {frames} label={title} />
        <p class="text-center text-ui text-foreground/65">{caption}</p>
      </div>
    {:else if qr}
      <figure class="mx-auto flex max-w-md flex-col items-center gap-3 p-5">
        <svg viewBox="0 0 {qr.size} {qr.size}" role="img" aria-label={title} shape-rendering="crispEdges" class={cn("aspect-square w-full max-w-[min(100%,60cqh)] rounded-xl", CODE_FIELD)}>
          <path d={qr.d} class={CODE_INK} />
        </svg>
        <figcaption class="text-center text-ui text-foreground/65">{caption}</figcaption>
      </figure>
    {:else}
      <EmptyState icon={WarningIcon} title="Too many cards for one QR code" description="A phone can't read a code this dense. Save the list as a file instead; it keeps the photos too.">
        {#snippet actions()}
          {#if onfile}<Button variant="primary" onclick={onfile}><FileZipIcon weight="bold" />Export as file…</Button>{/if}
        {/snippet}
      </EmptyState>
    {/if}
  </div>
</section>
