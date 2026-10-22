import { picture_data_url } from "$kit/utils/picture";
import { untrack } from "svelte";
import { FORMAT_ELEMENT_COMMAND, FORMAT_TEXT_COMMAND, REDO_COMMAND, UNDO_COMMAND, type EditorState, type LexicalEditor } from "lexical";
import { create_document, empty_editor, VERSION, type EditorJson, type WarrenDocument } from "./format";
import type { ColourProperty } from "./colour";
import * as ops from "./lexical";
import { BlockStyle, LIST_STYLES } from "./lexical";
import * as tables from "./lexical-table";
import { TableAction, type TableInfo } from "./lexical-table";
import { Align, page_number_align, PICTURE, type ImageAlign } from "./model";
import { DEFAULT_PAGE, geometry, type PageSettings } from "./page";
import { DEFAULT_STYLES, resolve_styles, StyleId, style_overrides, type DocStyles, type StyleSpec } from "./styles";

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
  adding = $state(0);
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

  /** `smart`: whether typed quotes, dashes and dots become typographic ones, asked on each keystroke. */
  constructor(on_error: (error: Error) => void, smart: () => boolean = () => true, pictures: PictureHooks = {}) {
    this.pictures = pictures;
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
        },
        parent
      );
      this.disposers.push(built.dispose);
      this.disposers.push(built.editor.registerUpdateListener(({ editorState, dirtyElements, dirtyLeaves, tags }) => this.updated(zone, editorState, dirtyElements.size + dirtyLeaves.size > 0, tags)));
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
  }

  has(zone: Margin): boolean {
    return (zone === Zone.HEADER ? this.header_json : this.footer_json) !== null;
  }

  private activate(zone: Zone) {
    if (this.active === zone) return;
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
    this.image = null;
    this.json = state.toJSON() as unknown as EditorJson;
    this.outline = ops.outline(state);
    this.page = { ...document.page };
    this.goal = document.goal ?? null;
    this.styles = resolve_styles(document.styles);
    this.revision = 0;
    this.saved = 0;
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
      page: { ...this.page },
      ...(this.goal ? { goal: this.goal } : {}),
      ...(styles ? { styles } : {}),
      ...zone(Zone.HEADER),
      ...zone(Zone.FOOTER),
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

  select_next(word: string) {
    ops.select_next(this.lexical, word);
    this.lexical.focus();
  }

  replace_word_here(replacement: string) {
    ops.replace_word_here(this.lexical, replacement);
  }
}
