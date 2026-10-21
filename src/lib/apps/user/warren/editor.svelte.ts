import { FORMAT_ELEMENT_COMMAND, FORMAT_TEXT_COMMAND, REDO_COMMAND, UNDO_COMMAND, type LexicalEditor } from "lexical";
import { create_document, VERSION, type EditorJson, type WarrenDocument } from "./format";
import * as ops from "./lexical";
import { BlockStyle, LIST_STYLES } from "./lexical";
import { Align } from "./model";
import { BASE_PT, DEFAULT_PAGE, type PageSettings } from "./page";

export { BlockStyle, LIST_STYLES };
export type { Heading } from "./lexical";

export class WarrenEditor {
  readonly lexical: LexicalEditor;
  page = $state<PageSettings>({ ...DEFAULT_PAGE });
  json = $state.raw<EditorJson>(create_document().editor);
  bold = $state(false);
  italic = $state(false);
  underline = $state(false);
  strike = $state(false);
  subscript = $state(false);
  superscript = $state(false);
  align = $state<Align>(Align.LEFT);
  link = $state<string | null>(null);
  block = $state<BlockStyle>(BlockStyle.PARAGRAPH);
  size = $state(BASE_PT);
  word = $state("");
  selected = $state("");
  outline = $state.raw<ops.Heading[]>([]);
  goal = $state<number | null>(null);
  can_undo = $state(false);
  can_redo = $state(false);
  private revision = $state(0);
  private saved = $state(0);
  private readonly dispose: () => void;
  private readonly reset_history: () => void;

  readonly dirty = $derived(this.revision !== this.saved);

  /** `smart`: whether typed quotes, dashes and dots become typographic ones, asked on each keystroke. */
  constructor(on_error: (error: Error) => void, smart: () => boolean = () => true) {
    const { editor, dispose, reset_history } = ops.create_lexical({
      on_error,
      on_can_undo: (value) => (this.can_undo = value),
      on_can_redo: (value) => (this.can_redo = value),
      smart,
    });
    this.lexical = editor;
    this.reset_history = reset_history;
    const stop = editor.registerUpdateListener(({ editorState, dirtyElements, dirtyLeaves, tags }) => {
      if (dirtyElements.size || dirtyLeaves.size) {
        this.json = editorState.toJSON() as unknown as EditorJson;
        this.outline = ops.outline(editorState);
        if (!tags.has(ops.LOAD_TAG)) this.revision++;
      }
      const format = ops.read_format(editorState);
      if (!format) return;
      this.bold = format.bold;
      this.italic = format.italic;
      this.underline = format.underline;
      this.strike = format.strike;
      this.subscript = format.subscript;
      this.superscript = format.superscript;
      this.align = format.align;
      this.link = format.link;
      this.block = format.block;
      this.size = format.size;
      this.word = format.word;
      this.selected = format.selected;
    });
    this.json = editor.getEditorState().toJSON() as unknown as EditorJson;
    this.outline = ops.outline(editor.getEditorState());
    this.dispose = () => {
      stop();
      dispose();
    };
  }

  mount(element: HTMLElement): () => void {
    this.lexical.setRootElement(element);
    return () => this.lexical.setRootElement(null);
  }

  destroy() {
    this.dispose();
    this.lexical.setRootElement(null);
  }

  load(document: WarrenDocument) {
    const state = this.lexical.parseEditorState(document.editor as unknown as Parameters<LexicalEditor["parseEditorState"]>[0]);
    this.lexical.setEditorState(state, { tag: ops.LOAD_TAG });
    this.reset_history();
    this.json = state.toJSON() as unknown as EditorJson;
    this.outline = ops.outline(state);
    this.page = { ...document.page };
    this.goal = document.goal ?? null;
    this.revision = 0;
    this.saved = 0;
  }

  load_html(html: string) {
    this.load(create_document());
    ops.load_html(this.lexical, html);
    this.reset_history();
    this.json = this.lexical.getEditorState().toJSON() as unknown as EditorJson;
  }

  reset() {
    this.load(create_document());
  }

  snapshot(): WarrenDocument {
    return {
      version: VERSION,
      page: { ...this.page },
      ...(this.goal ? { goal: this.goal } : {}),
      editor: this.lexical.getEditorState().toJSON() as unknown as EditorJson,
    };
  }

  mark_saved() {
    this.saved = this.revision;
  }

  set_goal(goal: number | null) {
    if (goal === this.goal) return;
    this.goal = goal;
    this.revision++;
  }

  set_page(page: Partial<PageSettings>) {
    this.page = { ...this.page, ...page };
    this.revision++;
  }

  focus() {
    this.lexical.focus();
  }

  undo() {
    this.lexical.dispatchCommand(UNDO_COMMAND, undefined);
  }

  redo() {
    this.lexical.dispatchCommand(REDO_COMMAND, undefined);
  }

  toggle_bold() {
    this.lexical.dispatchCommand(FORMAT_TEXT_COMMAND, "bold");
  }

  toggle_italic() {
    this.lexical.dispatchCommand(FORMAT_TEXT_COMMAND, "italic");
  }

  toggle_underline() {
    this.lexical.dispatchCommand(FORMAT_TEXT_COMMAND, "underline");
  }

  toggle_strike() {
    this.lexical.dispatchCommand(FORMAT_TEXT_COMMAND, "strikethrough");
  }

  toggle_subscript() {
    this.lexical.dispatchCommand(FORMAT_TEXT_COMMAND, "subscript");
  }

  toggle_superscript() {
    this.lexical.dispatchCommand(FORMAT_TEXT_COMMAND, "superscript");
  }

  clear_formatting() {
    ops.clear_formatting(this.lexical);
  }

  insert_rule() {
    ops.insert_rule(this.lexical);
  }

  /** Scrolls a heading into view and puts the caret at its start; `focus` false keeps a phone's keyboard down. */
  go_to(key: string, focus: boolean) {
    this.lexical.getElementByKey(key)?.scrollIntoView({ block: "start", behavior: "smooth" });
    ops.caret_to(this.lexical, key);
    if (focus) this.lexical.focus();
  }

  set_align(align: Align) {
    this.lexical.dispatchCommand(FORMAT_ELEMENT_COMMAND, align);
  }

  set_link(url: string | null) {
    ops.set_link(this.lexical, url);
  }

  set_size(points: number) {
    ops.set_size(this.lexical, points);
  }

  set_block(style: BlockStyle) {
    ops.set_block(this.lexical, style, this.block);
  }

  insert_page_break() {
    ops.insert_page_break(this.lexical);
  }

  change_everywhere(word: string, replacement: string): number {
    return ops.change_everywhere(this.lexical, word, replacement);
  }

  find(query: string, whole: boolean): ops.Match[] {
    return ops.find_all(this.lexical.getEditorState(), query, whole);
  }

  next_after_selection(matches: ops.Match[]): number {
    return ops.next_after_selection(this.lexical.getEditorState(), matches);
  }

  select_match(match: ops.Match) {
    ops.select_match(this.lexical, match);
    this.lexical.focus();
  }

  replace_match(match: ops.Match, query: string, replacement: string) {
    ops.replace_match(this.lexical, match, query, replacement);
  }

  replace_all(query: string, replacement: string, whole: boolean): number {
    return ops.replace_all(this.lexical, query, replacement, { whole, keep_case: false }, true);
  }

  element_of(match: ops.Match): HTMLElement | null {
    return this.lexical.getElementByKey(match.key);
  }

  select_next(word: string) {
    ops.select_next(this.lexical, word);
    this.lexical.focus();
  }

  replace_word_here(replacement: string) {
    ops.replace_word_here(this.lexical, replacement);
  }
}
