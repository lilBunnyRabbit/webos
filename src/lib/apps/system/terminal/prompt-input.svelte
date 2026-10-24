<script lang="ts">
  import type { CompletionResult, ShellService, ShellSession } from "$lib/core/api";
  import { tilde_path } from "$lib/core/api/services/files/path";
  import { cn } from "$lib/core/utils";
  import { apply, common_prefix, history_hint } from "./line";

  let {
    shell,
    session,
    running,
    ctrl_latched = $bindable(false),
    onsubmit,
    onabort,
  }: {
    shell: ShellService;
    session: ShellSession;
    running: boolean;
    /** Set by the mobile key row: the next key acts as Ctrl+key. */
    ctrl_latched?: boolean;
    onsubmit: (line: string) => void;
    onabort: () => void;
  } = $props();

  const anchor = `--terminal-input-${crypto.randomUUID()}`;

  let input: HTMLInputElement | undefined = $state();
  let popover: HTMLElement | undefined = $state();
  let line = $state("");
  let cursor = $state(0);

  let popup = $state<(CompletionResult & { index: number }) | null>(null);
  let completion_hint = $state("");
  let history_index = $state<number | null>(null);
  let draft = "";
  // The hint and the popup refresh on the same keystroke, so each keeps its own counter.
  const sequence = { hint: 0, popup: 0 };

  const at_end = $derived(cursor === line.length);
  const hint = $derived(!at_end || popup ? "" : history_hint(line, shell.history) || completion_hint);

  export function focus(): void {
    input?.focus({ preventScroll: true });
  }

  /** The mobile key row's keys, as if pressed on the field. */
  export function press(key: string): void {
    focus();
    handle(new KeyboardEvent("keydown", { key, ctrlKey: ctrl_latched }));
    ctrl_latched = false;
  }

  export function insert(text: string): void {
    if (!input) return;
    input.setRangeText(text, input.selectionStart ?? line.length, input.selectionEnd ?? line.length, "end");
    sync();
    focus();
  }

  function sync(): void {
    if (!input) return;
    line = input.value;
    cursor = input.selectionStart ?? line.length;
  }

  function set_line(value: string, at = value.length): void {
    line = value;
    cursor = at;
    if (!input) return;
    input.value = value;
    input.setSelectionRange(at, at);
  }

  async function fetch_completions(kind: keyof typeof sequence): Promise<CompletionResult | null> {
    const id = ++sequence[kind];
    const result = await shell.complete(line, cursor, session);
    return id === sequence[kind] ? result : null;
  }

  /** The one completion that fits, as ghost text. History wins when it has a match. */
  async function refresh_hint(): Promise<void> {
    completion_hint = "";
    if (!at_end || line.trim() === "" || history_hint(line, shell.history)) return;
    const result = await fetch_completions("hint");
    if (!result || result.items.length !== 1) return;
    const typed = line.slice(result.from, result.to);
    const value = result.items[0].value;
    if (value.toLowerCase().startsWith(typed.toLowerCase()) && value.length > typed.length) completion_hint = value.slice(typed.length);
  }

  async function refresh_popup(): Promise<void> {
    const result = await fetch_completions("popup");
    popup = result && result.items.length > 1 ? { ...result, index: Math.min(popup?.index ?? 0, result.items.length - 1) } : null;
  }

  async function tab(): Promise<void> {
    const result = await fetch_completions("popup");
    if (!result || result.items.length === 0) return;
    if (result.items.length === 1) {
      const next = apply(line, result.from, result.to, result.items[0]);
      set_line(next.line, next.cursor);
      return;
    }
    const typed = line.slice(result.from, result.to);
    const prefix = common_prefix(result.items.map((item) => item.value));
    if (prefix.length > typed.length) {
      const next = apply(line, result.from, result.to, { value: prefix, final: false });
      set_line(next.line, next.cursor);
    }
    popup = { ...result, to: result.from + Math.max(prefix.length, typed.length), index: 0 };
  }

  function pick(index: number): void {
    if (!popup) return;
    const next = apply(line, popup.from, popup.to, popup.items[index]);
    popup = null;
    set_line(next.line, next.cursor);
    // A folder was picked: list what's inside, as fish does.
    if (next.line.endsWith("/")) void refresh_popup();
    else void refresh_hint();
  }

  function walk_history(step: -1 | 1): void {
    const history = shell.history;
    if (history_index === null) {
      if (step === 1) return;
      draft = line;
      history_index = history.length;
    }
    const index = history_index + step;
    if (index < 0) return;
    if (index >= history.length) {
      history_index = null;
      set_line(draft);
      return;
    }
    history_index = index;
    set_line(history[index]);
  }

  function submit(): void {
    if (running) return;
    const value = line;
    popup = null;
    history_index = null;
    completion_hint = "";
    set_line("");
    onsubmit(value);
  }

  /** Returns whether it handled the key. Shared by the field and the mobile key row. */
  function handle(event: KeyboardEvent): boolean {
    const ctrl = event.ctrlKey && !event.metaKey && !event.altKey;
    if (ctrl && event.key.toLowerCase() === "c") {
      if (running) onabort();
      else set_line("");
      popup = null;
      return true;
    }
    if (ctrl && event.key.toLowerCase() === "l") {
      session.clear();
      return true;
    }
    if (ctrl && event.key.toLowerCase() === "u") {
      set_line(line.slice(cursor), 0);
      return true;
    }

    switch (event.key) {
      case "Tab":
        if (popup) popup.index = (popup.index + (event.shiftKey ? popup.items.length - 1 : 1)) % popup.items.length;
        else void tab();
        return true;
      case "Enter":
        if (popup) pick(popup.index);
        else submit();
        return true;
      case "Escape":
        if (!popup) return false;
        popup = null;
        return true;
      case "ArrowUp":
      case "ArrowDown":
        if (popup) popup.index = (popup.index + (event.key === "ArrowUp" ? popup.items.length - 1 : 1)) % popup.items.length;
        else walk_history(event.key === "ArrowUp" ? -1 : 1);
        return true;
      case "ArrowRight":
        if (!hint || !at_end) {
          if (event.isTrusted) return false;
          set_line(line, Math.min(line.length, cursor + 1));
          return true;
        }
        set_line(line + hint);
        completion_hint = "";
        return true;
      case "ArrowLeft":
        if (event.isTrusted) return false;
        set_line(line, Math.max(0, cursor - 1));
        return true;
    }
    return false;
  }

  $effect(() => {
    if (popup && popover && !popover.matches(":popover-open")) popover.showPopover();
  });
</script>

<div class="flex min-w-0 items-baseline gap-2" style:anchor-name={anchor}>
  <span class="shrink-0 text-primary">{tilde_path(session.cwd)}</span>
  <span class="shrink-0 text-foreground/50">❯</span>
  <span class="relative min-w-0 flex-1">
    <span aria-hidden="true" class="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre">
      <span class="invisible">{line}</span><span class="text-foreground/35">{hint}</span>
    </span>
    <input
      bind:this={input}
      class="relative w-full bg-transparent p-0 font-mono text-[length:inherit] text-foreground caret-primary outline-none"
      aria-label="Command"
      autocomplete="off"
      autocapitalize="off"
      spellcheck="false"
      enterkeyhint="go"
      oninput={() => {
        sync();
        history_index = null;
        if (ctrl_latched && line.length > 0) {
          const key = line.slice(cursor - 1, cursor);
          set_line(line.slice(0, cursor - 1) + line.slice(cursor), cursor - 1);
          ctrl_latched = false;
          handle(new KeyboardEvent("keydown", { key, ctrlKey: true }));
          return;
        }
        if (popup) void refresh_popup();
        void refresh_hint();
      }}
      onkeydown={(event) => {
        if (event.isComposing) return;
        if (handle(event)) event.preventDefault();
      }}
      onkeyup={sync}
      onclick={sync}
      onblur={() => (popup = null)}
    />
  </span>
</div>

{#if popup}
  <div
    bind:this={popover}
    popover="manual"
    class="inset-auto m-0 mt-1 max-h-56 w-max max-w-[min(28rem,90vw)] overflow-y-auto rounded-lg border-0 bg-background-lighter p-1 font-mono text-2xs text-foreground shadow-popover"
    style:position-anchor={anchor}
    style:position-area="bottom span-right"
    style:position-try-fallbacks="flip-block"
    role="listbox"
    aria-label="Completions"
  >
    {#each popup.items as item, index (item.value)}
      <button
        type="button"
        role="option"
        aria-selected={index === popup.index}
        tabindex="-1"
        class={cn("flex w-full items-baseline gap-4 rounded-md px-2 py-1 text-left", index === popup.index ? "bg-primary/12 text-foreground" : "text-foreground/80 hover:bg-background-lighter hover:text-foreground hover:shadow-control")}
        onpointerdown={(event) => event.preventDefault()}
        onclick={() => pick(index)}
      >
        <span class="whitespace-pre">{item.label ?? item.value}</span>
        {#if item.detail}<span class="ml-auto truncate text-foreground/50">{item.detail}</span>{/if}
      </button>
    {/each}
  </div>
{/if}
