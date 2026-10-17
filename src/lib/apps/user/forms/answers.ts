import { z } from "zod";
import { FieldKind, questions, type Answer, type Form } from "./form";
import type { FormResponse } from "./link";

export const FORM_EXTENSION = ".form.md";
export const ANSWERS_EXTENSION = ".answers";

const ANSWERS_VERSION = 1;

const ResponseSchema = z.object({
  respondent: z.string().nullable(),
  submitted_at: z.number(),
  answers: z.record(z.string(), z.union([z.string(), z.boolean()])),
});

const AnswersFileSchema = z.object({
  version: z.literal(ANSWERS_VERSION),
  form: z.string(),
  responses: z.array(ResponseSchema),
});

/** The form's source rides along, so the file still reads after the form is edited, moved or deleted. */
export interface AnswersFile {
  version: typeof ANSWERS_VERSION;
  form: string;
  responses: FormResponse[];
}

export function empty_answers(form: string): AnswersFile {
  return { version: ANSWERS_VERSION, form, responses: [] };
}

export function parse_answers(text: string): AnswersFile | null {
  try {
    const parsed = AnswersFileSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function serialize_answers(file: AnswersFile): string {
  return JSON.stringify(file, null, 2) + "\n";
}

const same_response = (a: FormResponse, b: FormResponse) =>
  a.submitted_at === b.submitted_at && a.respondent === b.respondent && JSON.stringify(a.answers) === JSON.stringify(b.answers);

export function has_response(file: AnswersFile, response: FormResponse): boolean {
  return file.responses.some((saved) => same_response(saved, response));
}

/** `added: false` when the same answer was already saved: links get opened twice. The newest form source wins. */
export function add_response(file: AnswersFile, form: string, response: FormResponse): { file: AnswersFile; added: boolean } {
  if (has_response(file, response)) return { file, added: false };
  const responses = [...file.responses, response].sort((a, b) => a.submitted_at - b.submitted_at);
  return { file: { ...file, form, responses }, added: true };
}

export function remove_response(file: AnswersFile, index: number): AnswersFile {
  return { ...file, responses: file.responses.filter((_, i) => i !== index) };
}

export interface Column {
  key: string;
  label: string;
  check: boolean;
}

/** The form's questions, then keys only older answers have (a question since renamed or removed). */
export function answer_columns(form: Form, responses: FormResponse[]): Column[] {
  const columns: Column[] = questions(form).map((field) => ({ key: field.key, label: field.label || field.key, check: field.kind === FieldKind.CHECK }));
  const known = new Set(columns.map((column) => column.key));
  for (const response of responses) {
    for (const [key, value] of Object.entries(response.answers)) {
      if (known.has(key)) continue;
      known.add(key);
      columns.push({ key, label: key, check: typeof value === "boolean" });
    }
  }
  return columns;
}

export function tally(columns: Column[], responses: FormResponse[]): Map<string, number> {
  return new Map(columns.filter((column) => column.check).map((column) => [column.key, responses.filter((response) => response.answers[column.key] === true).length]));
}

export function is_answered(value: Answer | undefined): boolean {
  return value === true || (typeof value === "string" && value.trim() !== "");
}

const csv_cell = (value: string) => (/[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value);

/** One row per response; ticked checkboxes are `yes`, unticked ones empty. */
export function to_csv(columns: Column[], responses: FormResponse[]): string {
  const header = ["Respondent", "Submitted", ...columns.map((column) => column.label)];
  const rows = responses.map((response) => [
    response.respondent ?? "",
    new Date(response.submitted_at).toISOString(),
    ...columns.map((column) => {
      const value = response.answers[column.key];
      return value === true ? "yes" : typeof value === "string" ? value : "";
    }),
  ]);
  return [header, ...rows].map((row) => row.map(csv_cell).join(",")).join("\r\n") + "\r\n";
}

export function form_stem(name: string): string {
  return name.toLowerCase().endsWith(FORM_EXTENSION) ? name.slice(0, -FORM_EXTENSION.length) : name.replace(/\.[^.]*$/, "");
}

/** Forms only claims `.form.md`, so a name typed without it gets it: `survey` and `survey.md` → `survey.form.md`. */
export function with_form_extension(name: string): string {
  return name.toLowerCase().endsWith(FORM_EXTENSION) ? name : `${name.replace(/\.md$/i, "")}${FORM_EXTENSION}`;
}

export function with_extension(name: string, extension: string): string {
  return name.toLowerCase().endsWith(extension) ? name : `${name}${extension}`;
}

export function stem_from_title(title: string): string {
  return title.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60) || "Form";
}
