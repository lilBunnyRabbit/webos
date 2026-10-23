<script lang="ts">
  import { Badge, Button, EmptyState, IconButton, Input, Segmented } from "$lib/core/components/ui";
  import { cn, format_datetime } from "$lib/core/utils";
  import {
    Check as CheckIcon,
    DownloadSimple as DownloadSimpleIcon,
    FloppyDisk as FloppyDiskIcon,
    ClipboardText as ClipboardTextIcon,
    Minus as MinusIcon,
    Tray as TrayIcon,
    Trash as TrashIcon,
  } from "phosphor-svelte";
  import { answer_columns, is_answered, tally } from "./answers";
  import type { Form } from "./form";
  import InlineText from "./inline-text.svelte";
  import type { FormResponse } from "./link";

  interface Props {
    form: Form;
    responses: FormResponse[];
    incoming: FormResponse | null;
    incoming_saved: boolean;
    /** Where Save puts the incoming answer; `null` asks for a file. */
    target: string | null;
    onsave: () => void;
    onremove: (index: number) => void;
    onexport: () => void;
    /** A pasted answer code or answer link; resolves `true` once it's handled, so the box clears. */
    onadd: (text: string) => Promise<boolean>;
  }

  let { form, responses, incoming, incoming_saved, target, onsave, onremove, onexport, onadd }: Props = $props();

  let code = $state("");
  let adding = $state(false);

  async function add(event: SubmitEvent) {
    event.preventDefault();
    if (!code.trim() || adding) return;
    adding = true;
    try {
      if (await onadd(code)) code = "";
    } finally {
      adding = false;
    }
  }

  const Mode = { SUMMARY: "summary", EACH: "each", COMPARE: "compare" } as const;
  type Mode = (typeof Mode)[keyof typeof Mode];
  let mode = $state<Mode>(Mode.SUMMARY);

  const columns = $derived(answer_columns(form, incoming && !incoming_saved ? [...responses, incoming] : responses));
  const checks = $derived(columns.filter((column) => column.check));
  const totals = $derived(tally(columns, responses));
  const who = (response: FormResponse, index: number) => response.respondent ?? `Answer ${index + 1}`;
</script>

{#snippet card(response: FormResponse, title: string, actions: import("svelte").Snippet | null)}
  <article class="flex flex-col gap-3 rounded-xl bg-background-light p-4 shadow-card ring-1 ring-hairline">
    <header class="flex items-start gap-2">
      <div class="min-w-0 flex-1">
        <h3 class="truncate text-sm font-semibold">{title}</h3>
        <p class="font-mono text-2xs text-foreground/65">
          {format_datetime(response.submitted_at)}{#if checks.length}{" · "}{checks.filter((column) => response.answers[column.key] === true).length} of {checks.length} ticked{/if}
        </p>
      </div>
      {#if actions}{@render actions()}{/if}
    </header>
    <ul class="flex flex-col gap-2">
      {#each columns as column (column.key)}
        {@const value = response.answers[column.key]}
        {#if column.check}
          <li class={cn("flex items-start gap-2 text-ui", value !== true && "text-foreground/65")}>
            {#if value === true}<CheckIcon weight="bold" class="mt-0.5 size-3.5 shrink-0 text-success" />{:else}<MinusIcon class="mt-0.5 size-3.5 shrink-0" />{/if}
            <span class="min-w-0 break-words"><InlineText text={column.label} /></span>
          </li>
        {:else}
          <li class="flex flex-col gap-0.5 text-ui">
            <span class="font-medium break-words"><InlineText text={column.label} /></span>
            {#if is_answered(value)}
              <p class="rounded-md bg-field px-2.5 py-1.5 break-words whitespace-pre-wrap">{value}</p>
            {:else}
              <p class="text-foreground/65 italic">No answer</p>
            {/if}
          </li>
        {/if}
      {/each}
    </ul>
  </article>
{/snippet}

<div class="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6">
  <form class="flex items-center gap-1.5" onsubmit={add}>
    <Input bind:value={code} placeholder="Paste an answer code" aria-label="Answer code" class="min-w-0 flex-1 font-mono text-2xs" />
    <Button type="submit" variant="primary" disabled={!code.trim() || adding}><ClipboardTextIcon weight="bold" /> Add</Button>
  </form>

  {#if incoming}
    <section class="flex flex-col gap-2.5" aria-label="Answer from the link">
      <div class="flex flex-wrap items-center gap-2">
        <Badge tone="primary">No matching form</Badge>
        <span class="min-w-0 flex-1 text-ui text-foreground/80">
          {#if incoming_saved}Saved in {target ?? "the answers file"}{:else}Not saved yet{/if}
        </span>
        {#if !incoming_saved}
          <Button variant="primary" size="sm" onclick={onsave}>
            <FloppyDiskIcon weight="bold" /> {target ? `Save to ${target}` : "Save to answers…"}
          </Button>
        {/if}
      </div>
      {#if !incoming_saved}{@render card(incoming, incoming.respondent ?? "Anonymous", null)}{/if}
    </section>
  {/if}

  <section class="flex flex-col gap-3">
    <header class="flex flex-wrap items-center gap-2">
      <h2 class="min-w-48 flex-1 text-sm font-semibold">
        {responses.length} {responses.length === 1 ? "answer" : "answers"}{#if target}{" "}<span class="font-normal text-foreground/65">in {target}</span>{/if}
      </h2>
      {#if responses.length > 0}
        <Segmented
          size="sm"
          label="Show"
          bind:value={mode}
          options={[{ value: Mode.SUMMARY, label: "Summary" }, { value: Mode.EACH, label: "Each" }, { value: Mode.COMPARE, label: "Compare" }]}
        />
        <Button size="sm" onclick={onexport}><DownloadSimpleIcon weight="bold" /> CSV</Button>
      {/if}
    </header>

    {#if responses.length === 0}
      <EmptyState
        icon={TrayIcon}
        title="No answers yet"
        description="Share the form. When someone sends their answer code back, paste it above."
        class="p-6"
      />
    {:else if mode === Mode.SUMMARY}
      <ul class="flex flex-col gap-3">
        {#each columns as column (column.key)}
          <li class="flex flex-col gap-2 rounded-xl bg-background-light p-4 shadow-card ring-1 ring-hairline">
            <span class="text-ui font-medium break-words"><InlineText text={column.label} /></span>
            {#if column.check}
              {@const ticked = totals.get(column.key) ?? 0}
              <div class="flex items-center gap-3">
                <div class="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-field shadow-track" role="img" aria-label="{ticked} of {responses.length} ticked">
                  <div class="h-full rounded-full bg-primary" style:width="{(ticked / responses.length) * 100}%"></div>
                </div>
                <span class="shrink-0 font-mono text-2xs tabular-nums">{ticked} / {responses.length}</span>
              </div>
            {:else}
              {@const written = responses.map((response, index) => ({ who: who(response, index), value: response.answers[column.key] })).filter((entry) => is_answered(entry.value))}
              {#if written.length === 0}
                <p class="text-ui text-foreground/65 italic">No answers</p>
              {:else}
                <ul class="flex flex-col gap-1.5">
                  {#each written as entry, index (index)}
                    <li class="rounded-md bg-field px-2.5 py-1.5 text-ui">
                      <p class="break-words whitespace-pre-wrap">{entry.value}</p>
                      <p class="text-2xs text-foreground/65">{entry.who}</p>
                    </li>
                  {/each}
                </ul>
              {/if}
            {/if}
          </li>
        {/each}
      </ul>
    {:else if mode === Mode.EACH}
      {#each responses as response, index (`${response.submitted_at}-${index}`)}
        {#snippet remove()}
          <IconButton label="Remove this answer" size="sm" onclick={() => onremove(index)}><TrashIcon weight="bold" /></IconButton>
        {/snippet}
        {@render card(response, who(response, index), remove)}
      {/each}
    {:else}
      <div class="overflow-x-auto rounded-xl bg-background-light shadow-card ring-1 ring-hairline">
        <table class="w-full border-collapse text-left text-ui">
          <thead>
            <tr class="border-b border-hairline text-2xs tracking-wide text-foreground/65 uppercase">
              <th class="sticky left-0 z-10 min-w-40 bg-background-light px-3 py-2 font-medium">Question</th>
              {#each responses as response, index (`${response.submitted_at}-${index}`)}
                <th class="max-w-48 truncate px-3 py-2 font-medium normal-case" title={who(response, index)}>{who(response, index)}</th>
              {/each}
              {#if checks.length}<th class="px-3 py-2 text-right font-medium">Ticked</th>{/if}
            </tr>
          </thead>
          <tbody>
            {#each columns as column (column.key)}
              <tr class="border-b border-hairline last:border-b-0">
                <th scope="row" class="sticky left-0 z-10 min-w-40 bg-background-light px-3 py-2 align-top font-medium break-words">
                  <InlineText text={column.label} />
                </th>
                {#each responses as response, index (`${response.submitted_at}-${index}`)}
                  {@const value = response.answers[column.key]}
                  <td class="max-w-56 px-3 py-2 align-top">
                    {#if column.check}
                      {#if value === true}<CheckIcon weight="bold" class="size-3.5 text-success" aria-label="Ticked" />{:else}<MinusIcon class="size-3.5 text-foreground/45" aria-label="Not ticked" />{/if}
                    {:else if is_answered(value)}
                      <span class="break-words whitespace-pre-wrap">{value}</span>
                    {:else}
                      <span class="text-foreground/45">–</span>
                    {/if}
                  </td>
                {/each}
                {#if checks.length}
                  <td class="px-3 py-2 text-right align-top font-mono text-2xs tabular-nums">
                    {#if column.check}{totals.get(column.key) ?? 0}/{responses.length}{/if}
                  </td>
                {/if}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </section>
</div>
