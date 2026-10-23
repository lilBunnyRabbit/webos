<script lang="ts">
  import { Button, Input } from "$lib/core/components/ui";
  import { format_datetime } from "$lib/core/utils";
  import { ClipboardText as ClipboardTextIcon, ListChecks as ListChecksIcon } from "phosphor-svelte";
  import { overview, type FormOverview } from "./collect";

  let { onopen, onadd }: { onopen: (path: string) => void; onadd: (text: string) => Promise<boolean> } = $props();

  let forms = $state.raw<FormOverview[] | null>(null);
  let code = $state("");
  let adding = $state(false);

  $effect(() => {
    let current = true;
    void overview()
      .then((found) => {
        if (current) forms = found;
      })
      .catch(() => {
        if (current) forms = [];
      });
    return () => {
      current = false;
    };
  });

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
</script>

<div class="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 pb-8">
  <form class="flex items-center gap-1.5" onsubmit={add}>
    <Input bind:value={code} placeholder="Paste an answer code" aria-label="Answer code" class="min-w-0 flex-1 font-mono text-2xs" />
    <Button type="submit" disabled={!code.trim() || adding}><ClipboardTextIcon weight="bold" /> Add</Button>
  </form>

  {#if forms && forms.length > 0}
    <section class="flex flex-col gap-1.5" aria-label="Your forms">
      <h2 class="text-2xs font-medium tracking-wide text-foreground/65 uppercase">Your forms</h2>
      <ul class="flex flex-col overflow-hidden rounded-xl bg-background-light shadow-card ring-1 ring-hairline">
        {#each forms as form (form.path)}
          <li class="border-b border-hairline last:border-b-0">
            <button
              type="button"
              class="flex w-full items-center gap-3 px-3 py-2.5 text-left focus-visible:ring-2 focus-visible:ring-cottontail focus-visible:outline-none focus-visible:ring-inset pointer-coarse:py-3.5"
              title={form.path}
              onclick={() => onopen(form.path)}
            >
              <ListChecksIcon class="size-4 shrink-0 text-foreground/65" />
              <span class="min-w-0 flex-1">
                <span class="block truncate text-ui font-medium">{form.title}</span>
                <span class="block truncate font-mono text-2xs text-foreground/65">{form.path}</span>
              </span>
              <span class="shrink-0 text-right text-2xs text-foreground/65">
                <span class="block font-medium text-foreground tabular-nums">{form.answers} {form.answers === 1 ? "answer" : "answers"}</span>
                {#if form.latest}<span class="block">{format_datetime(form.latest)}</span>{/if}
              </span>
            </button>
          </li>
        {/each}
      </ul>
    </section>
  {/if}
</div>
