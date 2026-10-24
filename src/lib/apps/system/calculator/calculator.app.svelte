<script lang="ts">
  import kernel, { type ClipboardService, type NotificationsService } from "$lib/core/api";
  import { get_app_context } from "$lib/core/contexts/app";
  import { Button, EmptyState, IconButton, Toolbar } from "$lib/core/components/ui";
  import { cn } from "$lib/core/utils";
  import {
    Backspace as BackspaceIcon,
    Check as CheckIcon,
    ClockCounterClockwise as HistoryIcon,
    Copy as CopyIcon,
  } from "phosphor-svelte";
  import type { Component } from "svelte";
  import { z } from "zod";
  import {
    add_to_history,
    CALC_ERROR_LABELS,
    complete,
    display_expression,
    EMPTY_STATE,
    evaluate,
    format_number,
    format_result,
    history_schema,
    Key,
    key_from_keyboard,
    press,
    preview,
    type CalcError,
    type HistoryEntry,
  } from "./calculator";

  interface Pad {
    key: Key;
    label: string;
    name?: string;
    icon?: Component;
    tone?: "digit" | "operator" | "function" | "equals";
    class?: string;
  }

  const PADS: Pad[] = [
    { key: Key.CLEAR, label: "C", name: "Clear", tone: "function" },
    { key: Key.BACKSPACE, label: "", name: "Backspace", icon: BackspaceIcon, tone: "function" },
    { key: Key.PERCENT, label: "%", name: "Percent", tone: "function" },
    { key: Key.DIVIDE, label: "÷", name: "Divide", tone: "operator" },
    { key: Key.OPEN, label: "(", name: "Open bracket", tone: "function" },
    { key: Key.CLOSE, label: ")", name: "Close bracket", tone: "function" },
    { key: Key.NEGATE, label: "±", name: "Change sign", tone: "function" },
    { key: Key.MULTIPLY, label: "×", name: "Multiply", tone: "operator" },
    { key: "7", label: "7" },
    { key: "8", label: "8" },
    { key: "9", label: "9" },
    { key: Key.SUBTRACT, label: "−", name: "Subtract", tone: "operator" },
    { key: "4", label: "4" },
    { key: "5", label: "5" },
    { key: "6", label: "6" },
    { key: Key.ADD, label: "+", name: "Add", tone: "operator" },
    { key: "1", label: "1" },
    { key: "2", label: "2" },
    { key: "3", label: "3" },
    { key: Key.EQUALS, label: "=", name: "Equals", tone: "equals", class: "row-span-2" },
    { key: "0", label: "0", class: "col-span-2" },
    { key: Key.DECIMAL, label: ".", name: "Decimal point" },
  ];

  const calc_schema = z.object({ expression: z.string(), evaluated: z.boolean() });

  const clipboard = $derived(kernel.service<ClipboardService>("clipboard"));
  const notifications = $derived(kernel.service<NotificationsService>("notifications"));

  const { window: win, storage } = get_app_context();
  const history = storage.persisted<HistoryEntry[]>("history", [], history_schema);
  const calc = storage.window("calc", EMPTY_STATE, calc_schema);
  const solved = storage.window<string | null>("solved", null, z.string().nullable());
  const show_history = storage.window("show_history", false, z.boolean());

  let equals_error = $state<CalcError | null>(null);
  let copied = $state(false);
  let copied_timer: ReturnType<typeof setTimeout> | undefined;
  let root: HTMLDivElement;

  const live = $derived(calc.value.evaluated ? null : preview(calc.value.expression));
  const result_text = $derived.by(() => {
    if (equals_error) return CALC_ERROR_LABELS[equals_error];
    if (calc.value.evaluated) return calc.value.expression;
    return live ? format_result(live) : "";
  });
  const copyable = $derived(
    equals_error ? null : calc.value.evaluated ? calc.value.expression : live?.ok ? format_number(live.value) : null
  );
  const result_error = $derived(equals_error !== null || (live !== null && !live.ok));

  $effect(() => () => clearTimeout(copied_timer));

  function input(key: Key) {
    equals_error = null;
    if (key !== Key.EQUALS) {
      calc.value = press(calc.value, key);
      return;
    }
    if (calc.value.evaluated || calc.value.expression === "") return;
    const expression = complete(calc.value.expression);
    const result = evaluate(expression);
    if (!result.ok) {
      equals_error = result.error;
      return;
    }
    const formatted = format_number(result.value);
    history.value = add_to_history(history.value, { expression, result: formatted });
    solved.value = expression;
    calc.value = { expression: formatted, evaluated: true };
  }

  function reuse(entry: HistoryEntry) {
    equals_error = null;
    calc.value = { expression: entry.expression, evaluated: false };
    show_history.value = false;
  }

  async function copy() {
    if (!copyable) return;
    try {
      await clipboard.copy_text(copyable);
    } catch (error) {
      console.warn("[Calculator] copy failed", error);
      notifications.notify("calculator", {
        type: "error",
        title: "Couldn't copy to the clipboard",
      });
      return;
    }
    copied = true;
    clearTimeout(copied_timer);
    copied_timer = setTimeout(() => (copied = false), 1200);
  }

  async function clear_history() {
    const confirmed = await win.confirm("Clear history?", {
      detail: "Every past calculation is removed from every Calculator window.",
      confirm_label: "Clear",
      danger: true,
    });
    if (confirmed) history.value = [];
  }

  function on_keydown(event: KeyboardEvent) {
    if (!win.is_focused || event.defaultPrevented || event.altKey) return;
    const target = event.target;
    // Focus sits on the window frame (an ancestor) or inside the app; anything else is a sheet or another window.
    if (!(target instanceof Node) || !(target.contains(root) || root.contains(target))) return;
    if (target instanceof HTMLElement && target.closest("input, textarea, [contenteditable]")) return;

    if (event.ctrlKey || event.metaKey) {
      if (event.key.toLowerCase() === "c" && window.getSelection()?.isCollapsed !== false && copyable) {
        event.preventDefault();
        copy();
      }
      return;
    }

    const key = key_from_keyboard(event.key);
    if (!key) return;
    if (key === Key.EQUALS && event.key === "Enter" && target instanceof HTMLButtonElement) return;
    event.preventDefault();
    input(key);
  }

  const PAD_TONES = {
    digit: "secondary",
    operator: "secondary",
    function: "secondary",
    equals: "primary",
  } as const;
</script>

<svelte:window onkeydown={on_keydown} />

<div bind:this={root} class="grid h-full grid-rows-[auto_1fr]">
  <Toolbar>
    <div class="flex-1"></div>
    <IconButton label={copied ? "Copied" : "Copy result"} size="sm" disabled={!copyable} onclick={copy}>
      {#if copied}<CheckIcon weight="bold" class="text-success" />{:else}<CopyIcon weight="bold" />{/if}
    </IconButton>
    <IconButton
      label="History"
      size="sm"
      class="@2xl:hidden"
      pressed={show_history.value}
      onclick={() => (show_history.value = !show_history.value)}
    >
      <HistoryIcon weight="bold" />
    </IconButton>
  </Toolbar>

  <div class="relative grid min-h-0 @2xl:grid-cols-[1fr_18rem]">
    <div class="flex min-h-0 flex-col">
      <div class="flex min-h-24 flex-col items-end justify-end gap-1 px-3 pt-3 pb-2 text-right font-mono tabular-nums">
        <p
          class={cn(
            "max-w-full break-all transition-[font-size,color] duration-150",
            calc.value.evaluated ? "text-ui text-foreground/65" : "text-xl @md:text-2xl"
          )}
        >
          {#if calc.value.evaluated}
            {display_expression(solved.value ?? "")} =
          {:else}
            {display_expression(calc.value.expression) || "0"}
          {/if}
        </p>
        <p
          aria-live="polite"
          class={cn(
            "min-h-7 max-w-full break-all transition-[font-size,color] duration-150",
            calc.value.evaluated ? "text-2xl font-semibold @md:text-3xl" : "text-lg text-foreground/65",
            result_error && "text-error"
          )}
        >
          {#if result_text}{!calc.value.evaluated && !result_error ? "= " : ""}{result_text}{/if}
        </p>
      </div>

      <div class="grid min-h-0 flex-1 grid-cols-4 grid-rows-6 gap-1.5 p-2 pt-0">
        <!-- Pads don't take focus on click, so Enter afterwards means = instead of pressing the last pad again. -->
        {#each PADS as pad (pad.key)}
          <Button
            variant={PAD_TONES[pad.tone ?? "digit"]}
            size="lg"
            aria-label={pad.name}
            title={pad.name}
            class={cn(
              "h-full min-h-0 px-0 font-mono text-lg @md:text-xl",
              pad.tone === "operator" && "text-primary",
              pad.tone === "function" && "bg-background-lighter text-foreground/80",
              pad.class
            )}
            onmousedown={(event) => event.preventDefault()}
            onclick={() => input(pad.key)}
          >
            {#if pad.icon}<pad.icon weight="bold" />{:else}{pad.label}{/if}
          </Button>
        {/each}
      </div>
    </div>

    <aside
      aria-label="History"
      class={cn(
        "flex min-h-0 flex-col @2xl:static @2xl:flex @2xl:border-l @2xl:border-hairline @2xl:bg-transparent",
        show_history.value ? "absolute inset-0 bg-background" : "hidden"
      )}
    >
      <div class="flex h-10 shrink-0 items-center justify-between gap-2 pr-2 pl-4">
        <h2 class="text-2xs font-medium tracking-wide text-foreground/65 uppercase">History</h2>
        {#if history.value.length > 0}
          <Button size="sm" variant="quiet" onclick={clear_history}>Clear</Button>
        {/if}
      </div>
      {#if history.value.length === 0}
        <EmptyState icon={HistoryIcon} title="No calculations yet" description="Results show up here after =." />
      {:else}
        <ol class="min-h-0 flex-1 overflow-auto px-2 pb-2">
          {#each history.value as entry, index (index)}
            <li>
              <button
                type="button"
                title="Use this expression"
                class="flex w-full flex-col items-end gap-0.5 rounded-md px-2 py-2 text-right font-mono tabular-nums transition-colors duration-150 focus-visible:bg-primary/12 focus-visible:ring-2 focus-visible:ring-cottontail focus-visible:outline-none focus-visible:ring-inset"
                onclick={() => reuse(entry)}
              >
                <span class="max-w-full text-2xs break-all text-foreground/65">{display_expression(entry.expression)} =</span>
                <span class="max-w-full text-ui break-all">{entry.result}</span>
              </button>
            </li>
          {/each}
        </ol>
      {/if}
    </aside>
  </div>
</div>
