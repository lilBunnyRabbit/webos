import { base_name, parent_path } from "$lib/core/api/services/files/path";
import { ANSWERS_EXTENSION, form_stem } from "./answers";
import type { PastedAnswer } from "./link";

export interface FoundForm {
  path: string;
  id: string | null;
  title: string;
  modified: number;
}

export const answers_path_for = (form_path: string) =>
  `${parent_path(form_path)}/${form_stem(base_name(form_path))}${ANSWERS_EXTENSION}`.replace(/^\/\//, "/");

/** By id; a code from a form shared before ids existed falls back to the form's file name. */
export function locate(forms: FoundForm[], pasted: Pick<PastedAnswer, "id" | "name">): FoundForm | null {
  if (pasted.id) {
    const match = forms.find((form) => form.id === pasted.id);
    if (match) return match;
  }
  const name = pasted.name?.toLowerCase();
  return (name && forms.find((form) => form_stem(base_name(form.path)).toLowerCase() === name)) || null;
}
