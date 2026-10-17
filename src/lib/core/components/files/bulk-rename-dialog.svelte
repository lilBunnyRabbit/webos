<script lang="ts">
  import type { DialogProps } from "$lib/core/api";
  import { plan_renames, type RenameSource, type RenameStep } from "$lib/core/api/services/files/rename-pattern";
  import { ArrowRight as ArrowRightIcon } from "phosphor-svelte";
  import { Button, Checkbox, Input } from "../ui";
  import { cn } from "$lib/core/utils";

  let { folder, sources, taken, resolve }: DialogProps<RenameStep[]> & { folder: string; sources: RenameSource[]; taken: string[] } = $props();

  const TOKENS = ["{name}", "{ext}", "{n:3}", "{date:yyyy-MM-dd}", "{parent}"];

  let pattern = $state("{name}{ext}");
  let find = $state("");
  let replace = $state("");
  let match_case = $state(false);
  let start = $state(1);
  let step = $state(1);
  let field = $state<HTMLInputElement | null>(null);

  const counter = $derived(/\{n[:}]/.test(pattern));
  const plan = $derived(
    plan_renames(sources, { pattern, find, replace, match_case, start: counter ? start : 1, step: counter ? step : 1 }, new Map([[folder, taken]]))
  );
  const problems = $derived(plan.steps.filter((entry) => entry.problem).length);

  function insert(token: string) {
    if (!field) return;
    field.setRangeText(token, field.selectionStart ?? pattern.length, field.selectionEnd ?? pattern.length, "end");
    pattern = field.value;
    field.focus();
  }

  function submit(event: SubmitEvent) {
    event.preventDefault();
    if (!plan.blocked && plan.changed > 0) resolve(plan.steps);
  }
</script>

<form
  class="flex max-h-[calc(100cqh-2rem)] w-[min(40rem,calc(100cqw-2rem))] flex-col overflow-hidden rounded-2xl bg-background-lighter shadow-popover @container"
  onsubmit={submit}
>
  <!-- On a short window the preview gives up height first, down to its minimum; only then do the fields scroll. -->
  <div class="grid min-h-0 gap-3 overflow-y-auto p-5 pb-4">
    <div class="min-w-0">
      <h2 class="text-sm font-semibold">Rename {sources.length} items</h2>
      <p class="truncate font-mono text-2xs text-foreground/65" title={folder}>{folder}</p>
    </div>

    <label class="grid gap-1.5">
      <span class="text-ui text-foreground/80">New name</span>
      <!-- svelte-ignore a11y_autofocus -->
      <Input bind:value={pattern} bind:element={field} size="lg" class="font-mono" spellcheck="false" autocomplete="off" autofocus aria-invalid={plan.error !== null} />
    </label>
    <div class="flex flex-wrap gap-1" aria-label="Insert a token">
      {#each TOKENS as token (token)}
        <Button size="sm" variant="secondary" class="font-mono" onclick={() => insert(token)}>{token}</Button>
      {/each}
    </div>
    {#if plan.error}
      <p class="text-2xs text-error" role="alert">{plan.error}</p>
    {:else}
      <p class="text-2xs text-foreground/65">Or <span class="font-mono">/regex/replacement/flags</span> on the whole name, <span class="font-mono">$1</span> for groups.</p>
    {/if}

    <div class="grid gap-2 @md:grid-cols-2">
      <Input bind:value={find} placeholder="Find" aria-label="Find" spellcheck="false" autocomplete="off" />
      <Input bind:value={replace} placeholder="Replace with" aria-label="Replace with" spellcheck="false" autocomplete="off" />
    </div>
    <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
      <label class="flex items-center gap-2 text-ui"><Checkbox bind:checked={match_case} />Match case</label>
      {#if counter}
        <label class="flex items-center gap-2 text-ui">Start <Input type="number" bind:value={start} class="w-20 tabular-nums" /></label>
        <label class="flex items-center gap-2 text-ui">Step <Input type="number" bind:value={step} class="w-20 tabular-nums" /></label>
      {/if}
    </div>
  </div>

  <div class="min-h-32 flex-auto shrink-[1000] overflow-y-auto border-y border-foreground/8 bg-background px-3 py-1" role="table" aria-label="Preview">
    {#each plan.steps as entry (entry.path)}
      {@const changed = entry.new_name !== entry.name}
      <div
        role="row"
        class="grid grid-cols-1 gap-x-2 border-b border-foreground/6 py-1.5 [contain-intrinsic-size:auto_2.5rem] [content-visibility:auto] last:border-0 @md:grid-cols-[minmax(0,1fr)_1rem_minmax(0,1fr)] @md:items-center"
      >
        <span role="cell" class="truncate text-ui text-foreground/65" title={entry.name}>{entry.name}</span>
        <ArrowRightIcon class="hidden size-3.5 text-foreground/65 @md:block" aria-hidden="true" />
        <span role="cell" class="min-w-0">
          <span class={cn("block truncate text-ui", changed ? "font-medium" : "text-foreground/65", entry.problem && "text-error")} title={entry.new_name}>
            <span class="@md:hidden" aria-hidden="true">{"→ "}</span>{entry.new_name}
          </span>
          {#if entry.problem}<span class="block text-2xs text-error">{entry.problem}</span>{/if}
        </span>
      </div>
    {/each}
  </div>

  <div class="flex shrink-0 flex-wrap items-center justify-end gap-2 p-4">
    <p class="mr-auto text-2xs text-foreground/80" aria-live="polite">
      {plan.changed} of {plan.steps.length} change{#if problems > 0}{" · "}<span class="text-error">{problems} {problems === 1 ? "problem" : "problems"}</span>{/if}
    </p>
    <Button variant="quiet" onclick={() => resolve(null)}>Cancel</Button>
    <Button variant="primary" type="submit" disabled={plan.blocked || plan.changed === 0}>Rename</Button>
  </div>
</form>
