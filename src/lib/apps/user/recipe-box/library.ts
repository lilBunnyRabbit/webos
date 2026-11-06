import kernel, { type FilesService } from "$lib/core/api";
import { PATHS } from "$lib/core/api/services/files/hierarchy";
import { file_extension, join_path, split_path } from "$lib/core/api/services/files/path";
import { is_favorite, parse_cook, recipe_servings, recipe_tags, recipe_title, steps } from "./cooklang";

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
  favorite: boolean;
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
    favorite: is_favorite(recipe),
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

export const Shelf = { FAVORITES: "favorites", TAG: "tag", UNTAGGED: "untagged" } as const;
export type Shelf = (typeof Shelf)[keyof typeof Shelf];

export interface RecipeShelf {
  kind: Shelf;
  label: string;
  entries: RecipeEntry[];
}

export function shelves(entries: RecipeEntry[]): RecipeShelf[] {
  const favorites = entries.filter((entry) => entry.favorite);
  const untagged = entries.filter((entry) => entry.tags.length === 0);
  return [
    ...(favorites.length > 0 ? [{ kind: Shelf.FAVORITES, label: "Favourites", entries: favorites }] : []),
    ...all_tags(entries).map((tag) => ({ kind: Shelf.TAG, label: tag, entries: entries.filter((entry) => entry.tags.includes(tag)) })),
    ...(untagged.length > 0 ? [{ kind: Shelf.UNTAGGED, label: "Untagged", entries: untagged }] : []),
  ];
}
