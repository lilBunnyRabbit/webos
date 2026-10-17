import kernel, { type AppsService, type FilesService } from "$lib/core/api";
import { base_name, file_extension, resolve_path } from "$lib/core/api/services/files/path";
import { ArgKind } from "$lib/core/api/services/shell/arg";
import {
  ShellError,
  type CommandContext,
  type Completion,
  type ShellService,
  type ShellSession,
  type Tagged,
} from "$lib/core/api/services/shell/type";
import { format_amounts, ingredient_list } from "./amounts";
import { APP_ID, UnitSystem } from "./constants";
import { parse_cook, recipe_servings } from "./cooklang";

export interface ScaleArgs {
  path: string;
  servings: number;
  units?: UnitSystem;
}

export async function* scale({ args, session }: CommandContext<ScaleArgs>): AsyncGenerator<Tagged> {
  const path = resolve_path(session.cwd, args.path);
  const file = await kernel.service<FilesService>("files").get_file(path);
  if (!file) throw new ShellError(`recipe scale: ${path}: no such file`);
  const recipe = parse_cook(await file.text());
  const factor = args.servings / (recipe_servings(recipe) ?? 1);
  for (const entry of ingredient_list(recipe, factor, args.units ?? UnitSystem.WRITTEN)) {
    yield {
      $type: "ingredient",
      name: entry.optional ? `${entry.name} (optional)` : entry.name,
      amount: format_amounts(entry.amounts),
      note: entry.notes.join("; "),
      recipe: base_name(path),
      path,
    };
  }
}

export function open(path: string): void {
  kernel.service<AppsService>("apps").launch(APP_ID, { path });
}

export async function complete_recipes(partial: string, context: { session: ShellSession }): Promise<Completion[]> {
  const completer = kernel.service<ShellService>("shell").completer(ArgKind.PATH);
  if (!completer) return [];
  return (await completer(partial, context)).filter(
    (item) => item.final === false || file_extension(item.value) === ".cook"
  );
}
