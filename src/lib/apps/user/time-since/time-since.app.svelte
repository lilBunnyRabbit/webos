<script lang="ts">
  import kernel, { NotificationType, Platform, type DesktopItem, type DesktopService, type DialogsService, type NotificationsService } from "$lib/core/api";
  import { Badge, Button, EmptyState, IconButton, Input, Select, Spinner, StatusBar, Toolbar } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import { app_data_path } from "$lib/core/contexts/app/json-file.svelte";
  import { cn, format_datetime } from "$lib/core/utils";
  import { long_press } from "$lib/core/utils/long-press";
  import { ArrowCounterClockwise, ArrowLeft, ClockCounterClockwise, Pause, PencilSimple, Play, Plus, Sticker, Trash, Trophy, Warning } from "phosphor-svelte";
  import { untrack } from "svelte";
  import { z } from "zod";
  import { Ticker } from "$lib/core/utils/ticker.svelte";
  import CounterHistory from "./counter-history.svelte";
  import Duration from "./duration.svelte";
  import {
    COUNTERS_FILE,
    CounterSort,
    CountersFileSchema,
    EMPTY_FILE,
    SORT_OPTIONS,
    create_counter,
    duration_of,
    elapsed_of,
    format_duration,
    from_datetime_local,
    is_record,
    remove_run,
    rename,
    reset,
    set_start,
    sort_counters,
    start,
    stop,
    tick_interval,
    to_datetime_local,
    update_counter,
    type Counter,
  } from "./counters";

  const { counter: initial_counter }: { counter?: string } = $props();

  const { app_id, window: win, storage } = get_app_context();
  const notifications = $derived(kernel.service<NotificationsService>("notifications"));
  const desktop = $derived(kernel.service<DesktopService>("desktop"));
  const dialogs = $derived(kernel.service<DialogsService>("dialogs"));

  const file = storage.file(COUNTERS_FILE, EMPTY_FILE, CountersFileSchema);
  const sort = storage.persisted<CounterSort>("sort", CounterSort.LONGEST, z.enum(CounterSort));
  const selected_id = storage.window<string | null>("counter", untrack(() => initial_counter ?? null), z.string().nullable());

  const counters = $derived(sort_counters(file.value.counters, sort.value));
  const selected = $derived(file.value.counters.find((counter) => counter.id === selected_id.value) ?? null);
  const running = $derived(file.value.counters.filter((counter) => counter.current_start !== null));

  const clock = new Ticker(
    () => win.is_visible,
    () => tick_interval(running.map((counter) => elapsed_of(counter, Date.now())))
  );

  const can_pin = kernel.platform !== Platform.MOBILE;

  function change(id: string, update: (counter: Counter) => Counter) {
    file.value = update_counter(file.value, id, update);
  }

  async function add() {
    const name = await win.prompt("New counter", { placeholder: "Last coffee", confirm_label: "Start", detail: "It starts counting now. You can move the start back afterwards." });
    if (!name?.trim()) return;
    const counter = create_counter(name, Date.now(), crypto.randomUUID());
    file.value = { ...file.value, counters: [...file.value.counters, counter] };
    selected_id.value = counter.id;
  }

  async function confirm_reset(counter: Counter) {
    if (counter.current_start === null) return change(counter.id, (c) => start(c, Date.now()));
    const ok = await win.confirm(`Reset “${counter.name}”?`, {
      detail: `This run (${format_duration(elapsed_of(counter, Date.now()))}) goes into its history and the count starts again from zero.`,
      confirm_label: "Reset",
    });
    if (ok) change(counter.id, (c) => reset(c, Date.now()));
  }

  async function confirm_stop(counter: Counter) {
    const ok = await win.confirm(`Stop “${counter.name}”?`, { detail: "This run goes into its history and the counter waits until you start it again.", confirm_label: "Stop" });
    if (ok) change(counter.id, (c) => stop(c, Date.now()));
  }

  async function ask_rename(counter: Counter) {
    const name = await win.prompt("Rename counter", { initial: counter.name, confirm_label: "Rename" });
    if (name) change(counter.id, (c) => rename(c, name));
  }

  async function remove(counter: Counter) {
    const ok = await win.confirm(`Delete “${counter.name}”?`, { detail: "The counter and its whole history are deleted.", confirm_label: "Delete", danger: true });
    if (!ok) return;
    file.value = { ...file.value, counters: file.value.counters.filter((c) => c.id !== counter.id) };
    if (selected_id.value === counter.id) selected_id.value = null;
    const widget = widget_for(counter.id);
    if (widget) await desktop.remove_item(widget.name).catch(() => {});
  }

  function widget_for(id: string) {
    return desktop
      .items()
      .find((item): item is Extract<DesktopItem, { kind: "widget" }> => item.kind === "widget" && item.app_id === app_id && item.props?.counter === id);
  }

  async function toggle_widget(counter: Counter) {
    const existing = widget_for(counter.id);
    try {
      if (existing) {
        await desktop.remove_item(existing.name);
        notifications.notify(app_id, { type: NotificationType.INFO, title: "Removed from the desktop", message: existing.label });
        return;
      }
      await desktop.pin_widget(app_id, { label: counter.name, props: { counter: counter.id } });
      notifications.notify(app_id, { type: NotificationType.INFO, title: "Counter added to the desktop", message: `${counter.name}: reset it right there.` });
    } catch (reason) {
      notifications.notify(app_id, { type: NotificationType.ERROR, title: "Couldn't change the desktop", message: String(reason) });
    }
  }

  async function counter_menu(counter: Counter, anchor: { x: number; y: number }) {
    const is_running = counter.current_start !== null;
    const choice = await dialogs.menu(
      [
        is_running ? { id: "reset", label: "Reset", icon: ArrowCounterClockwise } : { id: "start", label: "Start", icon: Play },
        ...(is_running ? [{ id: "stop", label: "Stop", icon: Pause }] : []),
        { separator: true },
        { id: "rename", label: "Rename", icon: PencilSimple },
        ...(can_pin ? [{ id: "widget", label: widget_for(counter.id) ? "Remove from desktop" : "Add to desktop", icon: Sticker }] : []),
        { separator: true },
        { id: "delete", label: "Delete", icon: Trash, danger: true },
      ],
      { anchor }
    );
    if (choice === "reset" || choice === "start") await confirm_reset(counter);
    else if (choice === "stop") await confirm_stop(counter);
    else if (choice === "rename") await ask_rename(counter);
    else if (choice === "widget") await toggle_widget(counter);
    else if (choice === "delete") await remove(counter);
  }

  $effect(() =>
    win.on_back(() => {
      if (!selected) return false;
      selected_id.value = null;
      return true;
    })
  );

  $effect(() => win.set_title(selected?.name ?? null));
</script>

{#snippet elapsed(counter: Counter, class_name: string)}
  {#if counter.current_start === null}
    <span class={cn("font-mono tabular-nums text-foreground/45", class_name)}>Stopped</span>
  {:else}
    <Duration ms={clock.now - counter.current_start} class={cn("text-primary", class_name)} />
  {/if}
{/snippet}

<div class="@container grid h-full grid-rows-[auto_1fr_auto]">
  <Toolbar>
    <Select bind:value={sort.value} options={SORT_OPTIONS} size="sm" aria-label="Sort" class="w-auto" />
    <span class="flex-1"></span>
    <Button variant="primary" size="sm" onclick={add}><Plus weight="bold" />New counter</Button>
  </Toolbar>

  <div class="flex min-h-0 flex-col">
  {#if file.error}
    <div class="flex items-center gap-2 border-b border-foreground/8 bg-warning/10 px-3 py-2 text-ui">
      <Warning weight="fill" class="size-4 shrink-0 text-warning" />
      <span class="min-w-0 flex-1">Your counters file couldn't be read. The next change replaces it.</span>
    </div>
  {/if}

  <div class="min-h-0 flex-1">
    {#if !file.ready}
      <div class="grid h-full place-items-center"><Spinner label="Loading counters" /></div>
    {:else if counters.length === 0}
      <EmptyState icon={ClockCounterClockwise} title="No counters yet" description="Count up from the last time something happened: your last coffee, the day you quit, a fresh start.">
        {#snippet actions()}<Button variant="primary" onclick={add}><Plus weight="bold" />New counter</Button>{/snippet}
      </EmptyState>
    {:else}
      <div class="grid h-full @2xl:grid-cols-[20rem_1fr]">
        <aside class={cn("min-h-0 overflow-auto border-foreground/8 @2xl:border-r", selected && "hidden @2xl:block")}>
          <ul class="grid gap-2 p-3">
            {#each counters as counter (counter.id)}
              <li
                class={cn(
                  "flex items-center gap-1 rounded-xl bg-background-light pr-2 ring-1 ring-foreground/8 transition-colors hover:ring-foreground/20",
                  counter.id === selected_id.value && "bg-primary/10 ring-primary/40 hover:ring-primary/50"
                )}
                {@attach long_press({ on_menu: (point) => counter_menu(counter, point) })}
              >
                <button
                  type="button"
                  class="grid min-w-0 flex-1 gap-0.5 rounded-xl px-3 py-2.5 text-left focus-visible:outline-2 focus-visible:outline-cottontail"
                  onclick={() => (selected_id.value = counter.id)}
                >
                  <span class="truncate text-ui font-medium">{counter.name}</span>
                  {@render elapsed(counter, "text-xl")}
                  <span class="truncate font-mono text-2xs text-foreground/55 tabular-nums">
                    {#if counter.current_start !== null}since {format_datetime(counter.current_start)}{:else}{counter.runs.length} {counter.runs.length === 1 ? "run" : "runs"}{/if}
                  </span>
                </button>
                {#if counter.current_start === null}
                  <IconButton label="Start" onclick={() => confirm_reset(counter)}><Play weight="fill" /></IconButton>
                {:else}
                  <IconButton label="Reset" onclick={() => confirm_reset(counter)}><ArrowCounterClockwise weight="bold" /></IconButton>
                {/if}
              </li>
            {/each}
          </ul>
        </aside>

        <section class={cn("min-h-0 flex-col", selected ? "flex" : "hidden @2xl:flex")}>
          {#if selected}
            {@const counter = selected}
            {@const sticky = can_pin ? widget_for(counter.id) : undefined}
            <header class="flex items-center gap-1 border-b border-foreground/8 px-2 py-1.5">
              <IconButton label="Back" size="sm" class="@2xl:hidden" onclick={() => (selected_id.value = null)}><ArrowLeft /></IconButton>
              <h2 class="min-w-0 flex-1 truncate px-1 text-sm font-semibold">{counter.name}</h2>
              {#if can_pin}
                <Button
                  variant="quiet"
                  size="sm"
                  pressed={sticky !== undefined}
                  title={sticky ? "This counter is on the desktop. Click to remove it." : "Show this counter on the desktop, with a reset button."}
                  onclick={() => toggle_widget(counter)}
                >
                  <Sticker /><span class="hidden @md:inline">{sticky ? "On desktop" : "Add to desktop"}</span>
                </Button>
              {/if}
              <IconButton label="Rename" size="sm" onclick={() => ask_rename(counter)}><PencilSimple /></IconButton>
              <IconButton label="Delete counter" size="sm" onclick={() => remove(counter)}><Trash /></IconButton>
            </header>

            <div class="min-h-0 flex-1 overflow-auto">
              <div class="mx-auto grid max-w-2xl gap-6 p-4 @md:p-6">
                <div class="grid justify-items-center gap-3 py-2 text-center">
                  {@render elapsed(counter, "text-4xl @md:text-5xl")}
                  {#if is_record(counter, clock.now)}
                    <Badge tone="success"><Trophy weight="fill" />Longest run yet</Badge>
                  {:else if counter.runs.length > 0 && counter.current_start !== null}
                    <span class="font-mono text-2xs text-foreground/65 tabular-nums">Longest {format_duration(Math.max(...counter.runs.map(duration_of)))}</span>
                  {/if}
                  <div class="flex gap-2">
                    {#if counter.current_start === null}
                      <Button variant="primary" onclick={() => confirm_reset(counter)}><Play weight="fill" />Start</Button>
                    {:else}
                      <Button variant="secondary" onclick={() => confirm_stop(counter)}><Pause weight="fill" />Stop</Button>
                      <Button variant="primary" onclick={() => confirm_reset(counter)}><ArrowCounterClockwise weight="bold" />Reset</Button>
                    {/if}
                  </div>
                </div>

                {#if counter.current_start !== null}
                  <label class="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-ui text-foreground/65">
                    Started
                    <Input
                      type="datetime-local"
                      size="sm"
                      class="w-auto font-mono text-2xs"
                      value={to_datetime_local(counter.current_start)}
                      max={to_datetime_local(clock.now)}
                      onchange={(event) => change(counter.id, (c) => set_start(c, from_datetime_local(event.currentTarget.value), Date.now()))}
                    />
                  </label>
                {/if}

                <CounterHistory runs={counter.runs} onremove={(index) => change(counter.id, (c) => remove_run(c, index))} />
              </div>
            </div>
          {:else}
            <EmptyState icon={ClockCounterClockwise} title="No counter open" description="Pick one from the list to see its history." />
          {/if}
        </section>
      </div>
    {/if}
  </div>
  </div>

  <StatusBar>
    <span>{file.value.counters.length} {file.value.counters.length === 1 ? "counter" : "counters"}</span>
    <span>{running.length} running</span>
    <span class="hidden @md:inline">{app_data_path(app_id, COUNTERS_FILE)}</span>
  </StatusBar>
</div>
