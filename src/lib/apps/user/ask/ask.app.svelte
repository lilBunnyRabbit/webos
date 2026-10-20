<script lang="ts">
  import kernel, { AI_REQUIREMENTS, AiAvailability, AiFeature, type AiMessage, type AiService, type ClipboardService, type FilesService } from "$lib/core/api";
  import { get_app_context } from "$lib/core/contexts/app";
  import { parent_path } from "$lib/core/api/services/files/path";
  import { error_message } from "$lib/core/utils";
  import { Button, CopyButton, EmptyState, IconButton, Spinner, Textarea, Toolbar } from "$lib/core/components/ui";
  import {
    ChatCircleText as ChatCircleTextIcon,
    FolderOpen as FolderOpenIcon,
    NotePencil as NotePencilIcon,
    PaperPlaneRight as PaperPlaneRightIcon,
    Stop as StopIcon,
    Trash as TrashIcon,
    Warning as WarningIcon,
  } from "phosphor-svelte";
  import { untrack } from "svelte";
  import manifest from "./index";
  import { MAX_FILE_CHARS, MODEL_SETTINGS, clip_source, system_prompt, type AskSource } from "./ask";
  import Markdown from "./markdown.svelte";

  interface Turn {
    role: "user" | "assistant";
    content: string;
    stopped?: boolean;
  }

  const { path: initial_path }: { path?: string } = $props();
  const { window: win } = get_app_context();
  const files = $derived(kernel.service<FilesService>("files"));
  const ai = $derived(kernel.service<AiService>("ai"));
  const clipboard = $derived(kernel.service<ClipboardService>("clipboard"));

  let availability = $state<AiAvailability | null>(null);
  let source = $state.raw<(AskSource & { path: string | null }) | null>(null);
  let loading = $state(false);
  let load_error = $state<string | null>(null);
  let turns = $state<Turn[]>([]);
  let draft = $state("");
  let error = $state<string | null>(null);
  let controller = $state.raw<AbortController | null>(null);
  let composer = $state<HTMLTextAreaElement | null>(null);

  const busy = $derived(controller !== null);

  untrack(() => ai)
    .availability(AiFeature.PROMPT)
    .then((answer) => (availability = answer));

  $effect(() => win.set_title(source?.name ?? null));

  $effect(() => () => controller?.abort());

  let request = 0;
  async function open_file(load: () => Promise<File>, path: string | null) {
    const id = ++request;
    loading = true;
    load_error = null;
    try {
      const file = await load();
      const text = await file.text();
      if (id !== request) return;
      new_chat();
      source = { ...clip_source(file.name, text), path };
    } catch (reason) {
      if (id === request) load_error = error_message(reason);
    } finally {
      if (id === request) loading = false;
    }
  }

  function open_path(target: string) {
    return open_file(async () => {
      const file = await files.get_file(target);
      if (!file) throw new Error(`File not found: ${target}`);
      return file;
    }, target);
  }

  const initial = untrack(() => initial_path);
  if (initial) open_path(initial);

  async function pick() {
    const start_path = source?.path ? parent_path(source.path) : undefined;
    const chosen = await win.pick_file({ accept: manifest.tools, start_path, title: "Ask about a file" });
    if (chosen) open_path(chosen);
  }

  function new_chat() {
    controller?.abort();
    turns = [];
    error = null;
    composer?.focus();
  }

  async function send() {
    const question = draft.trim();
    if (!question || busy) return;
    draft = "";
    error = null;

    const history: AiMessage[] = [
      { role: "system", content: system_prompt(source) },
      ...turns.map(({ role, content }) => ({ role, content })),
      { role: "user", content: question },
    ];
    turns.push({ role: "user", content: question }, { role: "assistant", content: "" });
    const answer = turns[turns.length - 1];
    const own = new AbortController();
    controller = own;

    try {
      for await (const chunk of ai.prompt(history, { signal: own.signal })) answer.content += chunk;
      if (availability !== AiAvailability.READY) availability = AiAvailability.READY;
    } catch (reason) {
      if (own.signal.aborted) {
        answer.stopped = true;
        if (!answer.content && turns.at(-1) === answer) turns.splice(-2, 2);
      } else {
        error = error_message(reason);
        if (turns.at(-1) === answer) turns.splice(-2, 2);
        draft = draft || question;
      }
    } finally {
      if (controller === own) controller = null;
    }
  }

  async function remove_model() {
    const copy = await win.confirm("Remove Chrome's AI model?", {
      detail: `The model belongs to Chrome, so WebOS can't delete it. Open ${MODEL_SETTINGS} in a new tab and turn off On-device AI: Chrome deletes the model and Ask stops working until you turn it back on.`,
      confirm_label: "Copy address",
    });
    if (copy) await clipboard.copy_text(MODEL_SETTINGS);
  }

  function stop() {
    controller?.abort();
  }

  function on_keydown(event: KeyboardEvent) {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      send();
    } else if (event.key === "Escape" && busy) {
      event.preventDefault();
      stop();
    }
  }
</script>

{#if availability === null}
  <div class="grid h-full place-items-center"><Spinner label="Checking for on-device AI" /></div>
{:else if availability === AiAvailability.NO}
  <EmptyState icon={ChatCircleTextIcon} title="Ask isn't available on this device" description={AI_REQUIREMENTS} />
{:else}
  <div class="grid h-full grid-rows-[auto_auto_1fr_auto]">
    <Toolbar>
      <IconButton label="Open…" size="sm" onclick={pick}><FolderOpenIcon weight="bold" /></IconButton>
      <span class="min-w-0 flex-1 truncate px-1 text-ui font-medium" title={source?.path ?? undefined}>
        {source?.name ?? "No file open"}
      </span>
      <Button size="sm" variant="quiet" aria-label="New chat" disabled={turns.length === 0 && !error} onclick={new_chat}>
        <NotePencilIcon weight="bold" /> <span class="hidden @sm:inline">New chat</span>
      </Button>
      <IconButton label="Remove the AI model…" size="sm" onclick={remove_model}><TrashIcon weight="bold" /></IconButton>
    </Toolbar>

    <div>
      {#if load_error}
        <div role="alert" class="flex items-center gap-2 border-b border-foreground/8 bg-warning/10 px-3 py-2 text-ui">
          <WarningIcon weight="fill" class="size-4 shrink-0 text-warning" />
          <span class="min-w-0 flex-1">Couldn't open the file: {load_error}</span>
        </div>
      {:else if source?.clipped}
        <div class="flex items-center gap-2 border-b border-foreground/8 bg-warning/10 px-3 py-2 text-ui">
          <WarningIcon weight="fill" class="size-4 shrink-0 text-warning" />
          <span class="min-w-0 flex-1">
            {source.name} is long: only its first {MAX_FILE_CHARS.toLocaleString("en")} characters fit, so answers cover that part.
          </span>
        </div>
      {/if}
      {#if availability === AiAvailability.DOWNLOAD}
        <div class="flex items-center gap-2 border-b border-foreground/8 bg-background-light px-3 py-2 text-ui text-foreground/80">
          <span class="min-w-0 flex-1">
            The first question downloads Chrome's AI model once, a few GB. It runs on this device after that, offline too.
          </span>
        </div>
      {/if}
    </div>

    <!-- column-reverse keeps the view pinned to the newest text natively while it streams; mb-auto keeps a short chat at the top. -->
    <div class="flex min-h-0 flex-col-reverse overflow-auto" aria-live="polite">
      {#if loading}
        <div class="grid flex-1 place-items-center"><Spinner label="Reading file" /></div>
      {:else if turns.length === 0 && !error}
        <EmptyState
          class="flex-1"
          icon={ChatCircleTextIcon}
          title={source ? `Ask about ${source.name}` : "Ask anything"}
          description={source
            ? "What it says, what a part means, what's missing. Answers come from the file only."
            : "Or open a text file to ask about it. Answers are made on this device."}
        >
          {#snippet actions()}
            {#if !source}
              <Button variant="primary" onclick={pick}><FolderOpenIcon weight="bold" /> Open a file…</Button>
            {/if}
          {/snippet}
        </EmptyState>
      {:else}
        <ol class="mx-auto mb-auto flex w-full max-w-3xl flex-col gap-3 p-3">
          {#each turns as turn, index (index)}
            {#if turn.role === "user"}
              <li class="max-w-[85%] self-end rounded-xl bg-primary/14 px-3 py-2 text-ui whitespace-pre-wrap">{turn.content}</li>
            {:else}
              <li class="group flex max-w-[92%] flex-col items-start gap-1 self-start">
                <div class="min-w-0 max-w-full rounded-xl bg-background-light px-3 py-2 text-ui">
                  {#if turn.content}<Markdown text={turn.content} />{:else}<Spinner label="Thinking" />{/if}
                </div>
                {#if turn.stopped || (turn.content && !(busy && index === turns.length - 1))}
                  <div class="flex items-center gap-1 text-2xs text-foreground/65">
                    {#if turn.stopped}<span class="px-1">Stopped</span>{/if}
                    {#if turn.content}<CopyButton text={turn.content} label="Copy answer" />{/if}
                  </div>
                {/if}
              </li>
            {/if}
          {/each}
          {#if error}
            <li role="alert" class="flex max-w-[92%] items-start gap-2 self-start rounded-xl bg-error/10 px-3 py-2 text-ui">
              <WarningIcon weight="fill" class="mt-0.5 size-4 shrink-0 text-error" />
              <span class="min-w-0">Couldn't answer: {error}</span>
            </li>
          {/if}
        </ol>
      {/if}
    </div>

    <div class="flex items-end gap-2 border-t border-foreground/8 bg-background-light p-2">
      <Textarea
        bind:value={draft}
        bind:element={composer}
        rows={1}
        aria-label="Question"
        placeholder={source ? `Ask about ${source.name}` : "Ask a question"}
        class="max-h-40 min-h-9 flex-1 resize-none field-sizing-content pointer-coarse:min-h-10"
        onkeydown={on_keydown}
      />
      {#if busy}
        <Button onclick={stop}><StopIcon weight="fill" /> Stop</Button>
      {:else}
        <Button variant="primary" aria-label="Send" disabled={!draft.trim() || loading} onclick={send}>
          <PaperPlaneRightIcon weight="fill" /> <span class="hidden @sm:inline">Send</span>
        </Button>
      {/if}
    </div>
  </div>
{/if}
