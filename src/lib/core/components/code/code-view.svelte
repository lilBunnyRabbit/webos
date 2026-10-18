<script lang="ts">
  import { token_highlight, token_theme } from "./editor";
  import { load_language, type Language } from "./language";
  import { cn } from "$lib/core/utils";
  import { indentWithTab } from "@codemirror/commands";
  import { Compartment, EditorState } from "@codemirror/state";
  import { EditorView, keymap } from "@codemirror/view";
  import { basicSetup } from "codemirror";
  import { untrack } from "svelte";

  interface Props {
    value: string;
    label: string;
    language?: Language | null;
    read_only?: boolean;
    wrap?: boolean;
    onchange?: (value: string) => void;
    class?: string;
  }

  const { value, label, language = null, read_only = false, wrap = true, onchange, class: class_name }: Props = $props();

  let view = $state.raw<EditorView | null>(null);
  const language_slot = new Compartment();
  const wrap_slot = new Compartment();

  function mount(host: HTMLElement) {
    const editor = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: untrack(() => value),
        extensions: [
          basicSetup,
          keymap.of([indentWithTab]),
          token_theme,
          token_highlight,
          language_slot.of([]),
          wrap_slot.of([]),
          EditorState.readOnly.of(untrack(() => read_only)),
          EditorView.contentAttributes.of({ "aria-label": untrack(() => label) }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onchange?.(update.state.doc.toString());
          }),
        ],
      }),
    });
    view = editor;
    return () => {
      editor.destroy();
      view = null;
    };
  }

  // An outside value replaces the document; the editor's own edits already match.
  $effect(() => {
    if (!view || view.state.doc.toString() === value) return;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
  });

  $effect(() => {
    const target = view;
    if (!target) return;
    target.dispatch({ effects: wrap_slot.reconfigure(wrap ? EditorView.lineWrapping : []) });
  });

  $effect(() => {
    const target = view;
    const wanted = language;
    if (!target) return;
    if (!wanted) {
      target.dispatch({ effects: language_slot.reconfigure([]) });
      return;
    }
    let live = true;
    void load_language(wanted).then((support) => {
      if (live) target.dispatch({ effects: language_slot.reconfigure(support) });
    });
    return () => {
      live = false;
    };
  });
</script>

<div class={cn("min-h-0 overflow-hidden rounded-md ring-1 ring-foreground/8", class_name)} {@attach mount}></div>
