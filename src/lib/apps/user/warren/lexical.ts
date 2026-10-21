import { createEmptyHistoryState, registerHistory } from "@lexical/history";
import {
  $isListItemNode,
  $isListNode,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  ListItemNode,
  ListNode,
  registerList,
  REMOVE_LIST_COMMAND,
} from "@lexical/list";
import { $createHeadingNode, $isHeadingNode, HeadingNode, registerRichText } from "@lexical/rich-text";
import { $getSelectionStyleValueForProperty, $patchStyleText, $setBlocksType } from "@lexical/selection";
import { $findMatchingParent, $insertNodeToNearestRoot, mergeRegister } from "@lexical/utils";
import {
  $createParagraphNode,
  $createRangeSelection,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  $setSelection,
  CAN_REDO_COMMAND,
  CAN_UNDO_COMMAND,
  CLEAR_HISTORY_COMMAND,
  COMMAND_PRIORITY_EDITOR,
  COMMAND_PRIORITY_LOW,
  createEditor,
  HISTORY_PUSH_TAG,
  INDENT_CONTENT_COMMAND,
  KEY_TAB_COMMAND,
  OUTDENT_CONTENT_COMMAND,
  type EditorState,
  type LexicalEditor,
  type LexicalNode,
  type RangeSelection,
  type TextNode,
} from "lexical";
import { Align, align_of, font_size } from "./model";
import { $create_page_break, PageBreakNode } from "./page-break-node";
import { BASE_PT, HEADING_PT } from "./page";
import { find_word, is_word, map_offset, replace_word, word_at } from "./words";

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
  const history = createEmptyHistoryState();
  const editor = createEditor({ namespace: "warren", nodes: [HeadingNode, ListNode, ListItemNode, PageBreakNode], theme: THEME, onError: hooks.on_error });
  const dispose = mergeRegister(
    registerRichText(editor),
    registerList(editor),
    registerHistory(editor, history, 400),
    editor.registerCommand(CAN_UNDO_COMMAND, (value) => (hooks.on_can_undo(value), false), COMMAND_PRIORITY_LOW),
    editor.registerCommand(CAN_REDO_COMMAND, (value) => (hooks.on_can_redo(value), false), COMMAND_PRIORITY_LOW),
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
  editor.update(
    () => {
      const root = $getRoot();
      if (root.isEmpty()) root.append($createParagraphNode());
    },
    { tag: LOAD_TAG, discrete: true }
  );
  // After a clear the first change isn't undoable unless the history knows the state it starts from.
  const reset_history = () => {
    editor.dispatchCommand(CLEAR_HISTORY_COMMAND, undefined);
    history.current = { editor, editorState: editor.getEditorState() };
  };
  reset_history();
  return { editor, dispose, reset_history };
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

export function insert_page_break(editor: LexicalEditor) {
  editor.update(() => {
    $insertNodeToNearestRoot($create_page_break());
  });
}

// One update pushed as its own history entry, so a single Undo brings every occurrence back.
export function change_everywhere(editor: LexicalEditor, word: string, replacement: string): number {
  let changed = 0;
  editor.update(
    () => {
      const selection = $getSelection();
      const points = $isRangeSelection(selection) ? [selection.anchor, selection.focus].filter((point) => point.type === "text") : [];
      for (const node of $getRoot().getAllTextNodes()) {
        const before = node.getTextContent();
        const result = replace_word(before, word, replacement);
        if (!result.count) continue;
        const moved = points.filter((point) => point.key === node.getKey()).map((point) => [point, map_offset(before, word, replacement, point.offset)] as const);
        node.setTextContent(result.text);
        for (const [point, offset] of moved) point.set(node.getKey(), offset, "text");
        changed += result.count;
      }
    },
    { tag: HISTORY_PUSH_TAG, discrete: true }
  );
  return changed;
}

export function select_next(editor: LexicalEditor, word: string) {
  editor.update(() => {
    const nodes = $getRoot().getAllTextNodes();
    const hits = nodes.flatMap((node, index) => find_word(node.getTextContent(), word).map((range) => ({ node, index, ...range })));
    if (!hits.length) return;
    const selection = $getSelection();
    let hit = hits[0];
    if ($isRangeSelection(selection)) {
      const end = selection.isBackward() ? selection.anchor : selection.focus;
      const at = nodes.findIndex((node) => node.is(end.getNode()));
      hit = hits.find((candidate) => candidate.index > at || (candidate.index === at && candidate.start >= end.offset)) ?? hits[0];
    }
    const range = $createRangeSelection();
    range.anchor.set(hit.node.getKey(), hit.start, "text");
    range.focus.set(hit.node.getKey(), hit.end, "text");
    $setSelection(range);
  });
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
