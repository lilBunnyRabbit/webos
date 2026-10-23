<script lang="ts" module>
  import type { Snippet } from "svelte";
  import type { AiAvailability } from "$lib/core/api";

  export interface AiGateState {
    availability: AiAvailability;
    /** The one-time download notice while there is one: render it where the app's banners go. */
    notice: Snippet | null;
  }
</script>

<script lang="ts">
  import kernel, { AI_REQUIREMENTS, AiAvailability as Availability, type AiFeature, type AiService } from "$lib/core/api";
  import { EmptyState, Spinner } from "$lib/core/components/ui";
  import type { IconComponent } from "$lib/core/components/ui/types";
  import { Sparkle as SparkleIcon } from "phosphor-svelte";
  import { untrack } from "svelte";
  import { combine } from "./gate";

  interface Props {
    features: AiFeature[];
    title: string;
    icon?: IconComponent;
    download?: string;
    children: Snippet<[AiGateState]>;
  }

  let {
    features,
    title,
    icon = SparkleIcon,
    download = "The first use downloads Chrome's AI model once, a few GB. It runs on this device after that, offline too.",
    children,
  }: Props = $props();

  const ai = $derived(kernel.service<AiService>("ai"));
  let checked = $state(false);

  // Asked once; after that the service's `features` follow downloads that finish, here or in another window.
  untrack(() => Promise.all(features.map((feature) => ai.availability(feature)))).then(() => (checked = true));

  const availability = $derived(checked ? combine(features.map((feature) => ai.features[feature])) : null);
</script>

{#snippet notice()}
  <div class="flex items-center gap-2 border-b border-hairline bg-background-light px-3 py-2 text-ui text-foreground/80">
    <span class="min-w-0 flex-1">{download}</span>
  </div>
{/snippet}

{#if availability === null}
  <div class="grid h-full place-items-center"><Spinner label="Checking for on-device AI" /></div>
{:else if availability === Availability.NO}
  <EmptyState {icon} {title} description={AI_REQUIREMENTS} />
{:else}
  {@render children({ availability, notice: availability === Availability.DOWNLOAD ? notice : null })}
{/if}
