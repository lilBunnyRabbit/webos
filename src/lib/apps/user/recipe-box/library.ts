import kernel, { type FilesService } from "$lib/core/api";
import { PATHS } from "$lib/core/api/services/files/hierarchy";
import { file_extension, join_path, split_path } from "$lib/core/api/services/files/path";
import { parse_cook, recipe_servings, recipe_tags, recipe_title, steps } from "./cooklang";

export const DEFAULT_FOLDER = `${PATHS.documents}/Recipes`;

const files = () => kernel.service<FilesService>("files");

export async function ensure_folder(path: string): Promise<void> {
  let current: FileSystemDirectoryHandle | null = null;
  const segments: string[] = [];
  for (const segment of split_path(path)) {
    segments.push(segment);
    const existing = await files().get_directory(join_path(segments));
    current = existing ?? (await files().create_directory(current, segment));
  }
}

export interface RecipeEntry {
  path: string;
  title: string;
  tags: string[];
  servings: number | null;
  ingredients: string[];
  modified: number;
}

export function summarize(path: string, name: string, text: string, modified: number): RecipeEntry {
  const recipe = parse_cook(text);
  const ingredients = steps(recipe).flatMap((step) => step.items.flatMap((item) => (item.kind === "ingredient" ? [item.name] : [])));
  return {
    path,
    title: recipe_title(recipe, name),
    tags: recipe_tags(recipe),
    servings: recipe_servings(recipe),
    ingredients: [...new Set(ingredients.map((item) => item.toLowerCase()))],
    modified,
  };
}

export async function list_recipes(folder: string): Promise<RecipeEntry[]> {
  const root = await files().get_directory(folder);
  if (!root) return [];
  const found: RecipeEntry[] = [];
  const walk = async (handle: FileSystemDirectoryHandle, segments: string[]) => {
    for (const item of await files().list(handle)) {
      if (item.kind === "directory") await walk(item.handle, [...segments, item.name]);
      else if (file_extension(item.name) === ".cook") {
        const file = await files().read_file(item.handle);
        found.push(summarize(join_path([...segments, item.name]), item.name, await file.text(), file.lastModified));
      }
    }
  };
  await walk(root, split_path(folder));
  return found.sort((a, b) => a.title.localeCompare(b.title));
}

export function recipe_matches(entry: RecipeEntry, query: string, tag: string | null): boolean {
  if (tag !== null && !entry.tags.includes(tag)) return false;
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const haystack = [entry.title, ...entry.tags, ...entry.ingredients].join(" ").toLowerCase();
  return words.every((word) => haystack.includes(word));
}

export function all_tags(entries: RecipeEntry[]): string[] {
  return [...new Set(entries.flatMap((entry) => entry.tags))].sort((a, b) => a.localeCompare(b));
}

export function recipe_template(title: string): string {
  return [
    "---",
    `title: ${title}`,
    "servings: 2",
    "tags: []",
    "---",
    "",
    "-- @ingredient{quantity%unit}, #cookware{} and ~timer{quantity%unit} mark things inside a step.",
    "-- A blank line starts the next step. Lines starting with > are notes.",
    "",
    "Bring @water{1%l} to a boil in a #pot{} and add @salt{=1%tsp}.",
    "",
    "Cook @pasta{200%g} for ~{9%minutes}, then drain.",
    "",
  ].join("\n");
}
