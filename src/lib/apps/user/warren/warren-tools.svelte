<script lang="ts">
  import kernel, { AiAvailability, type AiService } from "$lib/core/api";
  import { Button, IconButton, Input, Segmented, Select, Spinner } from "$lib/core/components/ui";
  import { error_message } from "$lib/core/utils";
  import {
    ArrowsClockwise as ArrowsClockwiseIcon,
    CaretRight as CaretRightIcon,
    FileDoc as FileDocIcon,
    FilePdf as FilePdfIcon,
    ListBullets as ListBulletsIcon,
    ListNumbers as ListNumbersIcon,
    Scissors as ScissorsIcon,
    Sparkle as SparkleIcon,
    TextB as TextBIcon,
    TextAlignCenter as TextAlignCenterIcon,
    TextAlignJustify as TextAlignJustifyIcon,
    TextAlignLeft as TextAlignLeftIcon,
    TextAlignRight as TextAlignRightIcon,
    TextItalic as TextItalicIcon,
    TextUnderline as TextUnderlineIcon,
  } from "phosphor-svelte";
  import type { Snippet } from "svelte";
  import { z } from "zod";
  import { BlockStyle, type WarrenEditor } from "./editor.svelte";
  import { Align } from "./model";
  import { FLOWS, FONT_SIZES, PAGE_SIZES, type Flow, type PageSize } from "./page";
  import { find_word, type Counts, type Repeat } from "./words";

  interface Props {
    editor: WarrenEditor;
    text: string;
    counts: Counts;
    repeats: Repeat[];
    open: Record<string, boolean>;
    ontoggle: (group: string, open: boolean) => void;
    onexport: (format: "docx" | "pdf") => void;
    onchanged: (count: number, word: string) => void;
  }

  let { editor, text, counts, repeats, open, ontoggle, onexport, onchanged }: Props = $props();

  const ai = $derived(kernel.service<AiService>("ai"));
  const ai_on = $derived(ai.features.prompt !== AiAvailability.NO);

  const SIZE_OPTIONS = FONT_SIZES.map((size) => ({ value: String(size), label: `${size} pt` }));
  const PAGE_OPTIONS = PAGE_SIZES.map((size) => ({ value: size, label: size }));
  const FLOW_LABELS: Record<Flow, string> = { sheets: "Sheets", continuous: "Continuous" };
  const FLOW_OPTIONS = FLOWS.map((flow) => ({ value: flow, label: FLOW_LABELS[flow] }));
  const ALIGN_BUTTONS = [
    { value: Align.LEFT, label: "Align left", icon: TextAlignLeftIcon },
    { value: Align.CENTER, label: "Centre", icon: TextAlignCenterIcon },
    { value: Align.RIGHT, label: "Align right", icon: TextAlignRightIcon },
    { value: Align.JUSTIFY, label: "Justify", icon: TextAlignJustifyIcon },
  ];
  const STYLES = [
    { value: BlockStyle.PARAGRAPH, label: "Body" },
    { value: BlockStyle.H1, label: "H1" },
    { value: BlockStyle.H2, label: "H2" },
    { value: BlockStyle.H3, label: "H3" },
  ];

  let replacement = $state("");
  let synonyms = $state<{ word: string; list: string[] } | null>(null);
  let thinking = $state(false);
  let ai_error = $state("");

  const word = $derived(editor.word);
  const occurrences = $derived(word ? find_word(text, word).length : 0);
  const size_options = $derived(
    SIZE_OPTIONS.some((option) => option.value === String(editor.size)) ? SIZE_OPTIONS : [{ value: String(editor.size), label: `${editor.size} pt` }, ...SIZE_OPTIONS]
  );

  const keep_focus = (event: PointerEvent) => event.preventDefault();

  function change_everywhere() {
    const target = replacement.trim();
    if (!word || !target) return;
    onchanged(editor.change_everywhere(word, target), word);
    replacement = "";
  }

  function change_here() {
    const target = replacement.trim();
    if (!target) return;
    editor.replace_word_here(target);
    editor.focus();
    replacement = "";
  }

  async function suggest() {
    const asked = word;
    thinking = true;
    ai_error = "";
    try {
      const result = await ai.extract(
        [
          { role: "system", content: "You are a thesaurus. Give up to eight single words or short phrases that mean the same as the given word, most common first." },
          { role: "user", content: `Synonyms for "${asked}".` },
        ],
        z.object({ synonyms: z.array(z.string().min(1).max(40)).max(8) })
      );
      synonyms = { word: asked, list: result.synonyms.filter((item) => item.toLowerCase() !== asked.toLowerCase()) };
    } catch (reason) {
      ai_error = error_message(reason);
    } finally {
      thinking = false;
    }
  }
</script>

{#snippet group(id: string, title: string, body: Snippet)}
  <details class="group/tools border-b border-foreground/8" open={open[id] ?? true} ontoggle={(event) => ontoggle(id, event.currentTarget.open)}>
    <summary class="flex h-9 cursor-pointer list-none items-center gap-1.5 px-3 text-2xs font-semibold tracking-wide text-foreground/65 uppercase select-none hover:text-foreground pointer-coarse:h-11 [&::-webkit-details-marker]:hidden">
      <CaretRightIcon weight="bold" class="size-3 transition-transform group-open/tools:rotate-90" />
      {title}
    </summary>
    <div class="flex flex-col gap-2 px-3 pb-3">
      {@render body()}
    </div>
  </details>
{/snippet}

{#snippet text_group()}
  <div class="flex items-center gap-1">
    <IconButton label="Bold (Mod+B)" pressed={editor.bold} onpointerdown={keep_focus} onclick={() => editor.toggle_bold()}><TextBIcon weight="bold" /></IconButton>
    <IconButton label="Italic (Mod+I)" pressed={editor.italic} onpointerdown={keep_focus} onclick={() => editor.toggle_italic()}><TextItalicIcon weight="bold" /></IconButton>
    <IconButton label="Underline (Mod+U)" pressed={editor.underline} onpointerdown={keep_focus} onclick={() => editor.toggle_underline()}><TextUnderlineIcon weight="bold" /></IconButton>
    <Select
      size="sm"
      class="ml-auto w-24"
      aria-label="Font size"
      value={String(editor.size)}
      options={size_options}
      onchange={(event) => {
        editor.set_size(Number(event.currentTarget.value));
        editor.focus();
      }}
    />
  </div>
{/snippet}

{#snippet paragraph_group()}
  <div class="grid grid-cols-4 gap-1">
    {#each STYLES as style (style.value)}
      <Button size="sm" variant="quiet" pressed={editor.block === style.value} onpointerdown={keep_focus} onclick={() => editor.set_block(style.value)}>{style.label}</Button>
    {/each}
  </div>
  <div class="grid grid-cols-4 gap-1" role="group" aria-label="Alignment">
    {#each ALIGN_BUTTONS as item (item.value)}
      <IconButton label={item.label} class="w-full" pressed={editor.align === item.value} onpointerdown={keep_focus} onclick={() => editor.set_align(item.value)}><item.icon weight="bold" /></IconButton>
    {/each}
  </div>
  <div class="grid grid-cols-2 gap-1">
    <Button size="sm" variant="quiet" pressed={editor.block === BlockStyle.BULLET} onpointerdown={keep_focus} onclick={() => editor.set_block(BlockStyle.BULLET)}>
      <ListBulletsIcon weight="bold" />Bullets
    </Button>
    <Button size="sm" variant="quiet" pressed={editor.block === BlockStyle.NUMBER} onpointerdown={keep_focus} onclick={() => editor.set_block(BlockStyle.NUMBER)}>
      <ListNumbersIcon weight="bold" />Numbers
    </Button>
  </div>
{/snippet}

{#snippet page_group()}
  <Segmented size="sm" label="Page size" options={PAGE_OPTIONS} bind:value={() => editor.page.size, (size: PageSize) => editor.set_page({ size })} />
  <Segmented size="sm" label="Page flow" options={FLOW_OPTIONS} bind:value={() => editor.page.flow, (flow: Flow) => editor.set_page({ flow })} />
  <Button size="sm" onpointerdown={keep_focus} onclick={() => editor.insert_page_break()}><ScissorsIcon weight="bold" />Insert page break</Button>
{/snippet}

{#snippet words_group()}
  <p class="font-mono text-2xs text-foreground/80 tabular-nums">{counts.words.toLocaleString("en")} words · {counts.characters.toLocaleString("en")} characters</p>
  <div class="flex flex-col gap-1.5">
    {#if word}
      <p class="text-ui">
        <span class="text-foreground/65">Selected</span> <span class="font-medium">“{word}”</span>
        <span class="font-mono text-2xs text-foreground/65 tabular-nums">×{occurrences}</span>
      </p>
      <Input size="sm" placeholder="Change to…" aria-label="Change to" bind:value={replacement} onkeydown={(event) => event.key === "Enter" && change_everywhere()} />
      <div class="grid grid-cols-2 gap-1">
        <Button size="sm" disabled={!replacement.trim()} onclick={change_here}>This one</Button>
        <Button size="sm" variant="primary" disabled={!replacement.trim()} onclick={change_everywhere}><ArrowsClockwiseIcon weight="bold" />Everywhere</Button>
      </div>
      {#if ai_on}
        {#if synonyms?.word === word}
          {#if synonyms.list.length}
            <div class="flex flex-wrap gap-1" aria-label="Synonyms">
              {#each synonyms.list as synonym (synonym)}
                <Button size="sm" variant="quiet" class="bg-foreground/6" pressed={replacement === synonym} onclick={() => (replacement = synonym)}>{synonym}</Button>
              {/each}
            </div>
          {:else}
            <p class="text-2xs text-foreground/65">No synonyms for this one.</p>
          {/if}
        {:else}
          <Button size="sm" variant="quiet" disabled={thinking} onclick={suggest}>
            {#if thinking}<Spinner label="Finding synonyms" />{:else}<SparkleIcon weight="bold" />{/if}Suggest synonyms
          </Button>
        {/if}
        {#if ai_error}<p class="text-2xs text-error">{ai_error}</p>{/if}
      {/if}
    {:else}
      <p class="text-2xs text-foreground/65">Select a word to change it everywhere{ai_on ? " or find synonyms" : ""}.</p>
    {/if}
  </div>
  {#if repeats.length}
    <div class="flex flex-col">
      <p class="pt-1 pb-0.5 text-2xs text-foreground/65">Used most</p>
      {#each repeats as repeat (repeat.word)}
        <button
          type="button"
          class="flex h-8 items-center justify-between rounded-md px-2 text-left text-ui hover:bg-foreground/6 focus-visible:bg-primary/12 focus-visible:outline-none pointer-coarse:h-10"
          title="Select the next “{repeat.word}”"
          onclick={() => editor.select_next(repeat.word)}
        >
          <span class="truncate">{repeat.word}</span>
          <span class="font-mono text-2xs text-foreground/65 tabular-nums">×{repeat.count}</span>
        </button>
      {/each}
    </div>
  {/if}
{/snippet}

{#snippet export_group()}
  <div class="grid grid-cols-2 gap-1">
    <Button size="sm" onclick={() => onexport("docx")}><FileDocIcon weight="bold" />Word</Button>
    <Button size="sm" onclick={() => onexport("pdf")}><FilePdfIcon weight="bold" />PDF</Button>
  </div>
{/snippet}

<div class="flex flex-col">
  {@render group("text", "Text", text_group)}
  {@render group("paragraph", "Paragraph", paragraph_group)}
  {@render group("page", "Page", page_group)}
  {@render group("words", "Words", words_group)}
  {@render group("export", "Export", export_group)}
</div>
