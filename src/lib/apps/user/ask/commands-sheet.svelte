<script lang="ts">
  import kernel, { type AiService, type AiUsage, type AppsService } from "$lib/core/api";
  import type { Command } from "$lib/core/api/services/shell/type";
  import { Spinner, Switch } from "$lib/core/components/ui";
  import { untrack } from "svelte";
  import { PICK_RULES, catalogue_line, percent } from "./assistant";

  interface Props {
    catalogue: readonly Command[];
    on: readonly string[];
    ready: boolean;
    ontoggle: (id: string, on: boolean) => void;
  }

  let { catalogue, on, ready, ontoggle }: Props = $props();

  const ai = $derived(kernel.service<AiService>("ai"));
  const apps = $derived(kernel.service<AppsService>("apps"));

  let costs = $state<Record<string, number>>({});
  let rules = $state<AiUsage | null>(null);

  $effect(() => {
    if (!ready) return;
    const list = catalogue;
    const missing = untrack(() => list.filter((command) => costs[command.id] === undefined));
    const controller = new AbortController();
    void (async () => {
      try {
        rules ??= await ai.measure(PICK_RULES, { signal: controller.signal });
        for (const command of missing) costs[command.id] = (await ai.measure(catalogue_line(command), { signal: controller.signal })).used;
      } catch {
        // Measuring is a nicety: without it the rows just show no cost.
      }
    })();
    return () => controller.abort();
  });

  const used = $derived(
    rules ? rules.used + catalogue.filter((command) => on.includes(command.id)).reduce((sum, command) => sum + (costs[command.id] ?? 0), 0) : 0
  );
  const share = $derived(rules ? percent(used, rules.window) : 0);
  const app_name = (command: Command) => (command.app ? (apps.get(command.app)?.name ?? command.app) : "WebOS");
</script>

<div class="flex min-h-0 flex-col">
  <div class="flex flex-col gap-1.5 border-b border-foreground/8 px-4 pt-1 pb-3">
    <h2 class="text-sm font-semibold">What Ask can read</h2>
    <p class="text-ui text-foreground/75">
      Switch on what Ask may look up to answer you. It only reads; it never changes anything. Each one takes a little of the
      AI's memory for every question.
    </p>
    {#if rules}
      <div class="mt-1 flex flex-col gap-1">
        <div class="h-1.5 overflow-hidden rounded-full bg-foreground/10" role="meter" aria-label="Memory used by picking" aria-valuenow={share} aria-valuemin={0} aria-valuemax={100}>
          <div class={["h-full rounded-full transition-[width]", share > 50 ? "bg-warning" : "bg-primary"]} style:width="{share}%"></div>
        </div>
        <p class="text-2xs text-foreground/65">
          Picking what to read uses {share} % of the memory, leaving {100 - share} % for your question.
          <span class="font-mono">({used.toLocaleString("en")} of {rules.window.toLocaleString("en")} tokens)</span>
        </p>
      </div>
    {:else if ready}
      <Spinner label="Measuring" />
    {:else}
      <p class="text-2xs text-foreground/65">Memory costs show once the AI model is on this device.</p>
    {/if}
  </div>
  <ul class="min-h-0 flex-1 overflow-auto py-1">
    {#each catalogue as command (command.id)}
      {@const cost = costs[command.id]}
      <li>
        <label class="flex cursor-pointer items-start gap-3 px-4 py-2 hover:bg-foreground/4 pointer-coarse:py-3">
          <Switch class="mt-0.5" checked={on.includes(command.id)} onchange={(event) => ontoggle(command.id, event.currentTarget.checked)} />
          <span class="flex min-w-0 flex-1 flex-col gap-0.5">
            <span class="flex items-baseline gap-2">
              <span class="text-ui font-medium">{app_name(command)}</span>
              <code class="truncate font-mono text-2xs text-foreground/65">{command.id}</code>
            </span>
            <span class="text-2xs text-foreground/75">{command.description}</span>
          </span>
          {#if cost !== undefined && rules}
            <span class="shrink-0 text-right text-2xs text-foreground/65 tabular-nums" title="{cost} tokens">{Math.max(1, percent(cost, rules.window))} %</span>
          {/if}
        </label>
      </li>
    {:else}
      <li class="px-4 py-6 text-center text-ui text-foreground/65">No app offers anything to read yet.</li>
    {/each}
  </ul>
</div>
