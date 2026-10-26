<script lang="ts">
  import { z } from "zod";
  import { tick, untrack } from "svelte";
  import kernel, { format_keys, Platform, type AppsService, type ShortcutsService } from "$lib/core/api";
  import { get_app_context } from "$lib/core/contexts/app";
  import { Button, Kbd } from "$lib/core/components/ui";
  import { cn } from "$lib/core/utils";
  import { CheckCircle as CheckCircleIcon } from "phosphor-svelte";
  import { TOPIC_IDS, type TopicId } from "./ids";
  import { topics_for, type Topic } from "./topics";
  import { report_error } from "$kit/utils/report-error";

  let { topic }: { topic?: TopicId } = $props();

  const { app_id, window_id, storage } = get_app_context();
  const shortcuts = $derived(kernel.service<ShortcutsService>("shortcuts"));

  const progress = storage.file("progress.json", { tried: [] as TopicId[] }, z.object({ tried: z.array(z.enum(TOPIC_IDS)) }));
  void kernel.service<AppsService>("apps").catalogue();
  const topics = $derived(topics_for(kernel.platform));
  const keyboard = kernel.platform === Platform.DESKTOP;
  const tried = $derived(new Set(progress.value.tried));
  const count = $derived(topics.filter((entry) => tried.has(entry.id)).length);

  let cards = $state<Record<string, HTMLElement>>({});
  let focus = $state<TopicId | null>(null);

  // A `topic` from the shell or a link scrolls to its card and marks it for a moment.
  $effect(() => {
    const target = untrack(() => topic);
    if (!target) return;
    void tick().then(() => {
      cards[target]?.scrollIntoView({ block: "center", behavior: "smooth" });
      focus = target;
      setTimeout(() => (focus = null), 1600);
    });
  });

  async function attempt(entry: Topic) {
    if (progress.ready && !tried.has(entry.id)) progress.value.tried = [...progress.value.tried, entry.id];
    try {
      await entry.run(window_id);
    } catch (error) {
      report_error(app_id, `Couldn't ${entry.action.toLowerCase()}`, error);
    }
  }
</script>

<div class="h-full overflow-y-auto overscroll-contain">
  <div class="mx-auto flex max-w-3xl flex-col gap-5 p-4 @lg:p-6">
    <header class="flex flex-col gap-3">
      <div>
        <h1 class="text-xl font-semibold text-balance">Getting started</h1>
        <p class="text-ui text-pretty text-foreground/65">What WebOS can do, one part at a time. Try it runs the real thing.</p>
      </div>
      <div class="flex items-center gap-3">
        <div
          class="h-1.5 flex-1 overflow-hidden rounded-full bg-foreground/10"
          role="progressbar"
          aria-label="Tried"
          aria-valuemin={0}
          aria-valuemax={topics.length}
          aria-valuenow={count}
        >
          <div class="h-full rounded-full bg-primary transition-[width] duration-300" style:width="{(count / topics.length) * 100}%"></div>
        </div>
        <span class="shrink-0 font-mono text-2xs text-foreground/65 tabular-nums">{count} of {topics.length} tried</span>
      </div>
    </header>

    <ul class="grid gap-2 @xl:grid-cols-2">
      {#each topics as entry (entry.id)}
        <li
          bind:this={cards[entry.id]}
          class={cn(
            "flex flex-col gap-3 rounded-xl bg-background-light p-4 ring-1 transition-shadow duration-300",
            focus === entry.id ? "ring-2 ring-primary" : "ring-foreground/8"
          )}
        >
          <div class="flex items-start gap-3">
            <span class="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary">
              <entry.icon class="size-5" weight="duotone" />
            </span>
            <div class="min-w-0 flex-1">
              <h2 class="flex items-center gap-1.5 text-ui font-semibold">
                {entry.title}
                {#if tried.has(entry.id)}<CheckCircleIcon class="size-4 text-success" weight="fill" aria-label="Tried" />{/if}
              </h2>
              <p class="text-ui text-pretty text-foreground/65">{entry.text}</p>
            </div>
          </div>
          <div class="mt-auto flex flex-wrap items-center justify-between gap-2">
            <span class="flex items-center gap-1">
              {#if entry.keys && keyboard}
                {#each format_keys(entry.keys, shortcuts.mac) as part, index (index)}<Kbd>{part}</Kbd>{/each}
              {/if}
            </span>
            <Button size="sm" variant={tried.has(entry.id) ? "quiet" : "secondary"} onclick={() => attempt(entry)}>{entry.action}</Button>
          </div>
        </li>
      {/each}
    </ul>
  </div>
</div>
