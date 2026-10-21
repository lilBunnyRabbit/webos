import { FORMAT_ELEMENT_COMMAND, FORMAT_TEXT_COMMAND, REDO_COMMAND, UNDO_COMMAND, type LexicalEditor } from "lexical";
import { create_document, VERSION, type EditorJson, type WarrenDocument } from "./format";
import * as ops from "./lexical";
import { BlockStyle } from "./lexical";
import { Align } from "./model";
import { BASE_PT, DEFAULT_PAGE, type PageSettings } from "./page";

export { BlockStyle };

export class WarrenEditor {
  readonly lexical: LexicalEditor;
  page = $state<PageSettings>({ ...DEFAULT_PAGE });
  json = $state.raw<EditorJson>(create_document().editor);
  bold = $state(false);
  italic = $state(false);
  underline = $state(false);
  align = $state<Align>(Align.LEFT);
  block = $state<BlockStyle>(BlockStyle.PARAGRAPH);
  size = $state(BASE_PT);
  word = $state("");
  can_undo = $state(false);
  can_redo = $state(false);
  private revision = $state(0);
  private saved = $state(0);
  private readonly dispose: () => void;
  private readonly reset_history: () => void;

  readonly dirty = $derived(this.revision !== this.saved);

  constructor(on_error: (error: Error) => void) {
    const { editor, dispose, reset_history } = ops.create_lexical({
      on_error,
      on_can_undo: (value) => (this.can_undo = value),
      on_can_redo: (value) => (this.can_redo = value),
    });
    this.lexical = editor;
    this.reset_history = reset_history;
    const stop = editor.registerUpdateListener(({ editorState, dirtyElements, dirtyLeaves, tags }) => {
      if (dirtyElements.size || dirtyLeaves.size) {
        this.json = editorState.toJSON() as unknown as EditorJson;
        if (!tags.has(ops.LOAD_TAG)) this.revision++;
      }
      const format = ops.read_format(editorState);
      if (!format) return;
      this.bold = format.bold;
      this.italic = format.italic;
      this.underline = format.underline;
      this.align = format.align;
      this.block = format.block;
      this.size = format.size;
      this.word = format.word;
    });
    this.json = editor.getEditorState().toJSON() as unknown as EditorJson;
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
    this.page = { ...document.page };
    this.revision = 0;
    this.saved = 0;
  }

  reset() {
    this.load(create_document());
  }

  snapshot(): WarrenDocument {
    return { version: VERSION, page: { ...this.page }, editor: this.lexical.getEditorState().toJSON() as unknown as EditorJson };
  }

  mark_saved() {
    this.saved = this.revision;
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

  set_align(align: Align) {
    this.lexical.dispatchCommand(FORMAT_ELEMENT_COMMAND, align);
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

  select_next(word: string) {
    ops.select_next(this.lexical, word);
    this.lexical.focus();
  }

  replace_word_here(replacement: string) {
    ops.replace_word_here(this.lexical, replacement);
  }
}
