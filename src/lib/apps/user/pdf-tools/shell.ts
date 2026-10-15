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
import { run_job, type JobReport, type JobStep } from "./job";
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
import { images_to_pdf, load_pdf, merge_pdfs, organize_pdf, split_pdf, type PdfImage } from "./pdf";
import { SIGNATURES_DIR, is_image, prepare_image, read_bytes, write_at, type SourceFile } from "./pdf-files";
import { flatten_groups, parse_ranges, split_groups } from "./ranges";
import { canvas_blob, open_document, render_page } from "./render";
import { Section } from "./sections";
import { error_message } from "$lib/core/utils";

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

async function job<T>(
  signal: AbortSignal,
  title: string,
  total: number,
  work: (step: JobStep) => Promise<T>,
  report: (result: T) => JobReport
): Promise<T> {
  let result: T | undefined;
  let failure: unknown = null;
  const ok = await run_job(APP_ID, title, total, async (step) => {
    try {
      result = await work(step);
      return report(result);
    } catch (error) {
      failure = error;
      throw error;
    }
  }, signal);
  if (!ok) throw new ShellError(is_abort(failure) ? "stopped" : error_message(failure));
  return result as T;
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
    sources.length,
    async (step) => {
      const list = await Promise.all(sources.map(async (item) => ({ name: item.name, bytes: await read_bytes(item) })));
      await write_at(target, await merge_pdfs(list, { step: () => step() }));
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
  const paths = await job(
    signal,
    `Splitting ${pdf.name}`,
    plan.groups.length,
    async (step) => {
      const out: string[] = [];
      for await (const part of split_pdf(bytes, plan.groups, pdf.name)) {
        out.push(await save_into(folder, part_name(pdf.name, part.pages), part.bytes));
        await step();
      }
      return out;
    },
    (out) => ({
      title: "PDF split",
      message: `${plural(out.length, "file")} in ${folder}`,
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
    sources.length * 2,
    async (step) => {
      const prepared: PdfImage[] = [];
      for (const item of sources) {
        prepared.push(await prepare_image(item));
        await step();
      }
      await write_at(target, await images_to_pdf(prepared, args.size, IMAGE_MARGIN, { step: () => step() }));
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
    const paths = await job(
      signal,
      `Exporting ${plural(count, "page")}`,
      count,
      async (step) => {
        const out: string[] = [];
        for (let page = 1; page <= count; page++) {
          const canvas = await render_page(document, page - 1, args.scale);
          const blob = await canvas_blob(canvas, type, 0.92);
          canvas.width = canvas.height = 0;
          out.push(await save_into(folder, page_image_name(pdf.name, page, count, args.format), blob));
          await step(`Page ${page} of ${count}`);
        }
        return out;
      },
      (out) => ({
        title: "Pages exported",
        message: `${plural(out.length, "image")} in ${folder}`,
        actions: [{ label: "Show", on_click: () => void apps().open(folder) }],
      })
    );
    return Promise.all(paths.map(written));
  } finally {
    void document.loadingTask.destroy();
  }
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
