import { picture_data_url } from "$kit/utils/picture";
import { untrack } from "svelte";
import { COLLABORATION_TAG, FORMAT_ELEMENT_COMMAND, FORMAT_TEXT_COMMAND, HISTORIC_TAG, PASTE_TAG, REDO_COMMAND, UNDO_COMMAND, type EditorState, type LexicalEditor, type RangeSelection } from "lexical";
import { MarkNode } from "@lexical/mark";
import { clean_words, create_document, empty_editor, new_document_id, VERSION, type Comment, type EditorJson, type WarrenDocument } from "./format";
import type { ColourProperty } from "./colour";
import * as ops from "./lexical";
import { BlockStyle, LIST_STYLES } from "./lexical";
import * as tables from "./lexical-table";
import { TableAction, type TableInfo } from "./lexical-table";
import { Align, page_number_align, PICTURE, type ImageAlign } from "./model";
import { DEFAULT_PAGE, geometry, type PageSettings } from "./page";
import { DEFAULT_STYLES, resolve_styles, StyleId, style_overrides, type DocStyles, type StyleSpec } from "./styles";
import { filter_slash, type SlashCommand, type SlashItem } from "./slash";

export { BlockStyle, LIST_STYLES, TableAction };
export type { Heading, SelectedImage } from "./lexical";
export type { TableInfo } from "./lexical-table";

/** The named style a block follows; lists and table text follow Normal. */
export function style_of(block: BlockStyle): StyleId {
  if (block === BlockStyle.TITLE) return StyleId.TITLE;
  if (block === BlockStyle.H1) return StyleId.H1;
  if (block === BlockStyle.H2) return StyleId.H2;
  if (block === BlockStyle.H3) return StyleId.H3;
  if (block === BlockStyle.QUOTE) return StyleId.QUOTE;
  return StyleId.NORMAL;
}

export const Zone = { BODY: "body", HEADER: "header", FOOTER: "footer" } as const;
export type Zone = (typeof Zone)[keyof typeof Zone];
export type Margin = Exclude<Zone, "body">;

export interface PageNumbers {
  zone: Margin;
  align: Align;
}

const CSS_PX_PER_MM = 96 / 25.4;

export interface Slash {
  zone: Zone;
  at: ops.SlashAt;
  query: string;
}

const SLASH_SKIP = [HISTORIC_TAG, PASTE_TAG, COLLABORATION_TAG, ops.LOAD_TAG];

export interface PictureHooks {
  failed?: (reason: unknown) => void;
  added?: () => void;
}

async function natural_width(src: string): Promise<number> {
  const image = new Image();
  image.src = src;
  await image.decode();
  return image.naturalWidth;
}

export class WarrenEditor {
  readonly lexical: LexicalEditor;
  readonly zones: Record<Margin, LexicalEditor>;
  page = $state<PageSettings>({ ...DEFAULT_PAGE });
  json = $state.raw<EditorJson>(create_document().editor);
  header_json = $state.raw<EditorJson | null>(null);
  footer_json = $state.raw<EditorJson | null>(null);
  /** Where typing and the toolbar go: the body, or a header or footer that's switched on. */
  active = $state<Zone>(Zone.BODY);
  bold = $state(false);
  italic = $state(false);
  underline = $state(false);
  strike = $state(false);
  subscript = $state(false);
  superscript = $state(false);
  link = $state<string | null>(null);
  block = $state<BlockStyle>(BlockStyle.PARAGRAPH);
  color = $state<string | null>(null);
  highlight = $state<string | null>(null);
  styles = $state.raw<DocStyles>(DEFAULT_STYLES);
  table = $state.raw<TableInfo | null>(null);
  private own_size = $state<number | null>(null);
  private own_align = $state<Align | null>(null);
  word = $state("");
  selected = $state("");
  image = $state.raw<ops.SelectedImage | null>(null);
  outline = $state.raw<ops.Heading[]>([]);
  goal = $state<number | null>(null);
  /** Names the version history; `null` for a document from before there was one, until it's saved. */
  doc_id = $state<string | null>(null);
  comments = $state.raw<Comment[]>([]);
  comments_here = $state.raw<string[]>([]);
  ignored_words = $state.raw<string[]>([]);
  adding = $state(0);
  /** The slash menu, open while a "/" typed at a block start or after a space is followed by a word. */
  slash = $state.raw<Slash | null>(null);
  slash_index = $state(0);
  readonly slash_items = $derived<SlashItem[]>(this.slash ? filter_slash(this.slash.query) : []);
  private history = $state<Record<Zone, { undo: boolean; redo: boolean }>>({
    body: { undo: false, redo: false },
    header: { undo: false, redo: false },
    footer: { undo: false, redo: false },
  });
  private revision = $state(0);
  private saved = $state(0);
  private readonly disposers: (() => void)[] = [];
  private readonly resets: Record<Zone, () => void>;
  private readonly pictures: PictureHooks;
  private readonly on_command: (command: SlashCommand) => void;

  readonly dirty = $derived(this.revision !== this.saved);
  readonly size = $derived(this.own_size ?? this.styles[style_of(this.block)].size);
  readonly align = $derived(this.own_align ?? this.styles[style_of(this.block)].align ?? this.styles.normal.align ?? Align.LEFT);
  readonly can_undo = $derived(this.history[this.active].undo);
  readonly can_redo = $derived(this.history[this.active].redo);
  readonly page_numbers = $derived.by<PageNumbers | null>(() => {
    const header = page_number_align(this.header_json ?? undefined);
    if (header) return { zone: Zone.HEADER, align: header };
    const footer = page_number_align(this.footer_json ?? undefined);
    return footer ? { zone: Zone.FOOTER, align: footer } : null;
  });

  /**
   * `smart`: whether typed quotes, dashes and dots become typographic ones, asked on each keystroke. `on_command`: a
   * slash menu item was picked, after the "/" and its word are gone.
   */
  constructor(on_error: (error: Error) => void, smart: () => boolean = () => true, pictures: PictureHooks = {}, on_command: (command: SlashCommand) => void = () => {}) {
    this.pictures = pictures;
    this.on_command = on_command;
    const create = (zone: Zone, parent?: LexicalEditor) => {
      const built = ops.create_lexical(
        {
          on_error,
          on_can_undo: (value) => (this.history[zone].undo = value),
          on_can_redo: (value) => (this.history[zone].redo = value),
          smart,
          on_pictures: (editor, files) => {
            void this.insert_pictures(files, editor);
            return true;
          },
          on_menu_key: (key, event) => this.menu_key(key, event),
        },
        parent
      );
      this.disposers.push(built.dispose);
      this.disposers.push(
        built.editor.registerUpdateListener(({ editorState, prevEditorState, dirtyElements, dirtyLeaves, tags }) => {
          this.updated(zone, editorState, dirtyElements.size + dirtyLeaves.size > 0, tags);
          if (zone === this.active) this.follow_slash(zone, editorState, prevEditorState, tags);
        })
      );
      return built;
    };
    const body = create(Zone.BODY);
    this.lexical = body.editor;
    const header = create(Zone.HEADER, body.editor);
    const footer = create(Zone.FOOTER, body.editor);
    this.zones = { header: header.editor, footer: footer.editor };
    this.resets = { body: body.reset_history, header: header.reset_history, footer: footer.reset_history };
    this.json = body.editor.getEditorState().toJSON() as unknown as EditorJson;
    this.outline = ops.outline(body.editor.getEditorState());
    this.disposers.push(body.editor.registerMutationListener(MarkNode, () => this.paint_marks()));
  }

  get edits(): number {
    return this.revision;
  }

  // Lexical's mark DOM carries no ids, so each mark's state (open, resolved, or a comment that's gone) goes on as data.
  private paint_marks() {
    const known = new Map(this.comments.map((comment) => [comment.id, comment]));
    for (const [key, ids] of ops.mark_ids_by_key(this.lexical.getEditorState())) {
      const element = this.lexical.getElementByKey(key);
      if (!element) continue;
      const comments = ids.map((id) => known.get(id)).filter((comment) => comment !== undefined);
      element.dataset.comment = comments.some((comment) => !comment.resolved) ? "open" : comments.length ? "resolved" : "none";
      element.toggleAttribute("data-current", ids.some((id) => this.comments_here.includes(id)));
    }
  }

  private editor_of(zone: Zone): LexicalEditor {
    return zone === Zone.BODY ? this.lexical : this.zones[zone];
  }

  private get target(): LexicalEditor {
    return this.editor_of(this.active);
  }

  private updated(zone: Zone, state: EditorState, changed: boolean, tags: Set<string>) {
    if (changed) {
      const json = state.toJSON() as unknown as EditorJson;
      if (zone === Zone.BODY) {
        this.json = json;
        this.outline = ops.outline(state);
      } else if (this.has(zone)) {
        this[zone === Zone.HEADER ? "header_json" : "footer_json"] = json;
      }
      if (!tags.has(ops.LOAD_TAG)) this.revision++;
    }
    if (zone === this.active) this.read(state);
  }

  private read(state: EditorState) {
    this.image = ops.read_image(state);
    this.table = tables.read_table(state);
    const format = ops.read_format(state);
    if (!format) return;
    this.bold = format.bold;
    this.italic = format.italic;
    this.underline = format.underline;
    this.strike = format.strike;
    this.subscript = format.subscript;
    this.superscript = format.superscript;
    this.own_align = format.align;
    this.link = format.link;
    this.block = format.block;
    this.own_size = format.size;
    this.color = format.color;
    this.highlight = format.highlight;
    this.word = this.active === Zone.BODY ? format.word : "";
    this.selected = this.active === Zone.BODY ? format.selected : "";
    const here = this.active === Zone.BODY ? ops.comments_at(state) : [];
    if (here.join() !== this.comments_here.join()) {
      this.comments_here = here;
      this.paint_marks();
    }
  }

  private follow_slash(zone: Zone, state: EditorState, previous: EditorState, tags: Set<string>) {
    const open = this.slash;
    if (open?.zone === zone) {
      const query = ops.slash_query(state, open.at);
      if (query === null) this.close_slash();
      else if (query !== open.query) {
        this.slash = { ...open, query };
        this.slash_index = 0;
      }
      return;
    }
    if (SLASH_SKIP.some((tag) => tags.has(tag))) return;
    const at = ops.slash_typed(state, previous);
    if (!at) return;
    this.slash = { zone, at, query: "" };
    this.slash_index = 0;
  }

  close_slash() {
    this.slash = null;
    this.slash_index = 0;
  }

  /** Runs a slash menu item: the "/" and its word go, then the app does the rest. */
  pick_slash(index = this.slash_index) {
    const open = this.slash;
    const item = this.slash_items[index];
    if (!open || !item) return;
    this.close_slash();
    ops.remove_slash(this.editor_of(open.zone), open.at);
    this.on_command(item.id);
  }

  private menu_key(key: ops.MenuKey, event: KeyboardEvent | null): boolean {
    if (!this.slash) return false;
    const count = this.slash_items.length;
    if (key === "escape") this.close_slash();
    else if (!count) {
      if (key === "enter" || key === "tab") this.close_slash();
      return false;
    } else if (key === "down") this.slash_index = (this.slash_index + 1) % count;
    else if (key === "up") this.slash_index = (this.slash_index - 1 + count) % count;
    else this.pick_slash();
    event?.preventDefault();
    return true;
  }

  /** The key of the block the caret is in, for focus mode. */
  current_block(): string | null {
    return ops.current_block(this.lexical.getEditorState());
  }

  has(zone: Margin): boolean {
    return (zone === Zone.HEADER ? this.header_json : this.footer_json) !== null;
  }

  private activate(zone: Zone) {
    if (this.active === zone) return;
    this.close_slash();
    this.active = zone;
    this.read(this.target.getEditorState());
  }

  // Untracked: setting the root commits, and the update listeners read `active`, which would make an attachment that
  // calls this re-run (and re-mount, stealing focus) whenever another zone takes focus.
  mount(element: HTMLElement, zone: Zone = Zone.BODY): () => void {
    const editor = this.editor_of(zone);
    untrack(() => editor.setRootElement(element));
    const focus = () => this.activate(zone);
    element.addEventListener("focusin", focus);
    return () => {
      element.removeEventListener("focusin", focus);
      editor.setRootElement(null);
      if (this.active === zone) this.activate(Zone.BODY);
    };
  }

  destroy() {
    for (const dispose of this.disposers) dispose();
    this.lexical.setRootElement(null);
    this.zones.header.setRootElement(null);
    this.zones.footer.setRootElement(null);
  }

  private load_zone(zone: Margin, json: EditorJson | undefined) {
    const editor = this.zones[zone];
    const state = editor.parseEditorState((json ?? empty_editor()) as unknown as Parameters<LexicalEditor["parseEditorState"]>[0]);
    editor.setEditorState(state, { tag: ops.LOAD_TAG });
    this.resets[zone]();
    this[zone === Zone.HEADER ? "header_json" : "footer_json"] = json ? (state.toJSON() as unknown as EditorJson) : null;
  }

  load(document: WarrenDocument) {
    const state = this.lexical.parseEditorState(document.editor as unknown as Parameters<LexicalEditor["parseEditorState"]>[0]);
    this.lexical.setEditorState(state, { tag: ops.LOAD_TAG });
    this.resets.body();
    this.load_zone(Zone.HEADER, document.header);
    this.load_zone(Zone.FOOTER, document.footer);
    this.active = Zone.BODY;
    this.close_slash();
    this.image = null;
    this.json = state.toJSON() as unknown as EditorJson;
    this.outline = ops.outline(state);
    this.page = { ...document.page };
    this.goal = document.goal ?? null;
    this.styles = resolve_styles(document.styles);
    this.doc_id = document.id ?? null;
    this.comments = document.comments ?? [];
    this.ignored_words = document.ignored_words ?? [];
    this.revision = 0;
    this.saved = 0;
    this.paint_marks();
  }

  /** Markdown as a new document; the count of pictures that weren't inside the file. */
  load_markdown(text: string): number {
    this.load(create_document());
    const report = ops.load_markdown(this.lexical, text);
    this.resets.body();
    this.json = this.lexical.getEditorState().toJSON() as unknown as EditorJson;
    this.outline = ops.outline(this.lexical.getEditorState());
    return report.pictures_left;
  }

  load_html(html: string) {
    this.load(create_document());
    ops.load_html(this.lexical, html);
    this.resets.body();
    this.json = this.lexical.getEditorState().toJSON() as unknown as EditorJson;
  }

  reset() {
    this.load(create_document());
  }

  snapshot(): WarrenDocument {
    const zone = (zone: Margin) => (this.has(zone) ? { [zone]: this.zones[zone].getEditorState().toJSON() as unknown as EditorJson } : {});
    const styles = style_overrides(this.styles);
    return {
      version: VERSION,
      ...(this.doc_id ? { id: this.doc_id } : {}),
      page: { ...this.page },
      ...(this.goal ? { goal: this.goal } : {}),
      ...(styles ? { styles } : {}),
      ...zone(Zone.HEADER),
      ...zone(Zone.FOOTER),
      ...(this.comments.length ? { comments: this.comments } : {}),
      ...(this.ignored_words.length ? { ignored_words: this.ignored_words } : {}),
      editor: this.lexical.getEditorState().toJSON() as unknown as EditorJson,
    };
  }

  ensure_id(): string {
    this.doc_id ??= new_document_id();
    return this.doc_id;
  }

  /** A copy (Save as, a template) starts a history of its own. */
  renew_id(): string {
    this.doc_id = new_document_id();
    return this.doc_id;
  }

  /**
   * Puts a saved version back as one change Undo takes back. Page setup, styles, the goal and the ignored words come with
   * it; comments are merged, so a comment made since stays listed.
   */
  restore(document: WarrenDocument) {
    ops.replace_content(this.lexical, document.editor);
    for (const zone of [Zone.HEADER, Zone.FOOTER] as const) {
      const json = document[zone];
      if (!json) {
        this.set_zone(zone, false);
        continue;
      }
      this.set_zone(zone, true);
      ops.replace_content(this.zones[zone], json);
    }
    this.page = { ...document.page };
    this.goal = document.goal ?? null;
    this.styles = resolve_styles(document.styles);
    this.ignored_words = document.ignored_words ?? [];
    const restored = new Map((document.comments ?? []).map((comment) => [comment.id, comment]));
    this.comments = [...(document.comments ?? []), ...this.comments.filter((comment) => !restored.has(comment.id))];
    this.revision++;
    this.paint_marks();
  }

  add_comment(text: string, at: RangeSelection | null, quote: string): boolean {
    const id = new_document_id();
    if (!ops.add_comment_mark(this.lexical, id, at)) return false;
    this.comments = [...this.comments, { id, text, quote, created: Date.now() }];
    this.revision++;
    this.paint_marks();
    return true;
  }

  capture_body_selection(): RangeSelection | null {
    return ops.capture_selection(this.lexical);
  }

  set_comment(id: string, patch: { text?: string; resolved?: boolean }) {
    this.comments = this.comments.map((comment) => {
      if (comment.id !== id) return comment;
      const { resolved, ...rest } = { ...comment, ...patch };
      return resolved ? { ...rest, resolved } : rest;
    });
    this.revision++;
    this.paint_marks();
  }

  delete_comment(id: string) {
    ops.remove_comment_mark(this.lexical, id);
    this.comments = this.comments.filter((comment) => comment.id !== id);
    this.revision++;
  }

  show_comment(id: string, focus: boolean): boolean {
    const element = ops.select_comment(this.lexical, id);
    if (!element) return false;
    element.scrollIntoView({ block: "center", behavior: "smooth" });
    if (focus) this.lexical.focus();
    return true;
  }

  ignore_word(word: string) {
    this.ignored_words = clean_words([...this.ignored_words, word]) ?? [];
    this.revision++;
  }

  replace_word_everywhere(word: string, replacement: string): number {
    return ops.replace_word_everywhere(this.lexical, word, replacement);
  }

  replace_selection(at: RangeSelection, text: string) {
    ops.replace_selection(this.lexical, at, text);
  }

  insert_below(at: RangeSelection, text: string) {
    ops.insert_below(this.lexical, at, text);
  }

  mark_saved() {
    this.saved = this.revision;
  }

  set_goal(goal: number | null) {
    if (goal === this.goal) return;
    this.goal = goal;
    this.revision++;
  }

  set_style(id: StyleId, patch: Partial<StyleSpec>) {
    this.styles = { ...this.styles, [id]: { ...this.styles[id], ...patch } };
    this.revision++;
  }

  reset_style(id: StyleId) {
    this.styles = { ...this.styles, [id]: DEFAULT_STYLES[id] };
    this.revision++;
  }

  set_page(page: Partial<PageSettings>) {
    this.page = { ...this.page, ...page };
    this.revision++;
  }

  /** Switches a header or footer on (empty) or off (its content goes). */
  set_zone(zone: Margin, on: boolean) {
    if (on === this.has(zone)) return;
    this.load_zone(zone, on ? empty_editor() : undefined);
    if (!on && this.active === zone) this.activate(Zone.BODY);
    this.revision++;
  }

  zone_empty(zone: Margin): boolean {
    return ops.is_empty(this.zones[zone].getEditorState());
  }

  set_page_numbers(numbers: PageNumbers | null) {
    for (const zone of [Zone.HEADER, Zone.FOOTER] as const) if (this.has(zone)) ops.remove_page_numbers(this.zones[zone]);
    if (!numbers) return;
    this.set_zone(numbers.zone, true);
    ops.add_page_number(this.zones[numbers.zone], numbers.align);
  }

  /** Puts `{page}` or `{pages}` at the caret of the header or footer being edited. */
  insert_token(token: string) {
    if (this.active === Zone.BODY) return;
    ops.insert_text(this.target, token);
  }

  focus(zone: Zone = this.active) {
    this.editor_of(zone).focus();
  }

  undo() {
    this.target.dispatchCommand(UNDO_COMMAND, undefined);
  }

  redo() {
    this.target.dispatchCommand(REDO_COMMAND, undefined);
  }

  toggle_bold() {
    this.target.dispatchCommand(FORMAT_TEXT_COMMAND, "bold");
  }

  toggle_italic() {
    this.target.dispatchCommand(FORMAT_TEXT_COMMAND, "italic");
  }

  toggle_underline() {
    this.target.dispatchCommand(FORMAT_TEXT_COMMAND, "underline");
  }

  toggle_strike() {
    this.target.dispatchCommand(FORMAT_TEXT_COMMAND, "strikethrough");
  }

  toggle_subscript() {
    this.target.dispatchCommand(FORMAT_TEXT_COMMAND, "subscript");
  }

  toggle_superscript() {
    this.target.dispatchCommand(FORMAT_TEXT_COMMAND, "superscript");
  }

  clear_formatting() {
    ops.clear_formatting(this.target);
  }

  insert_rule() {
    ops.insert_rule(this.target);
  }

  /** Scrolls a heading into view and puts the caret at its start; `focus` false keeps a phone's keyboard down. */
  go_to(key: string, focus: boolean) {
    this.lexical.getElementByKey(key)?.scrollIntoView({ block: "start", behavior: "smooth" });
    ops.caret_to(this.lexical, key);
    if (focus) this.lexical.focus();
  }

  set_align(align: Align) {
    this.target.dispatchCommand(FORMAT_ELEMENT_COMMAND, align);
  }

  set_link(url: string | null) {
    ops.set_link(this.target, url);
  }

  set_size(points: number) {
    ops.set_size(this.target, points);
  }

  set_colour(property: ColourProperty, hex: string | null) {
    ops.set_colour(this.target, property, hex);
  }

  insert_table(rows: number, columns: number) {
    tables.insert_table(this.target, rows, columns);
  }

  table_action(action: TableAction) {
    tables.table_action(this.target, action);
  }

  set_table_header(on: boolean) {
    if (this.table) tables.set_table_header(this.target, this.table.key, on);
  }

  set_table_borders(on: boolean) {
    if (this.table) tables.set_table_borders(this.target, this.table.key, on);
  }

  set_table_widths(widths: number[], key = this.table?.key, editor: LexicalEditor = this.target) {
    if (key) tables.set_table_widths(editor, key, widths);
  }

  set_block(style: BlockStyle) {
    ops.set_block(this.target, style, this.block);
  }

  insert_page_break() {
    ops.insert_page_break(this.lexical);
  }

  private column_px(): number {
    const page = geometry(this.page);
    return (page.width - page.margins.left - page.margins.right) * CSS_PX_PER_MM;
  }

  /**
   * Encodes picture files and puts them at the selection of `editor` (the active one by default), each as wide as its
   * pixels at print size, up to the column.
   */
  async insert_pictures(files: File[], editor: LexicalEditor = this.target) {
    this.adding++;
    let at = ops.capture_selection(editor);
    try {
      for (const file of files) {
        const src = await picture_data_url(file, PICTURE);
        const width = Math.min(100, ((await natural_width(src)) / this.column_px()) * 100);
        ops.insert_image(editor, { src, width }, at);
        at = null;
      }
      this.pictures.added?.();
    } catch (reason) {
      this.pictures.failed?.(reason);
    } finally {
      this.adding--;
    }
  }

  update_image(patch: { width?: number; align?: ImageAlign; alt?: string }) {
    if (this.image) ops.update_image(this.target, this.image.key, patch);
  }

  remove_image() {
    if (this.image) ops.remove_image(this.target, this.image.key);
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

  select_next(word: string, focus = true) {
    const key = ops.select_next(this.lexical, word);
    if (focus) this.lexical.focus();
    else if (key) this.lexical.getElementByKey(key)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  replace_word_here(replacement: string) {
    ops.replace_word_here(this.lexical, replacement);
  }
}
