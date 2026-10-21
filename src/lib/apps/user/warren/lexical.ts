import { buildEditorFromExtensions, effect, getExtensionDependencyFromEditor, InitialStateExtension } from "@lexical/extension";
import { HistoryExtension } from "@lexical/history";
import { $generateNodesFromDOM } from "@lexical/html";
import { $createLinkNode, $isLinkNode, $toggleLink, LinkExtension } from "@lexical/link";
import {
  $isListItemNode,
  $isListNode,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  ListExtension,
  REMOVE_LIST_COMMAND,
} from "@lexical/list";
import { $createHeadingNode, $isHeadingNode, HeadingAnnounceExtension, RichTextExtension } from "@lexical/rich-text";
import { $getSelectionStyleValueForProperty, $patchStyleText, $setBlocksType } from "@lexical/selection";
import { $findMatchingParent, $insertNodeToNearestRoot } from "@lexical/utils";
import {
  $createParagraphNode,
  $createRangeSelection,
  $createTextNode,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isDecoratorNode,
  $isElementNode,
  $isParagraphNode,
  $isRangeSelection,
  $isTextNode,
  $setSelection,
  CLEAR_HISTORY_COMMAND,
  COMMAND_PRIORITY_EDITOR,
  configExtension,
  defineExtension,
  HISTORY_MERGE_TAG,
  HISTORY_PUSH_TAG,
  SKIP_DOM_SELECTION_TAG,
  INDENT_CONTENT_COMMAND,
  KEY_TAB_COMMAND,
  mergeRegister,
  OUTDENT_CONTENT_COMMAND,
  type EditorState,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
  type ParagraphNode,
  type RangeSelection,
  type TextNode,
} from "lexical";
import { Align, align_of, font_size } from "./model";
import { $create_page_break, PageBreakExtension } from "./page-break-node";
import { BASE_PT, HEADING_PT } from "./page";
import { find_matches, is_word, map_offset, replace_matches, WORD_MATCH, word_at, type MatchOptions } from "./words";

// Lexical's `$` functions live here: Svelte reserves the prefix in `.svelte.ts` modules.

export const BlockStyle = {
  PARAGRAPH: "paragraph",
  H1: "h1",
  H2: "h2",
  H3: "h3",
  BULLET: "bullet",
  NUMBER: "number",
} as const;
export type BlockStyle = (typeof BlockStyle)[keyof typeof BlockStyle];

export const LOAD_TAG = "warren-load";

const THEME = {
  text: { underline: "wr-underline", strikethrough: "wr-strike", underlineStrikethrough: "wr-underline wr-strike" },
  list: { nested: { listitem: "nested" } },
};

export interface Format {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  align: Align;
  /** The URL of the link the selection starts in. */
  link: string | null;
  block: BlockStyle;
  size: number;
  word: string;
}

export interface Hooks {
  on_error: (error: Error) => void;
  on_can_undo: (value: boolean) => void;
  on_can_redo: (value: boolean) => void;
}

export function heading_of(style: BlockStyle): 1 | 2 | 3 | null {
  return style === BlockStyle.H1 ? 1 : style === BlockStyle.H2 ? 2 : style === BlockStyle.H3 ? 3 : null;
}

function $block_style(node: LexicalNode): BlockStyle {
  const list = $findMatchingParent(node, $isListNode);
  if (list) return list.getListType() === "number" ? BlockStyle.NUMBER : BlockStyle.BULLET;
  const top = node.getTopLevelElement();
  if ($isHeadingNode(top)) {
    const tag = top.getTag();
    return tag === "h1" ? BlockStyle.H1 : tag === "h2" ? BlockStyle.H2 : BlockStyle.H3;
  }
  return BlockStyle.PARAGRAPH;
}

function $selected_word(selection: RangeSelection): { node: TextNode; start: number; end: number } | null {
  const node = selection.anchor.getNode();
  if (!$isTextNode(node)) return null;
  if (!selection.isCollapsed()) {
    const text = selection.getTextContent();
    if (!is_word(text.trim()) || !selection.focus.getNode().is(node)) return null;
    const start = Math.min(selection.anchor.offset, selection.focus.offset);
    const lead = text.length - text.trimStart().length;
    return { node, start: start + lead, end: start + lead + text.trim().length };
  }
  const range = word_at(node.getTextContent(), selection.anchor.offset);
  return range ? { node, ...range } : null;
}

function $align_of(node: LexicalNode): Align {
  const element = $findMatchingParent(node, $isListItemNode) ?? node.getTopLevelElement();
  if (!$isElementNode(element)) return Align.LEFT;
  return align_of({ type: element.getType(), format: element.getFormatType() }) ?? Align.LEFT;
}

function $in_list(): boolean {
  const selection = $getSelection();
  return $isRangeSelection(selection) && !!$findMatchingParent(selection.anchor.getNode(), $isListItemNode);
}

export function create_lexical(hooks: Hooks): { editor: LexicalEditor; dispose: () => void; reset_history: () => void } {
  const warren = defineExtension({
    name: "@webos/warren",
    namespace: "warren",
    theme: THEME,
    onError: hooks.on_error,
    dependencies: [
      RichTextExtension,
      // Opening a document would announce every heading in it.
      configExtension(HeadingAnnounceExtension, { disabled: true }),
      ListExtension,
      LinkExtension,
      PageBreakExtension,
      configExtension(HistoryExtension, { delay: 400 }),
      configExtension(InitialStateExtension, { updateOptions: { tag: [HISTORY_MERGE_TAG, LOAD_TAG], discrete: true } }),
    ],
    register: (editor, _config, state) => {
      const { canUndo, canRedo } = state.getDependency(HistoryExtension).output;
      return mergeRegister(
        effect(() => hooks.on_can_undo(canUndo.value)),
        effect(() => hooks.on_can_redo(canRedo.value)),
        editor.registerCommand(
          KEY_TAB_COMMAND,
          (event) => {
            if (!editor.getEditorState().read($in_list)) return false;
            event.preventDefault();
            return editor.dispatchCommand(event.shiftKey ? OUTDENT_CONTENT_COMMAND : INDENT_CONTENT_COMMAND, undefined);
          },
          COMMAND_PRIORITY_EDITOR
        )
      );
    },
  });
  const editor = buildEditorFromExtensions(warren);
  const history = getExtensionDependencyFromEditor(editor, HistoryExtension).output.historyState;
  // After a clear the first change isn't undoable unless the history knows the state it starts from.
  const reset_history = () => {
    editor.dispatchCommand(CLEAR_HISTORY_COMMAND, undefined);
    history.value.current = { editor, editorState: editor.getEditorState() };
  };
  reset_history();
  return { editor, dispose: () => editor.dispose(), reset_history };
}

export function read_format(state: EditorState): Format | null {
  return state.read(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return null;
    const block = $block_style(selection.anchor.getNode());
    const level = heading_of(block);
    const size = font_size(`font-size: ${$getSelectionStyleValueForProperty(selection, "font-size", "")}`) ?? (level ? HEADING_PT[level] : BASE_PT);
    const word = $selected_word(selection);
    return {
      bold: selection.hasFormat("bold"),
      italic: selection.hasFormat("italic"),
      underline: selection.hasFormat("underline"),
      align: $align_of(selection.anchor.getNode()),
      link: $findMatchingParent(selection.anchor.getNode(), $isLinkNode)?.getURL() ?? null,
      block,
      size,
      word: word ? word.node.getTextContent().slice(word.start, word.end) : "",
    };
  });
}

export function set_size(editor: LexicalEditor, points: number) {
  editor.update(() => {
    const selection = $getSelection();
    if (selection) $patchStyleText(selection, { "font-size": `${points}pt` });
  });
}

export function set_block(editor: LexicalEditor, style: BlockStyle, current: BlockStyle) {
  const in_list = current === BlockStyle.BULLET || current === BlockStyle.NUMBER;
  if (style === BlockStyle.BULLET || style === BlockStyle.NUMBER) {
    if (current === style) editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined);
    else editor.dispatchCommand(style === BlockStyle.BULLET ? INSERT_UNORDERED_LIST_COMMAND : INSERT_ORDERED_LIST_COMMAND, undefined);
    return;
  }
  if (in_list) editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined);
  const level = heading_of(style);
  editor.update(() => {
    $setBlocksType($getSelection(), () => (level ? $createHeadingNode(`h${level}`) : $createParagraphNode()));
  });
}

// Inline nodes left at the top (text after a list, say) go into paragraphs: the root holds blocks only. mammoth never writes
// an empty paragraph, so an empty one here is what is left around a page break or a dropped picture.
export function load_html(editor: LexicalEditor, html: string) {
  editor.update(
    () => {
      const root = $getRoot();
      root.clear();
      let paragraph: ParagraphNode | null = null;
      for (const node of $generateNodesFromDOM(editor, new DOMParser().parseFromString(html, "text/html"))) {
        if ($isParagraphNode(node) && node.isEmpty()) continue;
        if (($isElementNode(node) || $isDecoratorNode(node)) && !node.isInline()) {
          root.append(node);
          paragraph = null;
        } else {
          if (!paragraph) root.append((paragraph = $createParagraphNode()));
          paragraph.append(node);
        }
      }
      if (root.isEmpty()) root.append($createParagraphNode());
    },
    { tag: LOAD_TAG, discrete: true }
  );
}

/**
 * Links the selection to `url`, or changes the link the caret is in; with nothing selected outside a link it inserts the
 * URL as linked text. `null` removes the link.
 */
export function set_link(editor: LexicalEditor, url: string | null) {
  editor.update(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return;
    const link = $findMatchingParent(selection.anchor.getNode(), $isLinkNode);
    if (selection.isCollapsed() && link) {
      if (url) link.setURL(url);
      else {
        for (const child of link.getChildren()) link.insertBefore(child);
        link.remove();
      }
      return;
    }
    if (selection.isCollapsed()) {
      if (url) selection.insertNodes([$createLinkNode(url).append($createTextNode(url))]);
      return;
    }
    $toggleLink(url);
  });
}

export function insert_page_break(editor: LexicalEditor) {
  editor.update(() => {
    $insertNodeToNearestRoot($create_page_break());
  });
}

// One update pushed as its own history entry, so a single Undo brings every occurrence back.
// `elsewhere`: the user is typing in another field (the find bar), so the DOM selection, and focus, stay there.
export function replace_all(editor: LexicalEditor, query: string, replacement: string, options: MatchOptions, elsewhere = false): number {
  let changed = 0;
  editor.update(
    () => {
      const selection = $getSelection();
      const points = $isRangeSelection(selection) ? [selection.anchor, selection.focus].filter((point) => point.type === "text") : [];
      for (const node of $getRoot().getAllTextNodes()) {
        const before = node.getTextContent();
        const result = replace_matches(before, query, replacement, options);
        if (!result.count) continue;
        const moved = points
          .filter((point) => point.key === node.getKey())
          .map((point) => [point, map_offset(before, query, replacement, point.offset, options.whole)] as const);
        node.setTextContent(result.text);
        for (const [point, offset] of moved) point.set(node.getKey(), offset, "text");
        changed += result.count;
      }
    },
    { tag: elsewhere ? [HISTORY_PUSH_TAG, SKIP_DOM_SELECTION_TAG] : HISTORY_PUSH_TAG, discrete: true }
  );
  return changed;
}

export function change_everywhere(editor: LexicalEditor, word: string, replacement: string): number {
  return replace_all(editor, word, replacement, WORD_MATCH);
}

export interface Match {
  key: NodeKey;
  start: number;
  end: number;
}

/** Every match in document order. Like Change everywhere, a match never spans two text runs. */
export function find_all(state: EditorState, query: string, whole: boolean): Match[] {
  return state.read(() =>
    $getRoot()
      .getAllTextNodes()
      .flatMap((node) => find_matches(node.getTextContent(), query, whole).map((range) => ({ key: node.getKey(), ...range })))
  );
}

/** The first match at or after the selection's end, wrapping to the first. */
export function next_after_selection(state: EditorState, matches: Match[]): number {
  if (!matches.length) return -1;
  return state.read(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return 0;
    const end = selection.isBackward() ? selection.anchor : selection.focus;
    const order = $getRoot().getAllTextNodes().map((node) => node.getKey());
    const at = order.indexOf(end.key);
    const index = matches.findIndex((match) => {
      const position = order.indexOf(match.key);
      return position > at || (position === at && match.start >= end.offset);
    });
    return index < 0 ? 0 : index;
  });
}

export function select_match(editor: LexicalEditor, match: Match) {
  editor.update(() => {
    const range = $createRangeSelection();
    range.anchor.set(match.key, match.start, "text");
    range.focus.set(match.key, match.end, "text");
    $setSelection(range);
  });
}

export function select_next(editor: LexicalEditor, word: string) {
  const state = editor.getEditorState();
  const matches = find_all(state, word, true);
  if (matches.length) select_match(editor, matches[next_after_selection(state, matches)]);
}

/** Replaces one match, if the text there is still what was found. */
export function replace_match(editor: LexicalEditor, match: Match, query: string, replacement: string) {
  editor.update(() => {
    const node = $getNodeByKey(match.key);
    if (!$isTextNode(node) || node.getTextContent().slice(match.start, match.end).toLowerCase() !== query.toLowerCase()) return;
    node.spliceText(match.start, match.end - match.start, replacement, false);
  }, { tag: SKIP_DOM_SELECTION_TAG, discrete: true });
}

export function replace_word_here(editor: LexicalEditor, replacement: string) {
  editor.update(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return;
    const word = $selected_word(selection);
    if (!word) return;
    const range = $createRangeSelection();
    range.anchor.set(word.node.getKey(), word.start, "text");
    range.focus.set(word.node.getKey(), word.end, "text");
    $setSelection(range);
    range.insertText(replacement);
  });
}
