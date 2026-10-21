<script lang="ts">
  import { Badge, Button, Segmented } from "$lib/core/components/ui";
  import { cn } from "$lib/core/utils";
  import { Plus as PlusIcon } from "phosphor-svelte";
  import { filled_count, filter_proposals, SECTION_IDS, STATUS_LABELS, title_of, type Proposal, type ProposalStatus, type StatusFilter } from "./model";

  interface Props {
    proposals: Proposal[];
    selected: string | null;
    filter: StatusFilter;
    onselect: (id: string) => void;
    oncreate: () => void;
  }

  let { proposals, selected, filter = $bindable(), onselect, oncreate }: Props = $props();

  const TONES: Record<ProposalStatus, "neutral" | "info" | "success"> = { draft: "neutral", sent: "info", shipped: "success" };
  const FILTERS: { value: StatusFilter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "draft", label: "Draft" },
    { value: "sent", label: "Sent" },
    { value: "shipped", label: "Shipped" },
  ];

  const shown = $derived(filter_proposals(proposals, filter));
</script>

<div class="flex min-h-0 flex-col gap-2 p-2">
  <div class="flex items-center gap-2">
    <Segmented size="sm" label="Show" options={FILTERS} bind:value={filter} class="min-w-0 flex-1 [&>label]:flex-1 [&>label]:justify-center" />
  </div>

  <ul class="flex min-h-0 flex-col gap-0.5" aria-label="Proposals">
    {#each shown as proposal (proposal.id)}
      {@const filled = filled_count(proposal)}
      <li>
        <button
          type="button"
          class={cn(
            "flex w-full flex-col gap-1 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-foreground/6 focus-visible:bg-primary/12 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cottontail focus-visible:ring-inset",
            proposal.id === selected && "bg-primary/14 hover:bg-primary/18"
          )}
          aria-current={proposal.id === selected ? "true" : undefined}
          onclick={() => onselect(proposal.id)}
        >
          <span class="flex min-w-0 items-center gap-2">
            <span class={cn("min-w-0 flex-1 truncate text-ui font-medium", !proposal.title.trim() && "text-foreground/65")}>{title_of(proposal)}</span>
            <Badge tone={TONES[proposal.status]} class="shrink-0">{STATUS_LABELS[proposal.status]}</Badge>
          </span>
          <span class="flex items-center gap-2" title="{filled} of {SECTION_IDS.length} sections filled">
            <span class="flex flex-1 gap-0.5" aria-hidden="true">
              {#each SECTION_IDS as id, index (id)}
                <span class={cn("h-1 flex-1 rounded-full", index < filled ? "bg-primary" : "bg-foreground/12")}></span>
              {/each}
            </span>
            <span class="font-mono text-2xs text-foreground/65 tabular-nums">{filled}/{SECTION_IDS.length}</span>
          </span>
        </button>
      </li>
    {:else}
      <li class="px-2.5 py-6 text-center text-ui text-foreground/65">
        {proposals.length ? "No proposals with this status." : "No proposals yet."}
      </li>
    {/each}
  </ul>

  <Button size="sm" variant="quiet" class="justify-start" onclick={oncreate}><PlusIcon weight="bold" />New proposal</Button>
</div>
