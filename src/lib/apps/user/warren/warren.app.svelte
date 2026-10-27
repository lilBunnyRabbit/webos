<script lang="ts">
  import kernel, { AiAvailability, NotificationType, Platform, ShortcutCategory, type AiService, type DialogsService, type NotificationsService, type ShortcutsService } from "$lib/core/api";
  import { BRAND_LIGHT } from "$lib/core/api/services/settings/themes";
  import { Button, Grabber, IconButton, Select, Spinner, StatusBar, Toolbar } from "$lib/core/components/ui";
  import { swipe_dismiss } from "$lib/core/utils/swipe-dismiss";
  import { confirm_discard, get_app_context } from "$lib/core/contexts/app";
  import { is_system_path } from "$lib/core/api/services/files/hierarchy";
  import { base_name, file_extension, parent_path } from "$lib/core/api/services/files/path";
  import { error_message, format_bytes, format_datetime } from "$lib/core/utils";
  import { pick_device_files } from "$lib/core/utils/device-file";
  import { print_html } from "$lib/core/utils/print";
  import {
    ArrowClockwise as ArrowClockwiseIcon,
    ArrowCounterClockwise as ArrowCounterClockwiseIcon,
    Camera as CameraIcon,
    ChatTeardropText as ChatTeardropTextIcon,
    ClockCounterClockwise as ClockCounterClockwiseIcon,
    Sparkle as SparkleIcon,
    Devices as DevicesIcon,
    Image as ImageIcon,
    Stack as StackIcon,
    StackPlus as StackPlusIcon,
    CaretDown as CaretDownIcon,
    CornersIn as CornersInIcon,
    CornersOut as CornersOutIcon,
    FileMd as FileMdIcon,
    Paragraph as ParagraphIcon,
    DotsThree as DotsThreeIcon,
    FileDoc as FileDocIcon,
    FilePdf as FilePdfIcon,
    FilePlus as FilePlusIcon,
    FloppyDisk as FloppyDiskIcon,
    FloppyDiskBack as FloppyDiskBackIcon,
    FolderOpen as FolderOpenIcon,
    ListBullets as ListBulletsIcon,
    ListNumbers as ListNumbersIcon,
    Table as TableIcon,
    TextB as TextBIcon,
    TextItalic as TextItalicIcon,
    TextUnderline as TextUnderlineIcon,
  } from "phosphor-svelte";
  import { onMount, untrack } from "svelte";
  import { z } from "zod";
  import inter_url from "../../../../assets/fonts/InterVariable.woff2?url";
  import { build_docx, DOCX_TYPE, font_name } from "./docx";
  import { BlockStyle, LIST_STYLES, TableAction, WarrenEditor, Zone, type Margin } from "./editor.svelte";
  import { clean_words, EXTENSION, new_document_id, parse_document, serialize_document, type Comment, type WarrenDocument } from "./format";
  import { document_file_name, font_sources, read_file, stem_of, with_extension, write_file } from "./io";
  import { HISTORY_INTERVAL, type Snapshot } from "./history";
  import { list_snapshots, write_snapshot } from "./history-files";
  import WarrenHistory from "./warren-history.svelte";
  import { SpellList, SpellStatus } from "./spell-list.svelte";
  import { check_form } from "./spelling";
  import WarrenSpelling from "./warren-spelling.svelte";
  import WarrenComments from "./warren-comments.svelte";
  import WarrenHelp from "./warren-help.svelte";
  import { HELP_MAX_CHARACTERS, HELP_MODES, type HelpMode } from "./writing-help";
  import type { RangeSelection } from "lexical";
  import { document_text, picture_size } from "./model";
  import { Flow, geometry, ZONE_GAP_MM, zone_distance } from "./page";
  import { BODY_FAMILY, document_css, style_family, type Families, type PrintFonts } from "./print";
  import { style_fonts } from "./styles";
  import { attach_column_resize } from "./table-resize";
  import WarrenTable from "./warren-table.svelte";
  import { printable } from "./print-layout";
  import { TEMPLATES_DIR, type Template } from "./templates";
  import WarrenTemplates from "./warren-templates.svelte";
  import { fill_sheets } from "./sheets";
  import WarrenFind from "./warren-find.svelte";
  import WarrenLink from "./warren-link.svelte";
  import WarrenTools from "./warren-tools.svelte";
  import { face_css } from "./fonts";
  import { load_faces, type FaceSource } from "$lib/core/utils/font-loader";
  import { font_label } from "$lib/core/api/services/settings/fonts";
  import type { FontChoice } from "$lib/core/api/services/settings/type";
  import { count, reading_minutes, repeated_words } from "./words";
  import { report_error } from "$kit/utils/report-error";
  import { motion_reduced } from "$lib/core/utils/motion";
  import { is_markdown, MARKDOWN_EXTENSIONS, MARKDOWN_TYPE, to_markdown } from "./markdown";
  import { draw_marks } from "./marks";
  import { SlashCommand } from "./slash";
  import WarrenSlash from "./warren-slash.svelte";

  const { path: initial_path }: { path?: string } = $props();
  const { app_id, window_id, window: win, storage, achievements } = get_app_context();

  const notifications = $derived(kernel.service<NotificationsService>("notifications"));
  const shortcuts = $derived(kernel.service<ShortcutsService>("shortcuts"));
  const dialogs = $derived(kernel.service<DialogsService>("dialogs"));

  const groups = storage.persisted<Record<string, boolean>>("groups", {}, z.record(z.string(), z.boolean()));
  const mobile = kernel.platform === Platform.MOBILE;

  const smart = storage.persisted<boolean>("smart", true, z.boolean());

  const units = storage.persisted<"mm" | "in">("units", "mm", z.enum(["mm", "in"]));

  const marks = storage.persisted<boolean>("marks", false, z.boolean());

  const spelling_on = storage.persisted<boolean>("spelling", false, z.boolean());
  const ignored_everywhere = storage.persisted<string[]>("ignored", [], z.array(z.string()));
  const dictionary = storage.persisted<string[]>("dictionary", [], z.array(z.string()));
  const spell = new SpellList();

  const ai = $derived(kernel.service<AiService>("ai"));
  const ai_on = $derived(!mobile && ai.features.prompt !== AiAvailability.NO);

  // Past this the .warren file is slow to open and save, and a phone may run short of memory.
  const LARGE_PICTURES = 5 * 1024 * 1024;
  let warned_large = false;

  const editor = new WarrenEditor(
    (error) => report_error(app_id, "Something went wrong in the editor", error),
    () => smart.value,
    {
      failed: (reason) => report_error(app_id, "Couldn't add the picture", reason),
      added: () => {
        const size = picture_size(editor.snapshot());
        if (size < LARGE_PICTURES || warned_large) return;
        warned_large = true;
        notifications.notify(app_id, {
          type: NotificationType.WARNING,
          title: "This document is getting large",
          message: `Its pictures take ${format_bytes(size)}, so saving and opening slow down. Fewer or smaller pictures keep it quick.`,
        });
      },
    },
    (command) => run_slash(command)
  );

  let file_path = $state<string | null>(null);
  let draft = $state<{ name: string; folder: string } | null>(null);
  let loading = $state(false);
  let sheet = $state<"more" | "table" | null>(null);
  let root = $state<HTMLElement | null>(null);

  const file_name = $derived(file_path ? base_name(file_path) : (draft?.name ?? document_file_name("Untitled")));
  const stem = $derived(stem_of(file_name));
  const read_only = $derived(file_path !== null && is_system_path(file_path));
  const folder = $derived(file_path && !read_only ? parent_path(file_path) : (draft?.folder ?? "/home/Documents"));
  const text = $derived(document_text(editor.json));
  const counts = $derived(count(text));
  const repeats = $derived(repeated_words(text));
  const selection = $derived(editor.selected ? count(editor.selected) : null);
  const goal_progress = $derived(editor.goal ? Math.min(1, counts.words / editor.goal) : null);
  const page = $derived(geometry(editor.page));
  const has_header = $derived(editor.has(Zone.HEADER));
  const has_footer = $derived(editor.has(Zone.FOOTER));
  let head = $state<HTMLElement | null>(null);
  let foot = $state<HTMLElement | null>(null);
  const sheets = $derived(editor.page.flow === Flow.SHEETS);

  const PAPER_VARS = Object.entries(BRAND_LIGHT)
    .map(([key, value]) => `--${key.replaceAll("_", "-")}:${value}`)
    .join(";");
  const STYLE_OPTIONS = [
    { value: BlockStyle.PARAGRAPH, label: "Normal" },
    { value: BlockStyle.TITLE, label: "Title" },
    { value: BlockStyle.H1, label: "Heading 1" },
    { value: BlockStyle.H2, label: "Heading 2" },
    { value: BlockStyle.H3, label: "Heading 3" },
    { value: BlockStyle.QUOTE, label: "Quote" },
  ];
  const EDITOR_FAMILIES: Families = { body: "var(--doc-font,Inter)", builtin: (id) => `var(--wr-font-${id},Inter)` };
  const doc_css = $derived(document_css(".warren-doc", editor.styles, EDITOR_FAMILIES) + document_css(".zone-doc", editor.styles, EDITOR_FAMILIES));
  const uid = $props.id();
  const link_id = `warren-link-${uid}`;
  const link_anchor = `--warren-link-${uid}`;

  const find_input_id = `warren-find-input-${uid}`;
  let finding = $state(false);

  function open_find() {
    sheet = null;
    if (!finding) {
      finding = true;
      return;
    }
    const input = document.getElementById(find_input_id);
    if (input instanceof HTMLInputElement) {
      input.focus();
      input.select();
    }
  }

  let link_placement = $state<"anchor" | "center" | "sheet">("anchor");

  // From the More sheet the button goes away with the sheet, so there is nothing to anchor to.
  function open_link() {
    link_placement = mobile ? "sheet" : sheet ? "center" : "anchor";
    sheet = null;
    document.getElementById(link_id)?.showPopover();
  }

  let body = $state.raw<{ family: string; sources: FaceSource[] } | null>(null);
  let body_faces: FontFace[] = [];
  let font_request = 0;
  const font_key = $derived(JSON.stringify(editor.page.font ?? null));

  function drop_faces() {
    for (const face of body_faces) document.fonts.delete(face);
    body_faces = [];
  }

  // Each window registers its own family, so two documents in two fonts don't fight over one name.
  $effect(() => {
    const choice = JSON.parse(font_key) as FontChoice | null;
    const request = ++font_request;
    if (!choice || choice.kind === "default") {
      drop_faces();
      body = null;
      return;
    }
    void (async () => {
      try {
        const sources = await font_sources(choice);
        const family = `warren-${window_id}-${request}`;
        const faces = await load_faces(family, sources);
        if (request !== font_request) return;
        drop_faces();
        for (const face of faces) document.fonts.add(face);
        body_faces = faces;
        body = { family, sources };
      } catch (reason) {
        if (request !== font_request) return;
        body = null;
        notifications.notify(app_id, {
          type: NotificationType.WARNING,
          title: `Couldn't load ${font_label(choice, "sans")}`,
          message: `${error_message(reason)}. Showing Inter instead.`,
        });
      }
    })();
  });

  // The built-in fonts the styles name, each registered once per window like the body font.
  let style_faces = $state.raw<Record<string, { family: string; sources: FaceSource[]; faces: FontFace[] }>>({});
  const style_font_key = $derived(style_fonts(editor.styles).join(","));

  $effect(() => {
    const wanted = style_font_key ? style_font_key.split(",") : [];
    const current = untrack(() => style_faces);
    let stale = false;
    void (async () => {
      const next: typeof style_faces = {};
      for (const id of wanted) {
        const loaded = current[id];
        if (loaded) {
          next[id] = loaded;
          continue;
        }
        try {
          const sources = await font_sources({ kind: "builtin", id });
          const family = `warren-${window_id}-${id}`;
          const faces = await load_faces(family, sources);
          if (stale) return;
          for (const face of faces) document.fonts.add(face);
          next[id] = { family, sources, faces };
        } catch (reason) {
          report_error(app_id, `Couldn't load a style's font`, reason);
        }
      }
      if (stale) return;
      for (const [id, loaded] of Object.entries(current)) if (!next[id]) for (const face of loaded.faces) document.fonts.delete(face);
      style_faces = next;
    })();
    return () => (stale = true);
  });

  const style_font_vars = $derived(
    Object.entries(style_faces)
      .map(([id, loaded]) => `;--wr-font-${id}:'${loaded.family}'`)
      .join("")
  );

  async function print_faces(): Promise<PrintFonts> {
    let css = Object.entries(style_faces)
      .map(([id, loaded]) => face_css(style_family(id), loaded.sources))
      .join("");
    const choice = editor.page.font;
    if (!choice || choice.kind === "default") return { css, body: false };
    try {
      css += face_css(BODY_FAMILY, body ? body.sources : await font_sources(choice));
      return { css, body: true };
    } catch {
      return { css, body: false };
    }
  }

  $effect(() => win.set_title(file_name));
  $effect(() => win.set_dirty(editor.dirty, { save }));
  $effect(() =>
    win.on_back(() => {
      if (editor.slash) editor.close_slash();
      else if (history_open) history_open = false;
      else if (sheet) sheet = null;
      else if (help) help = null;
      else if (finding) {
        finding = false;
        editor.focus();
      } else if (focus_mode) focus_mode = false;
      else return false;
      return true;
    })
  );

  async function discard_ok(): Promise<boolean> {
    return !editor.dirty || confirm_discard(win, file_name);
  }

  let open_request = 0;

  async function load(path: string) {
    const id = ++open_request;
    loading = true;
    try {
      if (file_extension(path) === ".docx") {
        await import_docx(path, id);
        return;
      }
      if (is_markdown(path)) {
        await import_markdown(path, id);
        return;
      }
      const file = await read_file(path);
      const opened = parse_document(await file.text());
      if (id !== open_request) return;
      editor.load(opened);
      file_path = path;
      draft = null;
      const text = serialize_document(editor.snapshot());
      history_base = { text, at: file.lastModified, words: counts.words };
      last_snapshot = { text, edits: editor.edits, at: Date.now() };
    } catch (reason) {
      if (id === open_request) report_error(app_id, `Couldn't open ${base_name(path)}`, reason);
    } finally {
      if (id === open_request) loading = false;
    }
  }

  // A Word file opens as a new, untitled document named after it; Save then asks where the .warren goes.
  async function import_docx(path: string, id: number) {
    const file = await read_file(path);
    const { docx_to_html } = await import("./docx-import");
    const imported = await docx_to_html(await file.arrayBuffer());
    if (id !== open_request) return;
    editor.load_html(imported.html);
    forget_history();
    file_path = null;
    draft = { name: document_file_name(base_name(path)), folder: is_system_path(path) ? "/home/Documents" : parent_path(path) };
    if (imported.left_out.length) {
      notifications.notify(app_id, {
        type: NotificationType.WARNING,
        title: `Some of ${base_name(path)} didn't come across`,
        message: `Left out: ${imported.left_out.join(", ")}.`,
      });
    }
  }

  // Like a Word file: a new, untitled document named after it.
  async function import_markdown(path: string, id: number) {
    const text = await (await read_file(path)).text();
    if (id !== open_request) return;
    const left = editor.load_markdown(text);
    forget_history();
    file_path = null;
    draft = { name: document_file_name(base_name(path)), folder: is_system_path(path) ? "/home/Documents" : parent_path(path) };
    if (left) {
      notifications.notify(app_id, {
        type: NotificationType.WARNING,
        title: left === 1 ? `A picture in ${base_name(path)} isn't inside the file` : `${left} pictures in ${base_name(path)} aren't inside the file`,
        message: "Warren doesn't fetch pictures from the web or other files; a web address became a link.",
      });
    }
  }

  async function open() {
    if (!(await discard_ok())) return;
    const chosen = await win.pick_file({ accept: [EXTENSION, ".docx", DOCX_TYPE, ...MARKDOWN_EXTENSIONS, MARKDOWN_TYPE], start_path: file_path ? parent_path(file_path) : undefined, title: "Open in Warren" });
    if (chosen) await load(chosen);
  }

  async function create() {
    if (!(await discard_ok())) return;
    editor.reset();
    forget_history();
    file_path = null;
    draft = null;
    warned_large = false;
    editor.focus();
  }

  async function from_template() {
    if (!(await discard_ok())) return;
    const choice = await dialogs.show(WarrenTemplates, {}, { window: window_id });
    if (!choice) return;
    if (choice === "blank") return create();
    let document: WarrenDocument;
    try {
      document = await choice.load();
    } catch (reason) {
      report_error(app_id, `Couldn't open the ${choice.name} template`, reason);
      return;
    }
    open_request++;
    loading = false;
    editor.load(document);
    editor.renew_id();
    forget_history();
    file_path = null;
    draft = { name: document_file_name(choice.name), folder: "/home/Documents" };
    warned_large = false;
  }

  async function save_template() {
    const path = await win.pick_save({ name: file_name, accept: [EXTENSION], start_path: TEMPLATES_DIR, title: "Save as template" });
    if (!path) return;
    const target = with_extension(path, EXTENSION);
    try {
      await write_file(target, serialize_document({ ...editor.snapshot(), id: new_document_id() }));
      notifications.notify(app_id, { title: "Saved as a template", message: `${target}. File › New from template… starts from it.` });
    } catch (reason) {
      report_error(app_id, "Couldn't save the template", reason);
    }
  }

  async function picture_menu(event: MouseEvent | { x: number; y: number }) {
    sheet = null;
    const zone = editor.active;
    const choice = await dialogs.menu(
      [
        ...(mobile ? [{ id: "camera", label: "Take a photo", icon: CameraIcon }] : []),
        { id: "device", label: mobile ? "Choose a picture" : "From this device…", icon: DevicesIcon },
        { id: "files", label: "From files…", icon: FolderOpenIcon },
      ],
      { anchor: event instanceof MouseEvent ? anchor_of(event) : event }
    );
    if (!choice) return;
    let pictures: File[] = [];
    try {
      if (choice === "camera") pictures = await pick_device_files({ accept: ["image/*"], capture: "environment" });
      else if (choice === "device") pictures = await pick_device_files({ accept: ["image/*"], multiple: true });
      else {
        const paths = await win.pick_file({ accept: ["image/*"], multiple: true, title: "Insert pictures" });
        for (const path of paths) pictures.push(await read_file(path));
      }
    } catch (reason) {
      report_error(app_id, "Couldn't add the picture", reason);
      return;
    }
    if (pictures.length) await editor.insert_pictures(pictures, zone === Zone.BODY ? editor.lexical : editor.zones[zone]);
  }

  async function set_zone(zone: Margin, on: boolean) {
    if (!on && editor.has(zone) && !editor.zone_empty(zone)) {
      const label = zone === Zone.HEADER ? "header" : "footer";
      const ok = await win.confirm(`Remove the ${label}?`, { detail: `What's in it goes from every page.`, confirm_label: "Remove", danger: true });
      if (!ok) return;
    }
    editor.set_zone(zone, on);
    if (on) requestAnimationFrame(() => editor.focus(zone));
  }

  async function write(path: string): Promise<boolean> {
    editor.ensure_id();
    const snapshot = editor.snapshot();
    const content = serialize_document(snapshot);
    const changed = editor.dirty || (file_path === null && draft === null);
    try {
      await write_file(path, content);
      file_path = path;
      draft = null;
      editor.mark_saved();
      notifications.notify(app_id, { title: "Document saved", message: path });
      void record(content, snapshot);
      if (changed) report_saved(snapshot);
      return true;
    } catch (reason) {
      report_error(app_id, "Couldn't save the document", reason);
      return false;
    }
  }

  function report_saved(snapshot: WarrenDocument) {
    const words = count(document_text(snapshot.editor)).words;
    achievements.achieve("first-save");
    if (snapshot.goal && words >= snapshot.goal) achievements.achieve("goal");
    achievements.progress("words-10000", words);
  }

  async function save_as(): Promise<boolean> {
    const path = await win.pick_save({
      name: file_name,
      accept: [EXTENSION],
      start_path: folder,
      title: "Save document",
    });
    if (!path) return false;
    // A copy of a saved document starts a history of its own; the first save of a new one keeps the id it was made with.
    if (file_path) {
      editor.renew_id();
      forget_history();
    }
    return write(with_extension(path, EXTENSION));
  }

  // The version as opened, kept until the first save writes it into a history that's still empty.
  let history_base: { text: string; at: number; words: number } | null = null;
  let last_snapshot = { text: "", edits: 0, at: Date.now() };
  let history_open = $state(false);

  function forget_history() {
    history_base = null;
    last_snapshot = { text: "", edits: editor.edits, at: Date.now() };
  }

  async function record(content: string, snapshot: WarrenDocument) {
    const id = snapshot.id;
    if (!id || content === last_snapshot.text) return;
    last_snapshot = { text: content, edits: editor.edits, at: Date.now() };
    try {
      const base = history_base;
      history_base = null;
      if (base && base.text !== content && !(await list_snapshots(id)).length) await write_snapshot(id, base.text, base.words, base.at);
      await write_snapshot(id, content, count(document_text(snapshot.editor)).words);
    } catch (reason) {
      notifications.notify(app_id, { type: NotificationType.WARNING, title: "Couldn't keep this version", message: error_message(reason) });
    }
  }

  $effect(() => {
    const timer = setInterval(() => {
      if (!file_path || read_only || !editor.doc_id || editor.edits === last_snapshot.edits || Date.now() - last_snapshot.at < HISTORY_INTERVAL) return;
      const snapshot = editor.snapshot();
      const content = serialize_document(snapshot);
      if (content === last_snapshot.text) last_snapshot = { ...last_snapshot, edits: editor.edits };
      else void record(content, snapshot);
    }, 30_000);
    return () => clearInterval(timer);
  });

  function open_history() {
    sheet = null;
    history_open = true;
  }

  async function restore(document: WarrenDocument, snapshot: Snapshot) {
    history_open = false;
    const before = editor.snapshot();
    if (file_path && !read_only) await record(serialize_document(before), before);
    editor.restore(document);
    notifications.notify(app_id, { title: `Restored the version from ${format_datetime(snapshot.at)}`, message: "Undo takes it back; the version before is in the history too." });
  }

  async function comment() {
    sheet = null;
    const quote = editor.selected.trim();
    const at = editor.capture_body_selection();
    if (!quote || !at) {
      notifications.notify(app_id, { type: NotificationType.WARNING, title: "Select the text to comment on first" });
      return;
    }
    const text = await win.prompt("Comment", { detail: `On “${quote.length > 80 ? `${quote.slice(0, 80)}…` : quote}”`, placeholder: "Your comment", confirm_label: "Comment" });
    if (!text?.trim()) return;
    if (!editor.add_comment(text.trim(), at, quote.slice(0, 500))) {
      notifications.notify(app_id, { type: NotificationType.WARNING, title: "Couldn't comment there", message: "The text it was on changed. Select it again." });
      return;
    }
    groups.value = { ...groups.value, comments: true };
  }

  async function edit_comment(item: Comment) {
    const text = await win.prompt("Edit comment", { initial: item.text, confirm_label: "Save" });
    if (text?.trim()) editor.set_comment(item.id, { text: text.trim() });
  }

  async function delete_comment(item: Comment) {
    const ok = await win.confirm("Delete this comment?", { detail: item.text, confirm_label: "Delete", danger: true });
    if (ok) editor.delete_comment(item.id);
  }

  function show_comment(id: string) {
    sheet = null;
    editor.show_comment(id, !mobile);
  }

  let help = $state.raw<{ mode: HelpMode; text: string; at: RangeSelection } | null>(null);

  async function help_menu(event: MouseEvent) {
    const text = editor.selected.trim();
    const at = editor.capture_body_selection();
    if (!text || !at) {
      notifications.notify(app_id, { type: NotificationType.WARNING, title: "Select the text first", message: "Writing help rewrites or summarises what's selected." });
      return;
    }
    if (text.length > HELP_MAX_CHARACTERS) {
      notifications.notify(app_id, { type: NotificationType.WARNING, title: "That's too much at once", message: `Select up to ${HELP_MAX_CHARACTERS.toLocaleString("en")} characters; the on-device model reads no more.` });
      return;
    }
    const choice = await dialogs.menu(
      HELP_MODES.map((item) => ({ id: item.mode, label: item.label })),
      { anchor: anchor_of(event) }
    );
    if (choice) help = { mode: choice as HelpMode, text, at };
  }

  function use_help(text: string, how: "replace" | "insert") {
    const request = help;
    help = null;
    if (!request) return;
    if (how === "replace") editor.replace_selection(request.at, text);
    else editor.insert_below(request.at, text);
    editor.focus();
  }

  $effect(() => {
    const on = spelling_on.value;
    untrack(() => (on ? void spell.start(dictionary.value) : spell.stop()));
  });

  const ignored_words = $derived(new Set([...editor.ignored_words, ...ignored_everywhere.value]));

  $effect(() => {
    if (spell.status !== SpellStatus.READY) return;
    const words = text;
    const ignored = ignored_words;
    const timer = setTimeout(() => spell.update(words, ignored), 400);
    return () => clearTimeout(timer);
  });

  function spell_replace(word: string, replacement: string) {
    const changes = editor.replace_word_everywhere(word, replacement);
    if (!changes) changed(0, word);
  }

  async function spell_add(word: string) {
    dictionary.value = [...new Set([...dictionary.value, check_form(word)])];
    try {
      await spell.add(word);
    } catch (reason) {
      report_error(app_id, "Couldn't add the word", reason);
    }
  }

  function save(): Promise<boolean> {
    return file_path && !read_only ? write(file_path) : save_as();
  }

  async function export_docx() {
    const path = await win.pick_save({
      name: `${stem}.docx`,
      accept: [".docx", DOCX_TYPE],
      start_path: folder,
      title: "Export for Word",
    });
    if (!path) return;
    const target = with_extension(path, ".docx");
    try {
      const snapshot = editor.snapshot();
      await write_file(target, await build_docx(snapshot, stem));
      const font = snapshot.page.font;
      if (font && font.kind !== "default") {
        notifications.notify(app_id, {
          type: NotificationType.WARNING,
          title: "Exported for Word",
          message: `${target}. Word shows ${font_name(font)} only where it's installed; elsewhere it picks a similar font.`,
        });
      } else {
        notifications.notify(app_id, { title: "Exported for Word", message: target });
      }
    } catch (reason) {
      report_error(app_id, "Couldn't export the document", reason);
    }
  }

  async function export_pdf() {
    try {
      await print_html(await printable(editor.snapshot(), stem, inter_url, await print_faces()), { title: stem });
    } catch (reason) {
      report_error(app_id, "Couldn't print the document", reason);
    }
  }

  async function export_markdown() {
    const path = await win.pick_save({ name: `${stem}.md`, accept: [...MARKDOWN_EXTENSIONS, MARKDOWN_TYPE], start_path: folder, title: "Export as Markdown" });
    if (!path) return;
    const target = is_markdown(path) ? path : `${path}.md`;
    try {
      await write_file(target, to_markdown(editor.snapshot().editor));
      notifications.notify(app_id, { title: "Exported as Markdown", message: target });
    } catch (reason) {
      report_error(app_id, "Couldn't export the document", reason);
    }
  }

  function export_as(format: "docx" | "md" | "pdf") {
    sheet = null;
    void (format === "docx" ? export_docx() : format === "md" ? export_markdown() : export_pdf());
  }

  function changed(changes: number, word: string) {
    notifications.notify(app_id, {
      type: changes ? NotificationType.INFO : NotificationType.WARNING,
      title: changes ? `Changed ${changes} ${changes === 1 ? "place" : "places"}` : `No “${word}” to change`,
      message: changes ? "Undo brings them all back." : "Only whole words are changed.",
    });
  }

  function anchor_of(event: MouseEvent) {
    const target = event.currentTarget;
    if (!(target instanceof Element)) return { x: event.clientX, y: event.clientY };
    const box = target.getBoundingClientRect();
    return { x: box.left, y: box.bottom + 4 };
  }

  async function file_menu(event: MouseEvent) {
    const choice = await dialogs.menu(
      [
        { id: "new", label: "New document", icon: FilePlusIcon },
        { id: "template", label: "New from template…", icon: StackIcon },
        { id: "open", label: "Open…", icon: FolderOpenIcon, shortcut: "Mod+O" },
        { id: "save", label: "Save", icon: FloppyDiskIcon, shortcut: "Mod+S" },
        { id: "save-as", label: "Save as…", icon: FloppyDiskBackIcon, shortcut: "Mod+Shift+S" },
        { id: "save-template", label: "Save as template…", icon: StackPlusIcon },
        { id: "history", label: "Version history…", icon: ClockCounterClockwiseIcon },
        { separator: true },
        { id: "docx", label: "Export for Word…", icon: FileDocIcon },
        { id: "md", label: "Export as Markdown…", icon: FileMdIcon },
        { id: "pdf", label: "Print or save as PDF…", icon: FilePdfIcon, shortcut: "Mod+P" },
      ],
      { anchor: anchor_of(event) }
    );
    if (choice === "new") void create();
    else if (choice === "template") void from_template();
    else if (choice === "save-template") void save_template();
    else if (choice === "history") open_history();
    else if (choice === "open") void open();
    else if (choice === "save") void save();
    else if (choice === "save-as") void save_as();
    else if (choice === "docx" || choice === "md" || choice === "pdf") export_as(choice);
  }

  function mount_editor(element: HTMLElement) {
    root = element;
    return editor.mount(element);
  }

  const mount_zone = (zone: Margin) => (element: HTMLElement) => editor.mount(element, zone);

  $effect(() => {
    const element = root;
    const zones = head && foot ? { head, foot } : null;
    if (!element || !zones) return;
    const ratio = sheets ? page.height / page.width : null;
    let frame = 0;
    const refill = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => fill_sheets(element, ratio, zones));
    };
    refill();
    const stops = [editor.lexical, editor.zones.header, editor.zones.footer].map((lexical) => lexical.registerUpdateListener(refill));
    const observer = new ResizeObserver(refill);
    observer.observe(element.parentElement!);
    observer.observe(zones.head);
    observer.observe(zones.foot);
    return () => {
      cancelAnimationFrame(frame);
      for (const stop of stops) stop();
      observer.disconnect();
      fill_sheets(element, null);
    };
  });

  onMount(() => {
    const path = untrack(() => initial_path);
    if (path) void load(path);
    return () => {
      font_request++;
      drop_faces();
      for (const loaded of Object.values(style_faces)) for (const face of loaded.faces) document.fonts.delete(face);
      spell.stop();
      editor.destroy();
    };
  });

  $effect(() => {
    const scoped = (id: string, keys: string, label: string, run: () => void) =>
      shortcuts.register({ id: `warren.${id}`, keys, label, category: ShortcutCategory.APP, window: window_id, run });
    const disposers = [
      scoped("open", "mod+o", "Open…", open),
      scoped("save", "mod+s", "Save", save),
      scoped("save-as", "mod+shift+s", "Save as…", save_as),
      scoped("print", "mod+p", "Print or save as PDF", export_pdf),
      scoped("find", "mod+f", "Find and replace", open_find),
      scoped("strike", "mod+shift+x", "Strikethrough", () => editor.toggle_strike()),
      scoped("subscript", "mod+shift+,", "Subscript", () => editor.toggle_subscript()),
      scoped("superscript", "mod+shift+.", "Superscript", () => editor.toggle_superscript()),
      scoped("clear-formatting", "mod+\\", "Clear formatting", () => editor.clear_formatting()),
      scoped("focus-mode", "mod+shift+f", "Focus mode", () => (focus_mode = !focus_mode)),
      scoped("marks", "mod+shift+8", "Show ¶ marks", () => (marks.value = !marks.value)),
    ];
    return () => disposers.forEach((dispose) => dispose());
  });

  const keep_focus = (event: PointerEvent) => event.preventDefault();
  const TOUCH = "shrink-0 pointer-coarse:size-11";

  let resize_handle = $state<HTMLElement | null>(null);

  function attach_resize(paper: HTMLElement) {
    if (mobile || !resize_handle) return;
    return attach_column_resize(paper, resize_handle, () => [editor.lexical, editor.zones.header, editor.zones.footer]);
  }

  // The cell menu on a right-click; on the phone the format bar's Table button opens the same tools in a sheet.
  async function table_menu(event: MouseEvent) {
    if (mobile || !(event.target instanceof Element) || !event.target.closest("td, th")) return;
    event.preventDefault();
    await new Promise(requestAnimationFrame);
    const table = editor.table;
    if (!table) return;
    const choice = await dialogs.menu(
      [
        { id: TableAction.ROW_ABOVE, label: "Insert row above" },
        { id: TableAction.ROW_BELOW, label: "Insert row below" },
        { id: TableAction.COLUMN_LEFT, label: "Insert column left" },
        { id: TableAction.COLUMN_RIGHT, label: "Insert column right" },
        { separator: true },
        { id: TableAction.MERGE, label: "Merge cells", disabled: !table.can_merge },
        { id: TableAction.SPLIT, label: "Split cell", disabled: !table.can_split },
        { id: "header", label: table.header ? "Header row off" : "Header row on" },
        { id: "borders", label: table.borders ? "Hide borders" : "Show borders" },
        { separator: true },
        { id: TableAction.DELETE_ROW, label: "Delete row", danger: true },
        { id: TableAction.DELETE_COLUMN, label: "Delete column", danger: true },
        { id: TableAction.DELETE_TABLE, label: "Delete table", danger: true },
      ],
      { anchor: { x: event.clientX, y: event.clientY } }
    );
    if (choice === "header") editor.set_table_header(!table.header);
    else if (choice === "borders") editor.set_table_borders(!table.borders);
    else if (choice) editor.table_action(choice as TableAction);
    editor.focus();
  }

  const BLOCK_COMMANDS: Partial<Record<SlashCommand, BlockStyle>> = {
    [SlashCommand.TEXT]: BlockStyle.PARAGRAPH,
    [SlashCommand.TITLE]: BlockStyle.TITLE,
    [SlashCommand.H1]: BlockStyle.H1,
    [SlashCommand.H2]: BlockStyle.H2,
    [SlashCommand.H3]: BlockStyle.H3,
    [SlashCommand.BULLETS]: BlockStyle.BULLET,
    [SlashCommand.NUMBERS]: BlockStyle.NUMBER,
    [SlashCommand.CHECKLIST]: BlockStyle.CHECK,
    [SlashCommand.QUOTE]: BlockStyle.QUOTE,
  };

  let app_root = $state<HTMLElement | null>(null);
  let desk = $state<HTMLElement | null>(null);
  let slash_box = $state<{ left: number; top: number; height: number } | null>(null);
  const slash_anchor = `--warren-slash-${uid}`;

  function run_slash(command: SlashCommand) {
    const style = BLOCK_COMMANDS[command];
    if (style) {
      // A list command on a list of its own kind would take the list off.
      if (editor.block !== style) editor.set_block(style);
      return;
    }
    if (command === SlashCommand.RULE) editor.insert_rule();
    else if (command === SlashCommand.PAGE_BREAK) editor.insert_page_break();
    else if (command === SlashCommand.TABLE) sheet = "table";
    else if (command === SlashCommand.TEMPLATE) void from_template();
    else if (command === SlashCommand.PICTURE) {
      const origin = app_root?.getBoundingClientRect();
      void picture_menu(slash_box && origin ? { x: origin.left + slash_box.left, y: origin.top + slash_box.top + slash_box.height + 4 } : { x: 0, y: 0 });
    }
  }

  // Anchored to the "/" itself, so the menu stays put while the word after it is typed.
  $effect(() => {
    const open = editor.slash;
    const scroller = desk;
    if (!open || !app_root || !scroller) {
      slash_box = null;
      return;
    }
    const zone = open.zone === Zone.BODY ? editor.lexical : editor.zones[open.zone];
    const place = () => {
      const text = zone.getElementByKey(open.at.key)?.firstChild;
      if (!(text instanceof Text) || text.length <= open.at.offset || !app_root) return;
      const range = document.createRange();
      range.setStart(text, open.at.offset);
      range.setEnd(text, open.at.offset + 1);
      const box = range.getBoundingClientRect();
      const origin = app_root.getBoundingClientRect();
      slash_box = { left: box.left - origin.left, top: box.top - origin.top, height: box.height };
    };
    place();
    scroller.addEventListener("scroll", place, { passive: true });
    return () => scroller.removeEventListener("scroll", place);
  });

  let slash_sheet = $state<HTMLElement | null>(null);

  // On the phone the menu is a sheet over the bottom of the window: the line being typed is scrolled up above it, with
  // room added under the page so the last line can get there too.
  $effect(() => {
    const box = slash_sheet;
    const scroller = desk;
    if (!box || !scroller || !app_root) return;
    const frame = requestAnimationFrame(() => {
      const line = untrack(() => slash_box);
      if (!line || !app_root) return;
      const origin = app_root.getBoundingClientRect();
      const bottom = origin.top + line.top + line.height;
      // From layout, not the sheet's box: it's still sliding in.
      const top = origin.bottom - box.offsetHeight - 12;
      if (bottom <= top) return;
      scroller.style.paddingBottom = `${box.offsetHeight + 24}px`;
      scroller.scrollBy({ top: bottom - top, behavior: motion_reduced() ? "instant" : "smooth" });
    });
    return () => {
      cancelAnimationFrame(frame);
      scroller.style.removeProperty("padding-bottom");
    };
  });

  let focus_mode = $state(false);

  // Every block but the caret's is dimmed, and the caret's line is kept in the middle of the desk.
  $effect(() => {
    const element = root;
    const scroller = desk;
    if (!focus_mode || !element || !scroller) return;
    let current: HTMLElement | null = null;
    let frame = 0;
    const centre = () => {
      const selection = window.getSelection();
      if (!selection?.rangeCount || !element.contains(selection.anchorNode)) return;
      let box = selection.getRangeAt(0).getBoundingClientRect();
      if (!box.height && current) box = current.getBoundingClientRect();
      if (!box.height) return;
      const view = scroller.getBoundingClientRect();
      const delta = box.top + box.height / 2 - (view.top + view.height / 2);
      if (Math.abs(delta) > 4) scroller.scrollBy({ top: delta, behavior: motion_reduced() ? "instant" : "smooth" });
    };
    const follow = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const key = editor.current_block();
        const next = key ? editor.lexical.getElementByKey(key) : null;
        if (next !== current) current?.classList.remove("wr-current");
        next?.classList.add("wr-current");
        current = next;
        centre();
      });
    };
    const half = () => scroller.style.setProperty("--half", `${scroller.clientHeight / 2}px`);
    half();
    follow();
    const stop = editor.lexical.registerUpdateListener(follow);
    const observer = new ResizeObserver(() => (half(), follow()));
    observer.observe(scroller);
    return () => {
      stop();
      observer.disconnect();
      cancelAnimationFrame(frame);
      current?.classList.remove("wr-current");
      scroller.style.removeProperty("--half");
    };
  });

  let marks_layer = $state<HTMLElement | null>(null);

  $effect(() => {
    const layer = marks_layer;
    const paper = layer?.parentElement;
    if (!layer || !paper) return;
    let frame = 0;
    const redraw = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => draw_marks([...paper.querySelectorAll<HTMLElement>(".warren-doc, .zone-doc")], layer));
    };
    redraw();
    const stops = [editor.lexical, editor.zones.header, editor.zones.footer].map((lexical) => lexical.registerUpdateListener(redraw));
    const observer = new ResizeObserver(redraw);
    observer.observe(paper);
    document.fonts.addEventListener("loadingdone", redraw);
    return () => {
      cancelAnimationFrame(frame);
      for (const stop of stops) stop();
      observer.disconnect();
      document.fonts.removeEventListener("loadingdone", redraw);
      layer.replaceChildren();
    };
  });

  // On a phone the jump closes the More sheet and keeps the keyboard down.
  function go_to(key: string) {
    sheet = null;
    editor.go_to(key, !mobile);
  }
</script>

{#snippet tools()}
  <WarrenTools
    {editor}
    {text}
    {counts}
    {repeats}
    {selection}
    open={groups.value}
    ontoggle={(id, value) => (groups.value = { ...groups.value, [id]: value })}
    onexport={export_as}
    onchanged={changed}
    onlink={open_link}
    {link_anchor}
    onfind={open_find}
    smart={smart.value}
    onsmart={(on) => (smart.value = on)}
    ongo={go_to}
    onpicture={picture_menu}
    onzone={set_zone}
    units={units.value}
    onunits={(value) => (units.value = value)}
    onword={(word) => editor.select_next(word, !mobile)}
  >
    {#snippet spelling()}
      <WarrenSpelling
        list={spell}
        on={spelling_on.value}
        onon={(on) => (spelling_on.value = on)}
        onjump={(word) => editor.select_next(word, !mobile)}
        onignore={(word) => editor.ignore_word(check_form(word))}
        onignoreall={(word) => (ignored_everywhere.value = clean_words([...ignored_everywhere.value, check_form(word)]) ?? [])}
        onadd={spell_add}
        onreplace={spell_replace}
      />
    {/snippet}
    {#snippet comments()}
      <WarrenComments {editor} oncomment={comment} onshow={show_comment} onedit={edit_comment} ondelete={delete_comment} />
    {/snippet}
  </WarrenTools>
{/snippet}

<svelte:element this={"style"}>{doc_css}</svelte:element>

<div
  bind:this={app_root}
  class={["warren relative grid h-full min-h-0 grid-cols-[minmax(0,1fr)] bg-background", focus_mode ? "focus grid-rows-[minmax(0,1fr)]" : "grid-rows-[auto_minmax(0,1fr)_auto]"]}
  onkeydown={(event) => {
    if (focus_mode && event.key === "Escape" && !event.defaultPrevented) {
      event.preventDefault();
      focus_mode = false;
    }
  }}
  role="presentation"
>
  {#if !focus_mode}
  <Toolbar class="flex-nowrap gap-1">
    <Button size="sm" variant="quiet" class="max-w-48 min-w-0 shrink gap-1 pr-1.5 pointer-coarse:h-11" title={file_path ?? "Not saved yet"} onclick={file_menu}>
      <span class="min-w-0 truncate">{mobile ? stem : "File"}</span>
      {#if mobile && editor.dirty}<span class="size-2 shrink-0 rounded-full bg-primary"></span>{/if}
      <CaretDownIcon weight="bold" class="size-3 shrink-0 opacity-65" />
    </Button>
    <IconButton label="Undo (Mod+Z)" size="sm" class={TOUCH} disabled={!editor.can_undo} onpointerdown={keep_focus} onclick={() => editor.undo()}><ArrowCounterClockwiseIcon weight="bold" /></IconButton>
    <IconButton label="Redo (Mod+Shift+Z)" size="sm" class={TOUCH} disabled={!editor.can_redo} onpointerdown={keep_focus} onclick={() => editor.redo()}><ArrowClockwiseIcon weight="bold" /></IconButton>
    <div class="flex-1"></div>
    {#if !mobile}
      <IconButton label="Comment on the selection" size="sm" class={TOUCH} disabled={!editor.selected.trim()} onpointerdown={keep_focus} onclick={comment}><ChatTeardropTextIcon weight="bold" /></IconButton>
    {/if}
    {#if ai_on}
      <IconButton label="Writing help: rewrite or summarise the selection" size="sm" class={TOUCH} disabled={!editor.selected.trim()} pressed={!!help} onpointerdown={keep_focus} onclick={help_menu}>
        <SparkleIcon weight="bold" />
      </IconButton>
    {/if}
    <IconButton label="Show ¶ marks (Mod+Shift+8)" size="sm" class={TOUCH} pressed={marks.value} onpointerdown={keep_focus} onclick={() => (marks.value = !marks.value)}><ParagraphIcon weight="bold" /></IconButton>
    <IconButton label="Focus mode (Mod+Shift+F)" size="sm" class={TOUCH} onpointerdown={keep_focus} onclick={() => (focus_mode = true)}><CornersOutIcon weight="bold" /></IconButton>
  </Toolbar>
  {/if}

  <div class="body relative grid min-h-0">
    <aside class="sidebar min-h-0 overflow-y-auto border-r border-foreground/8 bg-background-light" aria-label="Tools">
      {@render tools()}
    </aside>

    <div class="flex min-h-0 min-w-0 flex-col">
      <div class="format-bar flex shrink-0 items-center gap-1 border-b border-foreground/8 bg-background-light px-2 py-1" role="toolbar" aria-label="Formatting">
        <IconButton label="Bold" size="sm" pressed={editor.bold} onpointerdown={keep_focus} onclick={() => editor.toggle_bold()}><TextBIcon weight="bold" /></IconButton>
        <IconButton label="Italic" size="sm" pressed={editor.italic} onpointerdown={keep_focus} onclick={() => editor.toggle_italic()}><TextItalicIcon weight="bold" /></IconButton>
        <IconButton label="Underline" size="sm" pressed={editor.underline} onpointerdown={keep_focus} onclick={() => editor.toggle_underline()}><TextUnderlineIcon weight="bold" /></IconButton>
        <Select
          size="sm"
          class="w-32 min-w-0"
          aria-label="Paragraph style"
          value={LIST_STYLES.includes(editor.block) ? BlockStyle.PARAGRAPH : editor.block}
          options={STYLE_OPTIONS}
          onchange={(event) => {
            editor.set_block(event.currentTarget.value as BlockStyle);
            editor.focus();
          }}
        />
        <IconButton label="Bullets" size="sm" pressed={editor.block === BlockStyle.BULLET} onpointerdown={keep_focus} onclick={() => editor.set_block(BlockStyle.BULLET)}><ListBulletsIcon weight="bold" /></IconButton>
        <IconButton label="Numbers" size="sm" pressed={editor.block === BlockStyle.NUMBER} onpointerdown={keep_focus} onclick={() => editor.set_block(BlockStyle.NUMBER)}><ListNumbersIcon weight="bold" /></IconButton>
        {#if editor.table}
          <IconButton label="Table" size="sm" pressed onpointerdown={keep_focus} onclick={() => (sheet = "table")}><TableIcon weight="bold" /></IconButton>
        {:else}
          <IconButton label="Insert picture" size="sm" disabled={editor.adding > 0} onpointerdown={keep_focus} onclick={picture_menu}><ImageIcon weight="bold" /></IconButton>
        {/if}
        <div class="flex-1"></div>
        <IconButton label="More tools" size="sm" onclick={() => (sheet = "more")}><DotsThreeIcon weight="bold" /></IconButton>
      </div>

      {#if finding}
        <WarrenFind {editor} input_id={find_input_id} onclose={() => (finding = false)} onreplaced={changed} />
      {/if}
      {#if help}
        {#key help}
          <WarrenHelp
            mode={help.mode}
            text={help.text}
            onreplace={(text) => use_help(text, "replace")}
            oninsert={(text) => use_help(text, "insert")}
            onclose={() => {
              help = null;
              editor.focus();
            }}
          />
        {/key}
      {/if}

      <div class="desk min-h-0 flex-1 overflow-auto bg-background-darker" data-flow={editor.page.flow} bind:this={desk}>
        <div
          class="paper text-foreground"
          style="{PAPER_VARS};--pw:{page.width};--ph:{page.height};--mt:{page.margins.top};--mr:{page.margins.right};--mb:{page.margins.bottom};--ml:{page.margins.left};--hd:{zone_distance(
            page.margins.top
          )};--fd:{zone_distance(page.margins.bottom)};--zg:{ZONE_GAP_MM}{body ? `;--doc-font:'${body.family}'` : ''}{style_font_vars}"
          onclick={(event) => event.target === event.currentTarget && editor.focus(Zone.BODY)}
          oncontextmenu={table_menu}
          onfocusout={() => editor.close_slash()}
          role="presentation"
          {@attach attach_resize}
        >
          {#if marks.value}<div class="marks" bind:this={marks_layer} aria-hidden="true"></div>{/if}
          <div class="col-resize" bind:this={resize_handle} hidden aria-hidden="true"></div>
          <div class={["zone head", !has_header && "spacer"]} bind:this={head} onclick={(event) => has_header && event.target === event.currentTarget && editor.focus(Zone.HEADER)} role="presentation">
            {#if has_header}
              <div class="zone-doc" contenteditable="true" spellcheck="true" role="textbox" aria-multiline="true" aria-label="Header" tabindex="0" {@attach mount_zone(Zone.HEADER)}></div>
            {/if}
          </div>
          <div
            class="warren-doc"
            contenteditable="true"
            spellcheck="true"
            role="textbox"
            aria-multiline="true"
            aria-label="Document"
            tabindex="0"
            {@attach mount_editor}
          ></div>
          <div class={["zone foot", !has_footer && "spacer"]} bind:this={foot} onclick={(event) => has_footer && event.target === event.currentTarget && editor.focus(Zone.FOOTER)} role="presentation">
            {#if has_footer}
              <div class="zone-doc" contenteditable="true" spellcheck="true" role="textbox" aria-multiline="true" aria-label="Footer" tabindex="0" {@attach mount_zone(Zone.FOOTER)}></div>
            {/if}
          </div>
        </div>
      </div>
    </div>

    {#if loading}
      <div class="absolute inset-0 grid place-items-center bg-background-darker/70"><Spinner label="Opening document" /></div>
    {/if}
    {#if focus_mode}
      <IconButton
        label="Leave focus mode (Esc)"
        size="sm"
        class="absolute top-2 right-4 z-10 bg-background-light/80 opacity-65 hover:opacity-100 pointer-coarse:size-11 pointer-coarse:opacity-100"
        onpointerdown={keep_focus}
        onclick={() => (focus_mode = false)}
      >
        <CornersInIcon weight="bold" />
      </IconButton>
    {/if}
    {#if history_open && !mobile}
      <WarrenHistory doc_id={editor.doc_id} current={() => editor.snapshot()} sheet={false} families={EDITOR_FAMILIES} paper={PAPER_VARS} onrestore={restore} onclose={() => (history_open = false)} />
    {/if}
  </div>

  {#if !focus_mode}
  <StatusBar>
    <span>{selection ? `${selection.words.toLocaleString("en")} of ` : ""}{counts.words.toLocaleString("en")} {counts.words === 1 && !selection ? "word" : "words"}</span>
    {#if goal_progress !== null && editor.goal}
      <span class="flex shrink-0 items-center gap-1.5" title="Word goal: {editor.goal.toLocaleString('en')}">
        <span
          class="relative h-1.5 w-12 overflow-hidden rounded-full bg-foreground/12"
          role="progressbar"
          aria-label="Word goal"
          aria-valuemin={0}
          aria-valuemax={editor.goal}
          aria-valuenow={Math.min(counts.words, editor.goal)}
        >
          <span class="absolute inset-y-0 left-0 rounded-full {goal_progress >= 1 ? 'bg-success' : 'bg-primary'}" style="width: {goal_progress * 100}%"></span>
        </span>
        <span>{Math.round(goal_progress * 100)}%</span>
      </span>
    {/if}
    {#if counts.words}<span class="hidden @md:inline">{reading_minutes(counts.words)} min read</span>{/if}
    <span class="hidden @sm:inline">
      {selection ? `${selection.characters.toLocaleString("en")} of ` : ""}{counts.characters.toLocaleString("en")} {counts.characters === 1 && !selection ? "character" : "characters"}
    </span>
    {#if editor.active !== Zone.BODY}<span class="text-primary">Editing the {editor.active}</span>{/if}
    <span class="hidden @lg:inline">{editor.page.size}{editor.page.orientation === "landscape" ? " landscape" : ""}</span>
  </StatusBar>
  {/if}

  {#if sheet}
    <div class="absolute inset-0 z-20 flex flex-col justify-end">
      <button type="button" tabindex="-1" aria-label="Close" class="absolute inset-0 bg-(--overlay)" onclick={() => (sheet = null)}></button>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={sheet === "table" ? "Table" : "Tools"}
        tabindex="-1"
        class="relative mx-auto flex max-h-[85%] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-background-light shadow-raised ring-1 ring-foreground/10 outline-none motion-safe:animate-sheet-in"
        {@attach (element) => element.focus({ preventScroll: true })}
        {@attach swipe_dismiss({ on_dismiss: () => (sheet = null) })}
        onkeydown={(event) => {
          if (event.key !== "Escape") return;
          event.stopPropagation();
          sheet = null;
        }}
      >
        <Grabber class="mt-2 mb-1" />
        <div class="min-h-0 flex-1 overflow-y-auto">
          {#if sheet === "table"}
            <div class="flex flex-col gap-2 px-3 pt-1 pb-3">
              <h2 class="text-2xs font-semibold tracking-wide text-foreground/65 uppercase">Table</h2>
              <WarrenTable {editor} ondone={() => (sheet = null)} />
            </div>
          {:else}
            {@render tools()}
          {/if}
        </div>
        <div class="flex justify-end border-t border-foreground/8 p-2">
          <Button variant="primary" onclick={() => (sheet = null)}>Done</Button>
        </div>
      </div>
    </div>
  {/if}
  {#if history_open && mobile}
    <WarrenHistory doc_id={editor.doc_id} current={() => editor.snapshot()} sheet families={EDITOR_FAMILIES} paper={PAPER_VARS} onrestore={restore} onclose={() => (history_open = false)} />
  {/if}
  <WarrenLink id={link_id} anchor={link_anchor} {editor} placement={link_placement} />
  {#if slash_box}
    <div class="pointer-events-none absolute w-px" style="left: {slash_box.left}px; top: {slash_box.top}px; height: {slash_box.height}px; anchor-name: {slash_anchor}"></div>
  {/if}
  <WarrenSlash {editor} sheet={mobile} anchor={slash_anchor} bind:sheet_box={slash_sheet} />
</div>

<style>
  .body {
    grid-template-columns: minmax(0, 1fr);
  }

  .sidebar {
    display: none;
  }

  @container (width >= 44rem) {
    .body {
      grid-template-columns: 15rem minmax(0, 1fr);
    }

    .sidebar {
      display: block;
    }

    .format-bar {
      display: none;
    }
  }

  .focus .body {
    grid-template-columns: minmax(0, 1fr);
  }

  .focus .sidebar,
  .focus .format-bar {
    display: none;
  }

  /* Room above the first line and below the last, so either can sit in the middle. Margins, not the desk's padding:
     padding would count towards the desk's own minimum height and push it past the window. */
  .focus .paper {
    margin-block: var(--half, 40vh);
  }

  .focus .warren-doc > :global(:not(ul, ol, table, .wr-current)),
  .focus .warren-doc :global(li:not(.nested, .wr-current)),
  .focus .warren-doc :global(:is(td, th) > :not(.wr-current)),
  .focus .paper :global(.zone) {
    opacity: 0.3;
    transition: opacity 150ms var(--ease-out);
  }

  .marks {
    position: absolute;
    inset: 0;
    z-index: 1;
    pointer-events: none;
    overflow: hidden;
  }

  .marks :global(.wr-mark) {
    position: absolute;
    color: color-mix(in oklch, var(--primary) 70%, transparent);
    font-family: Inter, sans-serif;
    font-style: normal;
    font-weight: 400;
    user-select: none;
  }

  @media print {
    .marks {
      display: none;
    }
  }

  .desk {
    --desk: var(--background-darker);
    container-type: inline-size;
    padding: 1.5rem 0.75rem 3rem;
  }

  /* Margins scale with the paper (cqi inside it is the paper's width), so a narrow window shows the same page smaller. */
  .paper {
    --link: var(--primary);
    --pl: calc(var(--ml) / var(--pw) * 100cqi);
    --pr: calc(var(--mr) / var(--pw) * 100cqi);
    --pt: calc(var(--mt) / var(--pw) * 100cqi);
    --pb: calc(var(--mb) / var(--pw) * 100cqi);
    --phd: calc(var(--hd) / var(--pw) * 100cqi);
    --pfd: calc(var(--fd) / var(--pw) * 100cqi);
    --gap: calc(var(--zg) / var(--pw) * 100cqi);
    container: paper / inline-size;
    width: min(var(--pw) * 1mm, 100cqi - 1.5rem);
    margin: 0 auto;
    background: var(--background-lightest);
    box-shadow: 0 1px 3px color-mix(in oklch, var(--background-darkest) 30%, transparent);
    cursor: text;
    position: relative;
  }

  /* On a phone-sized desk the side margins give way to the text, as before page setup existed. */
  @container (width < 40rem) {
    .paper {
      --pl: min(calc(var(--ml) / var(--pw) * 100cqi), 7cqi);
      --pr: min(calc(var(--mr) / var(--pw) * 100cqi), 7cqi);
    }
  }

  .paper :global(.zone) {
    box-sizing: border-box;
    padding-inline: var(--pl) var(--pr);
  }

  .paper :global(.zone.head) {
    min-height: var(--pt);
    padding-top: var(--phd);
    padding-bottom: var(--gap);
  }

  .paper :global(.zone.foot) {
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    min-height: var(--pb);
    padding-top: var(--gap);
    padding-bottom: var(--pfd);
  }

  .paper :global(.zone.spacer) {
    padding-block: 0;
  }

  .paper :global(.zone-doc) {
    position: relative;
    min-height: 1lh;
    outline: none;
    caret-color: var(--primary);
  }

  .paper :global(.zone-doc > :last-child) {
    margin-bottom: 0;
  }

  .zone-doc {
    border-radius: 2px;
    box-shadow: 0 0 0 1px transparent;
  }

  .zone-doc:hover,
  .zone-doc:focus {
    box-shadow: 0 0 0 1px color-mix(in oklch, var(--primary) 45%, transparent);
  }

  .zone-doc:has(> :global(p:only-child > br:only-child))::before {
    content: attr(aria-label);
    position: absolute;
    color: color-mix(in oklch, var(--foreground) 40%, transparent);
    pointer-events: none;
  }

  .paper :global(.zone.copy) {
    cursor: default;
  }

  .desk[data-flow="continuous"] {
    padding-top: 0;
    padding-bottom: 0;
  }

  .desk[data-flow="continuous"] .paper {
    min-height: 100%;
    box-shadow: none;
  }

  .warren-doc {
    position: relative;
    min-height: 1lh;
    padding-inline: var(--pl) var(--pr);
    padding-bottom: var(--tail, 0px);
    outline: none;
    caret-color: var(--primary);
  }

  .warren-doc :global(.wr-underline) {
    text-decoration: underline;
  }

  .warren-doc :global(.wr-strike) {
    text-decoration: line-through;
  }

  .warren-doc :global(.wr-underline.wr-strike) {
    text-decoration: underline line-through;
  }

  .warren-doc :global(.page-break) {
    position: relative;
    margin-inline: calc(-1 * var(--pl)) calc(-1 * var(--pr));
    user-select: none;
  }

  .desk[data-flow="sheets"] .warren-doc :global(.page-break) {
    display: flow-root;
    padding-top: var(--fill, 0px);
  }

  .warren-doc :global(.page-break .desk-gap) {
    height: 1.5rem;
    background: var(--desk);
  }

  .desk[data-flow="continuous"] .warren-doc :global(.page-break) {
    height: 1.5rem;
    margin-inline: 0;
    background: linear-gradient(to bottom, transparent calc(50% - 0.5px), color-mix(in oklch, var(--foreground) 25%, transparent) 0 calc(50% + 0.5px), transparent 0);
  }

  .desk[data-flow="continuous"] .warren-doc :global(.page-break)::after {
    content: "Page break";
    position: absolute;
    inset: 50% auto auto 50%;
    translate: -50% -50%;
    padding-inline: 0.5rem;
    background: var(--background-lightest);
    font-size: 0.6875rem;
    color: color-mix(in oklch, var(--foreground) 65%, transparent);
  }

  .warren-doc :global(.page-break.selected),
  .warren-doc :global(.page-break:focus),
  .warren-doc :global(.wr-rule.selected) {
    outline: 2px solid var(--cottontail);
  }

  .paper :global(.wr-image) {
    margin: 0 0 6pt;
    line-height: 0;
    user-select: none;
  }

  .paper :global(.wr-image[data-align="center"]) {
    text-align: center;
  }

  .paper :global(.wr-image[data-align="right"]) {
    text-align: right;
  }

  .paper :global(.wr-image-frame) {
    position: relative;
    display: inline-block;
    max-width: 100%;
    cursor: default;
  }

  .paper :global(.wr-image img) {
    width: 100%;
    height: auto;
  }

  .paper :global(.wr-image.selected .wr-image-frame) {
    outline: 2px solid var(--cottontail);
  }

  .paper :global(.wr-image-handle) {
    position: absolute;
    right: -6px;
    bottom: -6px;
    display: none;
    width: 12px;
    height: 12px;
    border: 2px solid var(--background-lightest);
    border-radius: 2px;
    background: var(--cottontail);
    cursor: nwse-resize;
    touch-action: none;
  }

  .paper :global(.wr-image[data-align="right"] .wr-image-handle) {
    right: auto;
    left: -6px;
    cursor: nesw-resize;
  }

  @media (pointer: fine) {
    .paper :global(.wr-image.selected .wr-image-handle) {
      display: block;
    }
  }

  .warren-doc :global(.wr-rule) {
    cursor: default;
  }

  /* A borderless table is for layout; on screen its cells keep a faint guide so they can still be found. */
  .paper :global(table[data-borders="off"] :is(td, th)) {
    outline: 1px dashed color-mix(in oklch, var(--foreground) 16%, transparent);
    outline-offset: -1px;
  }

  .paper :global(.wr-cell-selected) {
    background: color-mix(in oklch, var(--primary) 20%, transparent);
  }

  .paper :global(.wr-table-selection) :global(::selection) {
    background: transparent;
  }

  .col-resize {
    position: absolute;
    z-index: 2;
    width: 9px;
    margin-left: -4.5px;
    cursor: col-resize;
    touch-action: none;
  }

  .col-resize::after {
    content: "";
    position: absolute;
    inset: 0 3.5px;
    background: var(--cottontail);
    opacity: 0.6;
  }

  .col-resize:global(.dragging)::after {
    opacity: 1;
  }

  .warren-doc::spelling-error,
  .warren-doc :global(*::spelling-error) {
    text-decoration: wavy underline var(--error);
    text-decoration-skip-ink: none;
  }

  .warren-doc::grammar-error,
  .warren-doc :global(*::grammar-error) {
    text-decoration: wavy underline var(--info);
    text-decoration-skip-ink: none;
  }

  .warren-doc :global(.wr-mark[data-comment="open"]) {
    background: color-mix(in oklch, var(--warning) 26%, transparent);
    box-shadow: inset 0 -2px color-mix(in oklch, var(--warning) 75%, transparent);
  }

  .warren-doc :global(.wr-mark[data-comment="open"][data-current]) {
    background: color-mix(in oklch, var(--warning) 45%, transparent);
  }

  .warren-doc :global(.wr-checked),
  .warren-doc :global(.wr-unchecked) {
    cursor: text;
  }

  .warren-doc :global(.wr-checked)::before,
  .warren-doc :global(.wr-unchecked)::before {
    cursor: pointer;
  }

  /* Lexical toggles a check when the tap lands within 32 px of the box, so a 44 px row makes a 44 px target. */
  @media (pointer: coarse) {
    .warren-doc :global(li.wr-checked:not(.nested)),
    .warren-doc :global(li.wr-unchecked:not(.nested)) {
      min-height: 2.75rem;
      padding-top: calc((2.75rem - 1lh) / 2);
    }

    .warren-doc :global(li.wr-checked:not(.nested))::before,
    .warren-doc :global(li.wr-unchecked:not(.nested))::before,
    .warren-doc :global(li.wr-checked:not(.nested))::after {
      translate: 0 calc((2.75rem - 1lh) / 2);
    }
  }
</style>
