<script lang="ts">
  import { load_language, Language, token_highlight, token_theme } from "$kit/components/code";
  import { unifiedMergeView } from "@codemirror/merge";
  import { EditorState } from "@codemirror/state";
  import { EditorView } from "@codemirror/view";
  import { basicSetup } from "codemirror";
  import { merge_theme } from "$lib/apps/user/diff/theme";

  let { original, optimized }: { original: string; optimized: string } = $props();

  let host = $state<HTMLElement>();

  $effect(() => {
    if (!host) return;
    const parent = host;
    const doc = optimized;
    const base = original;
    let view: EditorView | null = null;
    let cancelled = false;
    load_language(Language.HTML).then((language) => {
      if (cancelled) return;
      view = new EditorView({
        parent,
        state: EditorState.create({
          doc,
          extensions: [
            basicSetup,
            token_theme,
            token_highlight,
            merge_theme,
            language,
            EditorView.lineWrapping,
            EditorState.readOnly.of(true),
            EditorView.editable.of(false),
            unifiedMergeView({ original: base, mergeControls: false, collapseUnchanged: { margin: 3, minSize: 4 } }),
          ],
        }),
      });
    });
    return () => {
      cancelled = true;
      view?.destroy();
    };
  });
</script>

<div bind:this={host} class="h-full min-h-0 overflow-hidden [&_.cm-editor]:h-full"></div>
