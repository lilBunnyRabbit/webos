<script lang="ts">
  import HowSlides from "./how-slides.svelte";
  import type { PortfolioSession } from "./session.svelte";

  let { session }: { session: PortfolioSession } = $props();
</script>

<div class="how flex h-full min-h-0 flex-col gap-2 px-2.5 pt-2.5 pb-3.5">
  <HowSlides {session} />
</div>

<style>
  @container win (height < 19rem) {
    .how {
      gap: 0.25rem;
      padding-block: 0.375rem 0.5rem;
    }
  }
</style>
