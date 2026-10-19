<script lang="ts">
  import { cn } from "$lib/core/utils";
  import { CODE_INK } from "./colors";
  import { FORMATS, type CardFormat } from "./formats";
  import { barcode_path, render_error, type BarcodePath } from "./render";

  interface Props {
    format: CardFormat;
    code: string;
    class?: string;
  }

  let { format, code, class: class_name }: Props = $props();

  const result = $derived.by((): { path: BarcodePath } | { error: string } => {
    try {
      return { path: barcode_path(format, code) };
    } catch (error) {
      return { error: render_error(error) };
    }
  });
</script>

{#if "path" in result}
  <svg
    viewBox={result.path.view_box}
    role="img"
    aria-label="{FORMATS[format].label} {code}"
    shape-rendering="crispEdges"
    class={cn("block h-auto w-full", class_name)}
  >
    <path d={result.path.d} class={CODE_INK} />
  </svg>
{:else}
  <p class="text-ui text-error" role="alert">{result.error}</p>
{/if}
