import kernel, { type AppsService, type FilesService } from "$lib/core/api";
import { available_name } from "$lib/core/api/services/files/opfs";
import { resolve_path, base_name, parent_path } from "$lib/core/api/services/files/path";
import { assert_writable, file_value, is_file_value, type FileValue } from "$lib/core/api/services/files/shell";
import { ArgKind } from "$lib/core/api/services/shell/arg";
import {
  ShellError,
  type CommandContext,
  type Completion,
  type ShellService,
  type ShellSession,
  type Tagged,
} from "$lib/core/api/services/shell/type";
import { page_size_label, type PageSize } from "./geometry";
import { run_job, type JobReport, type JobUnit } from "./job";
import {
  images_pdf_name,
  is_image_name,
  is_pdf_name,
  merged_name,
  page_image_name,
  part_name,
  child_path,
} from "./naming";
import { initial_pages, normalize_rotation } from "./pages";
import { load_pdf, organize_pdf, PdfSplitter, PdfWriter } from "./pdf";
import { SIGNATURES_DIR, is_image, prepare_image, read_bytes, write_at, type SourceFile } from "./pdf-files";
import { flatten_groups, parse_ranges, split_groups } from "./ranges";
import { canvas_blob, open_document, render_page } from "./render";
import { Section } from "./sections";
import { error_message, format_bytes, parse_bytes } from "$lib/core/utils";
import { DEFAULT_PDF, parse_page, test_pdf_name, type Orientation, type TestPdfOptions } from "./test-pdf";
import { documents_folder, generate_test_pdf } from "./test-pdf-job";

const APP_ID = "pdf-tools";
const IMAGE_MARGIN = 36;

const files = () => kernel.service<FilesService>("files");
const apps = () => kernel.service<AppsService>("apps");

async function checked<T>(work: Promise<T>): Promise<T> {
  try {
    return await work;
  } catch (error) {
    throw error instanceof ShellError ? error : new ShellError(error_message(error));
  }
}

async function source(cwd: string, typed: string, kind: "pdf" | "image" = "pdf"): Promise<SourceFile> {
  const path = resolve_path(cwd, typed);
  const file = await files().get_file(path);
  if (!file) throw new ShellError(`${path}: no such file`);
  const found: SourceFile = { name: base_name(path), path, file };
  if (kind === "pdf" && !is_pdf_name(path) && file.type !== "application/pdf")
    throw new ShellError(`${path}: not a PDF`);
  if (kind === "image" && !is_image(found)) throw new ShellError(`${path}: not an image`);
  return found;
}

async function input_paths(given: string[], context: CommandContext<unknown>): Promise<string[]> {
  if (given.length > 0 || !context.piped) return given;
  const paths: string[] = [];
  for await (const value of context.input) {
    if (is_file_value(value)) paths.push(value.path);
    else if (typeof value === "string") paths.push(value);
  }
  return paths;
}

async function folder_at(path: string): Promise<FileSystemDirectoryHandle> {
  const directory = await files().get_directory(path);
  if (!directory) throw new ShellError(`${path}: no such folder`);
  return directory;
}

async function free_path(folder: string, name: string): Promise<string> {
  return child_path(folder, await available_name(await folder_at(folder), name));
}

async function output_path(
  session: ShellSession,
  out: string | undefined,
  folder: string,
  name: string,
  elevated: boolean
): Promise<string> {
  let path: string;
  if (out === undefined) path = await free_path(folder, name);
  else {
    const typed = resolve_path(session.cwd, out);
    if (await files().get_directory(typed)) path = await free_path(typed, name);
    else {
      await folder_at(parent_path(typed));
      path = is_pdf_name(typed) ? typed : `${typed}.pdf`;
    }
  }
  assert_writable(path, elevated);
  return path;
}

async function output_folder(
  session: ShellSession,
  dir: string | undefined,
  fallback: string,
  elevated: boolean
): Promise<string> {
  const folder = dir === undefined ? fallback : resolve_path(session.cwd, dir);
  await folder_at(folder);
  assert_writable(child_path(folder, "x"), elevated);
  return folder;
}

async function written(path: string): Promise<FileValue> {
  const file = await files().get_file(path);
  return file_value(path, "file", file?.size ?? null, file?.lastModified ?? null);
}

async function save_into(folder: string, name: string, data: Uint8Array | Blob): Promise<string> {
  const path = await free_path(folder, name);
  await write_at(path, data);
  return path;
}

const is_abort = (error: unknown) => error instanceof DOMException && error.name === "AbortError";

async function job(signal: AbortSignal, title: string, build: () => JobUnit[], report: () => JobReport): Promise<void> {
  let failure: unknown = null;
  const caught = (unit: JobUnit): JobUnit => ({
    ...unit,
    run: () =>
      unit.run().catch((error: unknown) => {
        failure = error;
        throw error;
      }),
  });
  const ok = await run_job(APP_ID, title, () => build().map(caught), report, signal);
  if (!ok) throw new ShellError(is_abort(failure) || signal.aborted ? "stopped" : error_message(failure));
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export async function merge(context: CommandContext<{ paths: string[]; out?: string }>): Promise<FileValue> {
  const { args, session, signal, elevated } = context;
  const typed = await input_paths(args.paths, context);
  if (typed.length < 2) throw new ShellError("merge needs at least two PDFs");
  const sources = await Promise.all(typed.map((path) => source(session.cwd, path)));
  const target = await output_path(
    session,
    args.out,
    parent_path(sources[0].path!),
    merged_name(sources.map((item) => item.name)),
    elevated
  );
  await job(
    signal,
    `Merging ${sources.length} PDFs`,
    () => {
      const writer = new PdfWriter();
      return [
        ...sources.map((item) => ({
          name: item.name,
          async run() {
            const added = await writer.append(await read_bytes(item), item.name);
            return `Added ${plural(added, "page")}`;
          },
        })),
        { name: "Write PDF", run: async () => write_at(target, await writer.finish()) },
      ];
    },
    () => ({
      title: "PDFs merged",
      message: target,
      actions: [{ label: "Open", on_click: () => void apps().open(target) }],
    })
  );
  return written(target);
}

export async function split({
  args,
  session,
  signal,
  elevated,
}: CommandContext<{ path: string; ranges?: string; every?: number; dir?: string }>): Promise<FileValue[]> {
  const pdf = await source(session.cwd, args.path);
  const bytes = await read_bytes(pdf);
  const count = (await checked(load_pdf(bytes, pdf.name))).getPageCount();
  const plan = split_groups(count, { ranges: args.ranges, every: args.every });
  if (!plan.ok) throw new ShellError(plan.error);
  const folder = await output_folder(session, args.dir, parent_path(pdf.path!), elevated);
  let paths: string[] = [];
  await job(
    signal,
    `Splitting ${pdf.name}`,
    () => {
      const splitter = new PdfSplitter(bytes, pdf.name);
      paths = [];
      return plan.groups.map((group) => ({
        name: part_name(pdf.name, group),
        status: group.length === 1 ? `page ${group[0]}` : `${group.length} pages`,
        async run() {
          paths.push(await save_into(folder, part_name(pdf.name, group), await splitter.part(group)));
        },
      }));
    },
    () => ({
      title: "PDF split",
      message: `${plural(paths.length, "file")} in ${folder}`,
      actions: [{ label: "Show", on_click: () => void apps().open(folder) }],
    })
  );
  return Promise.all(paths.map(written));
}

export async function rotate({
  args,
  session,
  elevated,
}: CommandContext<{ path: string; degrees: number; pages?: string; out?: string }>): Promise<FileValue> {
  if (args.degrees % 90 !== 0) throw new ShellError("degrees must be a multiple of 90");
  const pdf = await source(session.cwd, args.path);
  const bytes = await read_bytes(pdf);
  const count = (await checked(load_pdf(bytes, pdf.name))).getPageCount();
  let selected: Set<number> | null = null;
  if (args.pages !== undefined) {
    const parsed = parse_ranges(args.pages, count);
    if (!parsed.ok) throw new ShellError(parsed.error);
    selected = new Set(flatten_groups(parsed.groups));
  }
  const rotation = normalize_rotation(args.degrees);
  const pages = initial_pages(count).map((page, index) =>
    selected === null || selected.has(index + 1) ? { ...page, rotation } : page
  );
  const target = await output_path(session, args.out, parent_path(pdf.path!), pdf.name, elevated);
  await write_at(target, await checked(organize_pdf(bytes, pages, pdf.name)));
  return written(target);
}

export interface PageValue extends Tagged {
  $type: "pdf-page";
  page: number;
  size: string;
  rotation: number;
  path: string;
}

export async function* pages({ args, session }: CommandContext<{ path: string }>): AsyncGenerator<PageValue> {
  const pdf = await source(session.cwd, args.path);
  const document = await checked(load_pdf(await read_bytes(pdf), pdf.name));
  for (const [index, page] of document.getPages().entries()) {
    const { width, height } = page.getSize();
    yield {
      $type: "pdf-page",
      page: index + 1,
      size: page_size_label(width, height),
      rotation: normalize_rotation(page.getRotation().angle),
      path: pdf.path!,
    };
  }
}

export async function images(
  context: CommandContext<{ paths: string[]; out?: string; size: PageSize }>
): Promise<FileValue> {
  const { args, session, signal, elevated } = context;
  const typed = await input_paths(args.paths, context);
  if (typed.length === 0) throw new ShellError("images needs at least one image");
  const sources = await Promise.all(typed.map((path) => source(session.cwd, path, "image")));
  const target = await output_path(
    session,
    args.out,
    parent_path(sources[0].path!),
    images_pdf_name(sources.map((item) => item.name)),
    elevated
  );
  await job(
    signal,
    `Making a PDF of ${plural(sources.length, "image")}`,
    () => {
      const writer = new PdfWriter();
      return [
        ...sources.map((item) => ({
          name: item.name,
          async run() {
            const image = await prepare_image(item);
            await writer.append_image(image, args.size, IMAGE_MARGIN);
            return `${image.width}×${image.height} ${image.kind.toUpperCase()}`;
          },
        })),
        { name: "Write PDF", run: async () => write_at(target, await writer.finish()) },
      ];
    },
    () => ({
      title: "PDF created",
      message: target,
      actions: [{ label: "Open", on_click: () => void apps().open(target) }],
    })
  );
  return written(target);
}

export async function export_pages({
  args,
  session,
  signal,
  elevated,
}: CommandContext<{ path: string; format: "png" | "jpg"; scale: number; dir?: string }>): Promise<FileValue[]> {
  const pdf = await source(session.cwd, args.path);
  const document = await checked(open_document(await read_bytes(pdf), pdf.name));
  try {
    const folder = await output_folder(session, args.dir, parent_path(pdf.path!), elevated);
    const count = document.numPages;
    const type = args.format === "png" ? "image/png" : "image/jpeg";
    let paths: string[] = [];
    await job(
      signal,
      `Exporting ${plural(count, "page")}`,
      () => {
        paths = [];
        return Array.from({ length: count }, (_, index) => ({
          name: `Page ${index + 1}`,
          async run() {
            const canvas = await render_page(document, index, args.scale);
            const blob = await canvas_blob(canvas, type, 0.92);
            canvas.width = canvas.height = 0;
            paths.push(await save_into(folder, page_image_name(pdf.name, index + 1, count, args.format), blob));
            return `Saved ${format_bytes(blob.size)}`;
          },
        }));
      },
      () => ({
        title: "Pages exported",
        message: `${plural(paths.length, "image")} in ${folder}`,
        actions: [{ label: "Show", on_click: () => void apps().open(folder) }],
      })
    );
    return Promise.all(paths.map(written));
  } finally {
    void document.loadingTask.destroy();
  }
}

export interface TestPdfArgs {
  pages: number;
  page: string;
  orientation: Orientation;
  size?: string;
  images: number;
  text: number;
  grid: number;
  plain: boolean;
  to?: string;
}

export async function testpdf({ args, session, signal, elevated }: CommandContext<TestPdfArgs>): Promise<FileValue> {
  const paper = parse_page(args.page);
  if (!paper) throw new ShellError(`${args.page}: give a4, letter, a5, a3, legal, mixed, or WxH in mm`);
  const target = args.size === undefined ? null : parse_bytes(args.size);
  if (target === null && args.size !== undefined) throw new ShellError(`${args.size}: give a size like 500MB or 2GB`);
  const options: TestPdfOptions = {
    ...DEFAULT_PDF,
    ...paper,
    pages: args.pages,
    orientation: args.orientation,
    images: args.images,
    text: args.text,
    grid: args.grid,
    ...(args.plain ? { rulers: false, margin: 0, crosshair: false, corners: false, tint: false, label: "", grid: 0 } : {}),
  };
  const name = test_pdf_name(options, target);
  const path =
    args.to === undefined
      ? await free_path(await checked(documents_folder()), name)
      : await output_path(session, args.to, parent_path(resolve_path(session.cwd, args.to)), name, elevated);
  assert_writable(path, elevated);
  const result = await checked(generate_test_pdf(APP_ID, options, target, path, signal));
  if (!result.ok) throw new ShellError(result.error);
  return written(path);
}

export async function tools({ args, session }: CommandContext<{ section?: Section; path?: string }>): Promise<void> {
  const path =
    args.path === undefined
      ? undefined
      : (await source(session.cwd, args.path, args.section === Section.IMAGES ? "image" : "pdf")).path!;
  apps().launch(APP_ID, { section: args.section ?? (path ? undefined : Section.ORGANIZE), path });
}

export interface SignatureValue extends Tagged {
  $type: "signature";
  name: string;
  size: number | null;
  date: number | null;
}

export async function* signatures(): AsyncGenerator<SignatureValue> {
  const directory = await files().get_directory(SIGNATURES_DIR);
  if (!directory) return;
  for (const item of await files().list(directory, { include_metadata: true })) {
    if (item.kind !== "file" || !item.name.toLowerCase().endsWith(".svg")) continue;
    yield { $type: "signature", name: item.name, size: item.size ?? null, date: item.last_modified ?? null };
  }
}

export function open_page(path: string): void {
  void apps().open(path);
}

export function open_signature(name: string): void {
  apps().launch(APP_ID, { section: Section.SIGN, signature: name });
}

export async function complete_files(
  partial: string,
  context: { session: ShellSession },
  kind: "pdf" | "image"
): Promise<Completion[]> {
  const completer = kernel.service<ShellService>("shell").completer(ArgKind.PATH);
  if (!completer) return [];
  const matches = kind === "pdf" ? is_pdf_name : is_image_name;
  return (await completer(partial, context)).filter((item) => item.final === false || matches(item.value));
}
