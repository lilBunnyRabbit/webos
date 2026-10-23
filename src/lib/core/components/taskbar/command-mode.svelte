<script lang="ts">
  import kernel, { EntryStatus, format_keys, type AppsService, type Entry, type ShellService, type ShortcutsService } from "$lib/core/api";
  import { fields, resolve } from "$lib/core/api/services/shell/parse";
  import { to_text } from "$lib/core/api/services/shell/values";
  import { cn } from "$lib/core/utils";
  import { TerminalWindow as TerminalWindowIcon } from "phosphor-svelte";
  import { untrack } from "svelte";
  import { Button, Kbd, Spinner } from "../ui";

  /** `line` is the query after `>`; `online` writes it back with the `>`. */
  let { line, online, onclose }: { line: string; online: (line: string) => void; onclose: () => void } = $props();

  const shell = $derived(kernel.service<ShellService>("shell"));
  const shortcuts = $derived(kernel.service<ShortcutsService>("shortcuts"));
  const apps = $derived(kernel.service<AppsService>("apps"));
  // One session while the palette is open; typed lines join the shared history (ADR-033).
  const session = untrack(() => shell.session());
  untrack(() => void shell.load());

  interface Row {
    label: string;
    detail?: string;
    keys?: string[];
    apply: () => void;
  }

  let index = $state(0);
  /** Past the command name, Enter runs the line unless a completion was picked with the arrows. */
  let chosen = $state(false);
  let result = $state<Entry | null>(null);
  let completions = $state<Row[]>([]);

  const keys_for = $derived.by(() => {
    const map = new Map<string, string[]>();
    for (const shortcut of shortcuts.list()) {
      if ("command" in shortcut && !map.has(shortcut.command)) map.set(shortcut.command, format_keys(shortcut.keys, shortcuts.mac));
    }
    return map;
  });

  /** Typing the command name: commands. Past it: the shell's completions for the arg under the cursor. */
  const naming = $derived.by(() => {
    const words = line.trimStart().split(/\s+/);
    return words.length <= 1 || resolve(words.slice(0, -1), (id) => shell.find(id)) === null;
  });

  const commands = $derived.by((): Row[] => {
    const needle = line.trim().toLowerCase();
    return shell.commands
      .filter((command) => (command.available?.() ?? true) === true)
      .filter((command) => !needle || command.id.includes(needle) || command.description.toLowerCase().includes(needle))
      .sort((a, b) => Number(!a.id.startsWith(needle)) - Number(!b.id.startsWith(needle)))
      .map((command) => {
        const needs_args = fields(command).some((field) => field.positional && !field.optional && field.type !== "array");
        return {
          label: command.id,
          detail: command.description,
          keys: keys_for.get(command.id),
          apply: () => (needs_args ? online(`${command.id} `) : run(command.id)),
        };
      });
  });

  $effect(() => {
    if (naming) {
      completions = [];
      return;
    }
    const typed = line;
    void shell.complete(typed, typed.length, session).then((found) => {
      if (typed !== line) return;
      completions = found.items.map((item) => {
        const next = typed.slice(0, found.from) + item.value + (item.final === false ? "" : " ");
        return { label: item.label ?? item.value, detail: item.detail, apply: () => online(next) };
      });
    });
  });

  const rows = $derived(naming ? commands : completions);

  $effect(() => {
    void rows;
    index = 0;
    chosen = false;
  });

  async function run(text: string): Promise<void> {
    const handle = session.run(text);
    result = handle.entry;
    await handle.done;
    if (handle.entry.status === EntryStatus.DONE && handle.entry.values.length === 0) onclose();
  }

  function in_terminal(): void {
    apps.launch("terminal", { run: line.trim() });
    onclose();
  }

  /** The launcher's field hands its keys here while in command mode. */
  export function keydown(event: KeyboardEvent): void {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (rows.length === 0) return;
      index = chosen || naming ? (index + (event.key === "ArrowDown" ? 1 : rows.length - 1)) % rows.length : event.key === "ArrowDown" ? 0 : rows.length - 1;
      chosen = true;
    } else if (event.key === "Tab" && rows[index]) {
      event.preventDefault();
      if (naming) online(`${rows[index].label} `);
      else rows[index].apply();
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (event.metaKey || event.ctrlKey) in_terminal();
      else if ((naming || chosen) && rows[index]) rows[index].apply();
      else if (line.trim()) void run(line.trim());
    }
  }

  const preview = $derived(result ? result.values.slice(0, 8).map((value) => to_text(value, (type) => shell.value_type(type))) : []);
</script>

{#if result && (result.status !== EntryStatus.DONE || result.values.length > 0)}
  <div class="flex flex-col gap-2 rounded-xl bg-field p-3 font-mono text-2xs">
    <div class="flex items-center gap-2 text-foreground/65">
      <span class="truncate">› {result.input}</span>
      {#if result.status === EntryStatus.RUNNING}<Spinner class="ml-auto" />{/if}
    </div>
    {#if result.error}<p class="text-error break-words whitespace-pre-wrap">{result.error}</p>{/if}
    {#if preview.length > 0}<pre class="max-h-48 overflow-auto whitespace-pre-wrap">{preview.join("\n")}</pre>{/if}
    {#if result.values.length > preview.length}<p class="text-foreground/65">… {result.values.length - preview.length} more</p>{/if}
    <Button variant="quiet" class="self-start" onclick={in_terminal}><TerminalWindowIcon weight="bold" /> Open in Terminal</Button>
  </div>
{/if}

<ul class="flex flex-col gap-0.5" role="listbox" aria-label="Commands">
  {#each rows as row, row_index (row.label)}
    <li>
      <button
        role="option"
        aria-selected={row_index === index}
        class={cn("flex h-8 w-full items-center gap-3 rounded-md px-2 text-left", row_index === index && (naming || chosen) ? "bg-primary/12" : "hover:bg-foreground/6")}
        onpointerdown={(event) => event.preventDefault()}
        onclick={row.apply}
      >
        <span class="shrink-0 font-mono text-ui">{row.label}</span>
        {#if row.detail}<span class="min-w-0 flex-1 truncate text-2xs text-foreground/65">{row.detail}</span>{/if}
        {#if row.keys}<span class="ml-auto flex shrink-0 gap-0.5">{#each row.keys as key (key)}<Kbd>{key}</Kbd>{/each}</span>{/if}
      </button>
    </li>
  {:else}
    <li class="px-2 py-6 text-center text-ui text-foreground/65">{naming ? (shell.loaded ? "No commands match" : "Loading commands…") : "Enter runs it"}</li>
  {/each}
</ul>
