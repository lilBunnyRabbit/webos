import { z } from "zod";
import { RouteKind, serialize_route } from "$lib/core/api/services/router/route";
import { blank_answers, FieldKind, parse_form, questions, type Answer, type Form } from "./form";
import { PAYLOAD_PREFIX } from "./props";

export const APP_ID = "forms";

/** Chat apps, email clients and QR codes start cutting or refusing links around this length. */
export const LONG_LINK = 2000;

async function bytes_of(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function to_base64url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function from_base64url(text: string): Uint8Array {
  const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

/** JSON, deflated, base64url, behind a version prefix the router's `JSON.parse` of link values can never accept. */
export async function pack(value: unknown): Promise<string> {
  const json = new Blob([JSON.stringify(value)]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  return PAYLOAD_PREFIX + to_base64url(await bytes_of(json));
}

export async function unpack(payload: string): Promise<unknown> {
  if (!payload.startsWith(PAYLOAD_PREFIX)) return null;
  try {
    const raw = new Blob([from_base64url(payload.slice(PAYLOAD_PREFIX.length)) as BlobPart]).stream();
    return JSON.parse(new TextDecoder().decode(await bytes_of(raw.pipeThrough(new DecompressionStream("deflate-raw")))));
  } catch {
    return null;
  }
}

const FormPayload = z.object({ s: z.string(), n: z.string().optional() });
const AnswerPayload = FormPayload.extend({
  r: z.string().optional(),
  t: z.number(),
  a: z.array(z.union([z.string(), z.boolean()])),
});

/** `name` is the form file's stem, so a saved answer lands beside the form as `{name}.answers`. */
export interface SharedForm {
  source: string;
  name: string | null;
}

export interface FormResponse {
  respondent: string | null;
  submitted_at: number;
  answers: Record<string, Answer>;
}

export interface SharedAnswer extends SharedForm {
  response: FormResponse;
}

/** A shared form opens solo, so the person filling it sees only the form; an answer comes back into the full OS to be saved (ADR-047). */
export function app_link(props: { f: string } | { a: string }, base = `${location.origin}${location.pathname}`): string {
  return base + serialize_route({ kind: "f" in props ? RouteKind.SOLO : RouteKind.APP, id: APP_ID, props });
}

export async function form_payload(form: SharedForm): Promise<string> {
  return pack(form.name ? { s: form.source, n: form.name } : { s: form.source });
}

export async function read_form_payload(payload: string): Promise<SharedForm | null> {
  const parsed = FormPayload.safeParse(await unpack(payload));
  return parsed.success ? { source: parsed.data.s, name: parsed.data.n ?? null } : null;
}

/** Answers ride by position, in question order: the form travels along, so keys would only repeat its labels. */
export async function answer_payload(shared: SharedForm, form: Form, response: FormResponse): Promise<string> {
  return pack({
    s: shared.source,
    ...(shared.name ? { n: shared.name } : {}),
    ...(response.respondent ? { r: response.respondent } : {}),
    t: response.submitted_at,
    a: questions(form).map((field) => response.answers[field.key] ?? (field.kind === FieldKind.CHECK ? false : "")),
  });
}

const AnswerCode = z.object({
  i: z.string(),
  n: z.string().optional(),
  r: z.string().optional(),
  t: z.number(),
  a: z.record(z.string(), z.union([z.string(), z.boolean()])),
});

/**
 * What the respondent sends back. A form with an id gets a short code: the id and the answers keyed by question, no
 * form inside, since the owner's own file is found by the id. A form shared before ids existed still packs itself in.
 */
export async function answer_code(shared: SharedForm, form: Form, response: FormResponse): Promise<string> {
  if (!form.id) return answer_payload(shared, form, response);
  return pack({
    i: form.id,
    ...(shared.name ? { n: shared.name } : {}),
    ...(response.respondent ? { r: response.respondent } : {}),
    t: response.submitted_at,
    a: response.answers,
  });
}

/** A pasted answer: `id` finds the form; `source` only rides along in codes from forms shared without an id. */
export interface PastedAnswer {
  id: string | null;
  name: string | null;
  source: string | null;
  response: FormResponse;
}

/** Takes the code itself or an answer link (`…?a=v1…`); `null` when it's neither. */
export async function read_answer_code(text: string): Promise<PastedAnswer | null> {
  const trimmed = text.trim();
  const from_link = /[?&]a=([^&\s]+)/.exec(trimmed);
  const payload = from_link ? decodeURIComponent(from_link[1]) : trimmed;

  const code = AnswerCode.safeParse(await unpack(payload));
  if (code.success) {
    const { i, n, r, t, a } = code.data;
    return { id: i, name: n ?? null, source: null, response: { respondent: r?.trim() || null, submitted_at: t, answers: a } };
  }

  const shared = await read_answer_payload(payload);
  return shared ? { id: parse_form(shared.source).id, name: shared.name, source: shared.source, response: shared.response } : null;
}

export async function read_answer_payload(payload: string): Promise<SharedAnswer | null> {
  const parsed = AnswerPayload.safeParse(await unpack(payload));
  if (!parsed.success) return null;
  const { s: source, n, r, t, a } = parsed.data;
  const form = parse_form(source);
  const answers = blank_answers(form);
  questions(form).forEach((field, index) => {
    const value = a[index];
    if (value === undefined) return;
    answers[field.key] = field.kind === FieldKind.CHECK ? value === true : String(value);
  });
  return { source, name: n ?? null, response: { respondent: r?.trim() || null, submitted_at: t, answers } };
}
