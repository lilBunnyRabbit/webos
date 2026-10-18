import kernel, { type AppsService } from "$lib/core/api";
import { ShellError } from "$lib/core/api/services/shell/type";
import { entry_for } from "./catalog";
import { InputError } from "./engine/inputs";
import { definition_for } from "./registry";

const APP_ID = "algorithms";

export async function open(id: string, input = ""): Promise<string> {
  const entry = entry_for(id);
  if (!entry) throw new ShellError(`algo: no algorithm ${id}`);
  if (input.trim()) {
    const definition = await definition_for(id);
    try {
      definition?.input.parse(input);
    } catch (reason) {
      throw new ShellError(`algo ${id}: ${reason instanceof InputError ? reason.message : "that input doesn't work"}`);
    }
  }
  kernel.service<AppsService>("apps").launch(APP_ID, { section: id, ...(input.trim() ? { input } : {}) });
  return `Opened ${entry.name}`;
}
