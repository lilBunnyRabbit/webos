import {
  buildEditorFromExtensions,
  effect,
  getExtensionDependencyFromEditor,
  HorizontalRuleExtension,
  InitialStateExtension,
  INSERT_HORIZONTAL_RULE_COMMAND,
  NestedEditorExtension,
} from "@lexical/extension";
import { HistoryExtension } from "@lexical/history";
import { $generateNodesFromDOM } from "@lexical/html";
import { $createLinkNode, $isLinkNode, $toggleLink, LinkExtension } from "@lexical/link";
import {
  $isListItemNode,
  $isListNode,
  CheckListExtension,
  INSERT_CHECK_LIST_COMMAND,
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
  COLLABORATION_TAG,
  COMMAND_PRIORITY_EDITOR,
  configExtension,
  defineExtension,
  HISTORIC_TAG,
  HISTORY_MERGE_TAG,
  HISTORY_PUSH_TAG,
  PASTE_TAG,
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
import { Align, align_of, font_size, is_page_number_line, PAGE_TOKEN, type ImageAlign } from "./model";
import { CHECK_CLASS } from "./print";
import { smarten } from "./typography";
import { $create_page_break, PageBreakExtension } from "./page-break-node";
import { $create_image, $insert_image, $is_image, $selected_image, ImageExtension, type ImageProps } from "./image-node";
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
  CHECK: "check",
} as const;
export type BlockStyle = (typeof BlockStyle)[keyof typeof BlockStyle];

export const LOAD_TAG = "warren-load";

const THEME = {
  text: { underline: "wr-underline", strikethrough: "wr-strike", underlineStrikethrough: "wr-underline wr-strike" },
  list: { nested: { listitem: "nested" }, checklist: CHECK_CLASS.list, listitemChecked: CHECK_CLASS.checked, listitemUnchecked: CHECK_CLASS.unchecked },
  hr: "wr-rule",
};

export const LIST_STYLES: readonly BlockStyle[] = [BlockStyle.BULLET, BlockStyle.NUMBER, BlockStyle.CHECK];

export interface Format {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  subscript: boolean;
  superscript: boolean;
  align: Align;
  /** The URL of the link the selection starts in. */
  link: string | null;
  block: BlockStyle;
  size: number;
  word: string;
  /** The selected text; empty for a caret. */
  selected: string;
}

export interface Heading {
  key: NodeKey;
  level: 1 | 2 | 3;
  text: string;
}

export interface Hooks {
  on_error: (error: Error) => void;
  on_can_undo: (value: boolean) => void;
  on_can_redo: (value: boolean) => void;
  /** Whether typed quotes, dashes and dots become typographic ones. */
  smart: () => boolean;
  /** Picture files pasted or dropped in; `true` when they were taken. */
  on_pictures: (editor: LexicalEditor, files: File[]) => boolean;
}

export function heading_of(style: BlockStyle): 1 | 2 | 3 | null {
  return style === BlockStyle.H1 ? 1 : style === BlockStyle.H2 ? 2 : style === BlockStyle.H3 ? 3 : null;
}

function $block_style(node: LexicalNode): BlockStyle {
  const list = $findMatchingParent(node, $isListNode);
  if (list) {
    const type = list.getListType();
    return type === "number" ? BlockStyle.NUMBER : type === "check" ? BlockStyle.CHECK : BlockStyle.BULLET;
  }
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

/**
 * The document's editor, or with `parent` a header or footer: the same nodes (so anything pasted from the body fits), its
 * own history, and Lexical's nested-editor link, so selecting in one clears the other's selection.
 */
export function create_lexical(hooks: Hooks, parent?: LexicalEditor): { editor: LexicalEditor; dispose: () => void; reset_history: () => void } {
  const warren = defineExtension({
    name: parent ? "@webos/warren/zone" : "@webos/warren",
    namespace: "warren",
    theme: THEME,
    onError: hooks.on_error,
    dependencies: [
      RichTextExtension,
      // Opening a document would announce every heading in it.
      configExtension(HeadingAnnounceExtension, { disabled: true }),
      ListExtension,
      CheckListExtension,
      HorizontalRuleExtension,
      LinkExtension,
      PageBreakExtension,
      configExtension(ImageExtension, { on_files: hooks.on_pictures }),
      ...(parent ? [configExtension(NestedEditorExtension, { $getParentEditor: () => parent })] : []),
      configExtension(HistoryExtension, { delay: 400 }),
      configExtension(InitialStateExtension, { updateOptions: { tag: [HISTORY_MERGE_TAG, LOAD_TAG], discrete: true } }),
    ],
    register: (editor, _config, state) => {
      const { canUndo, canRedo } = state.getDependency(HistoryExtension).output;
      return mergeRegister(
        effect(() => hooks.on_can_undo(canUndo.value)),
        effect(() => hooks.on_can_redo(canRedo.value)),
        editor.registerUpdateListener(({ editorState, prevEditorState, tags }) => {
          if (!hooks.smart() || editor.isComposing() || SKIP_SMART.some((tag) => tags.has(tag))) return;
          smart_typing(editor, editorState, prevEditorState);
        }),
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

const SKIP_SMART = [HISTORIC_TAG, HISTORY_PUSH_TAG, PASTE_TAG, COLLABORATION_TAG, LOAD_TAG];

// One character typed at a caret: the node's text grew by exactly that character, just before the caret. The
// replacement is pushed as its own history entry, so Undo gives back what was typed.
function smart_typing(editor: LexicalEditor, state: EditorState, previous: EditorState) {
  const typed = state.read(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection) || !selection.isCollapsed() || selection.anchor.type !== "text") return null;
    const node = selection.anchor.getNode();
    if (!$isTextNode(node) || $findMatchingParent(node, $isLinkNode)) return null;
    const offset = selection.anchor.offset;
    const text = node.getTextContent();
    const before = previous.read(() => $getNodeByKey(node.getKey())?.getTextContent());
    if (before === undefined || text.length !== before.length + 1 || text.slice(0, offset - 1) + text.slice(offset) !== before) return null;
    const replacement = smarten(text, offset);
    return replacement && { key: node.getKey(), replacement };
  });
  if (!typed) return;
  editor.update(
    () => {
      const node = $getNodeByKey(typed.key);
      if (!$isTextNode(node)) return;
      const { start, end, text } = typed.replacement;
      node.spliceText(start, end - start, text, true);
    },
    { tag: HISTORY_PUSH_TAG }
  );
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
      strike: selection.hasFormat("strikethrough"),
      subscript: selection.hasFormat("subscript"),
      superscript: selection.hasFormat("superscript"),
      align: $align_of(selection.anchor.getNode()),
      link: $findMatchingParent(selection.anchor.getNode(), $isLinkNode)?.getURL() ?? null,
      block,
      size,
      word: word ? word.node.getTextContent().slice(word.start, word.end) : "",
      selected: selection.isCollapsed() ? "" : selection.getTextContent(),
    };
  });
}

export function set_size(editor: LexicalEditor, points: number) {
  editor.update(() => {
    const selection = $getSelection();
    if (selection) $patchStyleText(selection, { "font-size": `${points}pt` });
  });
}

const LIST_COMMANDS = {
  [BlockStyle.BULLET]: INSERT_UNORDERED_LIST_COMMAND,
  [BlockStyle.NUMBER]: INSERT_ORDERED_LIST_COMMAND,
  [BlockStyle.CHECK]: INSERT_CHECK_LIST_COMMAND,
};

export function set_block(editor: LexicalEditor, style: BlockStyle, current: BlockStyle) {
  const in_list = LIST_STYLES.includes(current);
  if (style === BlockStyle.BULLET || style === BlockStyle.NUMBER || style === BlockStyle.CHECK) {
    if (current === style) editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined);
    else editor.dispatchCommand(LIST_COMMANDS[style], undefined);
    return;
  }
  if (in_list) editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined);
  const level = heading_of(style);
  editor.update(() => {
    $setBlocksType($getSelection(), () => (level ? $createHeadingNode(`h${level}`) : $createParagraphNode()));
  });
}

// Warren's pictures are blocks; Word's sit in a paragraph. A paragraph holding only a picture becomes the picture
// (keeping its alignment), any other picture moves out to just after its block.
function lift_pictures(document: Document): Document {
  const last = new Map<Element, Element>();
  for (const image of [...document.body.querySelectorAll("img")]) {
    let block: Element = image;
    while (block.parentElement && block.parentElement !== document.body) block = block.parentElement;
    if (block === image) continue;
    const align = block instanceof HTMLElement ? block.style.textAlign : "";
    if (align && !image.dataset.align) image.dataset.align = align;
    if (block.tagName === "P" && block.textContent?.trim() === "" && block.querySelectorAll("img").length === 1) {
      block.replaceWith(image);
      continue;
    }
    (last.get(block) ?? block).after(image);
    last.set(block, image);
  }
  return document;
}

// Inline nodes left at the top (text after a list, say) go into paragraphs: the root holds blocks only. mammoth never writes
// an empty paragraph, so an empty one here is what is left around a page break or a dropped picture.
export function load_html(editor: LexicalEditor, html: string) {
  editor.update(
    () => {
      const root = $getRoot();
      root.clear();
      let paragraph: ParagraphNode | null = null;
      for (const node of $generateNodesFromDOM(editor, lift_pictures(new DOMParser().parseFromString(html, "text/html")))) {
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

export interface SelectedImage extends ImageProps {
  key: NodeKey;
}

export function read_image(state: EditorState): SelectedImage | null {
  return state.read(() => {
    const node = $selected_image();
    return node ? { key: node.getKey(), ...node.props() } : null;
  });
}

export function insert_image(editor: LexicalEditor, props: Partial<ImageProps> & { src: string }, at: RangeSelection | null = null) {
  editor.update(() => {
    if (at && $getNodeByKey(at.anchor.key) && $getNodeByKey(at.focus.key)) $setSelection(at);
    const image = $selected_image();
    if (image) {
      image.insertAfter($create_image(props));
      return;
    }
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) $getRoot().selectEnd();
    else if (selection.isCollapsed()) {
      // At the start of a block the picture goes before it: Lexical's split would leave an empty copy of the block above.
      const { anchor } = selection;
      const top = anchor.getNode().getTopLevelElement();
      const first = top?.getFirstDescendant();
      if (top && anchor.offset === 0 && (anchor.key === top.getKey() || anchor.key === first?.getKey())) {
        top.insertBefore($create_image(props));
        return;
      }
    }
    $insert_image(props);
  });
}

export function capture_selection(editor: LexicalEditor): RangeSelection | null {
  return editor.getEditorState().read(() => {
    const selection = $getSelection();
    return $isRangeSelection(selection) ? selection.clone() : null;
  });
}

export function update_image(editor: LexicalEditor, key: NodeKey, patch: { width?: number; align?: ImageAlign; alt?: string }) {
  editor.update(() => {
    const node = $getNodeByKey(key);
    if (!$is_image(node)) return;
    if (patch.width !== undefined) node.set_width(patch.width);
    if (patch.align) node.set_align(patch.align);
    if (patch.alt !== undefined) node.set_alt(patch.alt);
  });
}

export function remove_image(editor: LexicalEditor, key: NodeKey) {
  editor.update(() => {
    const node = $getNodeByKey(key);
    if (!$is_image(node)) return;
    const next = node.getNextSibling() ?? node.getPreviousSibling();
    node.remove();
    if ($getRoot().isEmpty()) $getRoot().append($createParagraphNode());
    if ($isElementNode(next)) next.selectStart();
  });
}

export function remove_page_numbers(editor: LexicalEditor) {
  editor.update(() => {
    const root = $getRoot();
    for (const child of root.getChildren()) if ($isElementNode(child) && is_page_number_line(child.getTextContent())) child.remove();
    if (root.isEmpty()) root.append($createParagraphNode());
  });
}

/** Adds a centred, left or right "{page}" line, reusing an empty zone's only paragraph. */
export function add_page_number(editor: LexicalEditor, align: Align) {
  editor.update(() => {
    const root = $getRoot();
    const only = root.getChildrenSize() === 1 ? root.getFirstChild() : null;
    const line = $isParagraphNode(only) && only.getTextContentSize() === 0 ? only : root.append($createParagraphNode()) && root.getLastChildOrThrow();
    if (!$isElementNode(line)) return;
    line.append($createTextNode(PAGE_TOKEN));
    line.setFormat(align);
  });
}

export function is_empty(state: EditorState): boolean {
  return state.read(() => {
    const root = $getRoot();
    return root.getTextContent().trim() === "" && !root.getChildren().some($is_image);
  });
}

export function insert_text(editor: LexicalEditor, text: string) {
  editor.update(() => {
    const selection = $getSelection();
    if ($isRangeSelection(selection)) selection.insertText(text);
  });
}

export function insert_rule(editor: LexicalEditor) {
  editor.dispatchCommand(INSERT_HORIZONTAL_RULE_COMMAND, undefined);
}

/** Drops character formatting (bold … superscript) and font sizes from the selection; links and paragraph styles stay. */
export function clear_formatting(editor: LexicalEditor) {
  editor.update(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return;
    if (selection.isCollapsed()) {
      selection.setFormat(0);
      selection.setStyle("");
      return;
    }
    for (const node of selection.extract()) {
      if (!$isTextNode(node)) continue;
      node.setFormat(0);
      node.setStyle("");
    }
    selection.setFormat(0);
    selection.setStyle("");
  });
}

export function outline(state: EditorState): Heading[] {
  return state.read(() =>
    $getRoot()
      .getChildren()
      .filter($isHeadingNode)
      .map((node) => {
        const tag = node.getTag();
        return { key: node.getKey(), level: tag === "h1" ? 1 : tag === "h2" ? 2 : 3, text: node.getTextContent().trim() };
      })
  );
}

/** Puts the caret at the start of a block. */
export function caret_to(editor: LexicalEditor, key: NodeKey) {
  editor.update(() => {
    const node = $getNodeByKey(key);
    if ($isElementNode(node)) node.selectStart();
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
