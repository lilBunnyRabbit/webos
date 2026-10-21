import kernel, { type FilesService } from "$lib/core/api";
import { PATHS } from "$lib/core/api/services/files/hierarchy";
import { EXTENSION, parse_document, type WarrenDocument } from "./format";
import { read_document, stem_of } from "./io";

export const TEMPLATES_DIR = PATHS.templates;

export interface Template {
  id: string;
  name: string;
  description: string;
  load: () => Promise<WarrenDocument>;
}

const builtin = (id: string, name: string, description: string, text: () => Promise<{ default: string }>): Template => ({
  id: `builtin:${id}`,
  name,
  description,
  load: async () => parse_document((await text()).default),
});

export const BUILTIN_TEMPLATES: readonly Template[] = [
  builtin("cv", "CV", "Classic one-column CV: profile, experience, education, skills", () => import("./templates/cv.warren?raw")),
  builtin("cover-letter", "Cover letter", "Your name and contact details in the header, then the letter", () => import("./templates/cover-letter.warren?raw")),
  builtin("letter", "Letter", "A formal letter with both addresses, a subject and a sign-off", () => import("./templates/letter.warren?raw")),
  builtin("report", "Report", "Title, summary, findings and next steps, with page numbers", () => import("./templates/report.warren?raw")),
];

export async function user_templates(): Promise<Template[]> {
  const files = kernel.service<FilesService>("files");
  const directory = await files.get_directory(TEMPLATES_DIR);
  if (!directory) return [];
  const items = await files.list(directory);
  return items
    .filter((item) => item.kind === "file" && item.name.toLowerCase().endsWith(EXTENSION))
    .map((item) => {
      const path = `${TEMPLATES_DIR}/${item.name}`;
      return { id: `file:${path}`, name: stem_of(path), description: path, load: () => read_document(path) };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
