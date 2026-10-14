import kernel, { type AppsService, type FilesService } from "$lib/core/api";
import { resolve_path } from "$lib/core/api/services/files/path";
import { ShellError, type CommandContext } from "$lib/core/api/services/shell/type";
import type { MarkdownPdfProps, PageSize, Template } from "./props";

interface Md2PdfArgs {
  path: string;
  template?: Template;
  size?: PageSize;
  landscape: boolean;
  toc: boolean;
}

export async function md2pdf({ args, session }: CommandContext<Md2PdfArgs>): Promise<void> {
  const path = resolve_path(session.cwd, args.path);
  if (!(await kernel.service<FilesService>("files").get_file(path))) throw new ShellError(`md2pdf: ${path}: no such file`);
  const props: MarkdownPdfProps = { path, print: true };
  if (args.template) props.template = args.template;
  if (args.size) props.size = args.size;
  if (args.landscape) props.landscape = true;
  if (args.toc) props.toc = true;
  kernel.service<AppsService>("apps").launch("markdown-pdf", props);
}
