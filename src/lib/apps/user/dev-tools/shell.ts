import kernel, { type FilesService } from "$lib/core/api";
import { resolve_path } from "$lib/core/api/services/files/path";
import { is_file_value, type FileValue } from "$lib/core/api/services/files/shell";
import { ShellError, type CommandContext, type ShellService, type Value } from "$lib/core/api/services/shell/type";
import { to_text } from "$lib/core/api/services/shell/values";
import { format_datetime } from "$lib/core/utils";
import { bytes_to_base64, decode_base64, encode_base64 } from "./base64";
import { cert_state, read_certificates } from "./cert";
import { MAX_RUNS, describe_cron, next_runs, parse_cron } from "./cron";
import { HashAlgorithm, to_hex } from "./hash";
import { decode_jwt, is_hmac, jwt_status, jwt_times, verify_hmac } from "./jwt";
import { is_zone, local_zone, parse_time, relative_time, time_fields } from "./time";
import { generate_uuids, type UuidVersion } from "./uuid";

const files = () => kernel.service<FilesService>("files");

async function piped(context: CommandContext<unknown>): Promise<(string | FileValue)[]> {
  const types = (type: string) => kernel.service<ShellService>("shell").value_type(type);
  const out: (string | FileValue)[] = [];
  for await (const value of context.input) out.push(is_file_value(value) ? value : to_text(value, types));
  return out;
}

/** The typed words as one input, else each piped value as text; empty when there's neither. */
async function text_inputs(words: string[], context: CommandContext<unknown>): Promise<string[]> {
  if (words.length > 0 || !context.piped) return words.length > 0 ? [words.join(" ")] : [];
  return (await piped(context)).map((value) => (typeof value === "string" ? value : value.path));
}

async function file_bytes(path: string): Promise<Uint8Array<ArrayBuffer>> {
  const file = await files().get_file(path);
  if (!file) throw new ShellError(`${path}: no such file`);
  return new Uint8Array(await file.arrayBuffer());
}

const MAX_LABEL = 60;
const label = (text: string) => (text.length > MAX_LABEL ? `${text.slice(0, MAX_LABEL - 1)}…` : text);

export async function* jwt(context: CommandContext<{ token?: string; secret?: string }>): AsyncGenerator<Value> {
  const { args } = context;
  const tokens = await text_inputs(args.token === undefined ? [] : [args.token], context);
  if (tokens.length === 0) throw new ShellError("jwt: give a token, or pipe one in");
  const now = Date.now();
  for (const token of tokens) {
    const result = decode_jwt(token);
    if (!result.ok) throw new ShellError(`jwt: ${result.error}`);
    const { header, payload } = result.jwt;
    let signature = "not checked: give --secret";
    if (!is_hmac(header)) signature = `not checked: ${String(header.alg ?? "this algorithm")} needs a public key`;
    else if (args.secret !== undefined)
      signature = (await verify_hmac(result.jwt, args.secret)) ? "verified" : "doesn't match the secret";
    const times = Object.fromEntries(jwt_times(payload, now).map((time) => [time.claim, `${time.iso} (${time.relative})`]));
    yield { status: jwt_status(payload, now).text, signature, ...times, header, payload };
  }
}

export async function* ts(context: CommandContext<{ value: string[]; zone?: string }>): AsyncGenerator<Value> {
  const zone = context.args.zone ?? local_zone();
  if (!is_zone(zone)) throw new ShellError(`ts: ${zone}: not a time zone, try Europe/Ljubljana or UTC`);
  const now = Date.now();
  const inputs = await text_inputs(context.args.value, context);
  for (const input of inputs.length > 0 ? inputs : ["now"]) {
    const parsed = parse_time(input, now);
    if (!parsed.ok) throw new ShellError(`ts: ${input}: ${parsed.error.toLowerCase()}`);
    yield { ...time_fields(parsed.ms, zone, now) };
  }
}

export async function* cron(context: CommandContext<{ expression: string[]; count: number }>): AsyncGenerator<Value> {
  const expressions = await text_inputs(context.args.expression, context);
  if (expressions.length === 0) throw new ShellError('cron: give an expression, like "*/15 9-17 * * mon-fri"');
  const now = Date.now();
  for (const expression of expressions) {
    const parsed = parse_cron(expression);
    if (!parsed.ok) throw new ShellError(`cron: ${parsed.error}`);
    yield describe_cron(parsed.schedule);
    const runs = next_runs(parsed.schedule, new Date(now), Math.min(MAX_RUNS, context.args.count));
    if (runs.length === 0) yield "Never runs: no date matches every field";
    for (const run of runs) yield { at: format_datetime(run), in: relative_time(run.getTime(), now), iso: run.toISOString() };
  }
}

export async function* cert(context: CommandContext<{ paths: string[] }>): AsyncGenerator<Value> {
  const { args, session } = context;
  const sources: (string | Uint8Array<ArrayBuffer>)[] = [];
  if (args.paths.length > 0 || !context.piped) {
    if (args.paths.length === 0) throw new ShellError("cert: give a .pem, .crt or .der file, or pipe PEM in");
    for (const path of args.paths) sources.push(await file_bytes(resolve_path(session.cwd, path)));
  } else {
    for (const value of await piped(context)) sources.push(typeof value === "string" ? value : await file_bytes(value.path));
  }

  const now = Date.now();
  for (const source of sources) {
    const result = await read_certificates(source);
    if (!result.ok) throw new ShellError(`cert: ${result.error}`);
    for (const certificate of result.certificates) {
      yield {
        subject: certificate.subject,
        issuer: certificate.self_signed ? "self-signed" : certificate.issuer,
        status: cert_state(certificate, now).text,
        not_before: certificate.not_before.toISOString(),
        not_after: certificate.not_after.toISOString(),
        names: certificate.san.join(", "),
        serial: certificate.serial,
        key: certificate.key,
        signature: certificate.signature,
        ca: certificate.is_ca,
        sha256: certificate.sha256,
        sha1: certificate.sha1,
      };
    }
  }
}

function convert(text: string, decode: boolean, url: boolean): string {
  if (!decode) return encode_base64(text, url);
  const result = decode_base64(text);
  if (!result.ok) throw new ShellError(`b64: ${result.error ?? "not valid Base64"}`);
  return result.value;
}

export async function* b64(context: CommandContext<{ text: string[]; decode: boolean; url: boolean }>): AsyncGenerator<string> {
  const { args } = context;
  if (args.text.length > 0 || !context.piped) {
    if (args.text.length === 0) throw new ShellError("b64: give text, or pipe some in");
    yield convert(args.text.join(" "), args.decode, args.url);
    return;
  }
  const values = await piped(context);
  const texts = values.filter((value) => typeof value === "string");
  if (texts.length > 0) yield convert(texts.join("\n"), args.decode, args.url);
  for (const value of values) {
    if (typeof value === "string") continue;
    if (args.decode) throw new ShellError(`b64: ${value.path}: -d decodes text, pipe it through cat`);
    yield bytes_to_base64(await file_bytes(value.path), args.url);
  }
}

const HASH_FLAGS = {
  sha1: HashAlgorithm.SHA_1,
  sha256: HashAlgorithm.SHA_256,
  sha384: HashAlgorithm.SHA_384,
  sha512: HashAlgorithm.SHA_512,
} as const;
type HashFlag = keyof typeof HASH_FLAGS;

export async function* hash(context: CommandContext<{ inputs: string[]; algorithm: HashFlag }>): AsyncGenerator<Value> {
  const { args, session } = context;
  const row = async (data: Uint8Array<ArrayBuffer>, of: string) => ({
    algorithm: args.algorithm,
    hash: to_hex(await crypto.subtle.digest(HASH_FLAGS[args.algorithm], data)),
    of: label(of),
  });
  const encode = (text: string) => new TextEncoder().encode(text);

  if (args.inputs.length > 0 || !context.piped) {
    if (args.inputs.length === 0) throw new ShellError("hash: give a file or text, or pipe some in");
    const paths = args.inputs.map((input) => resolve_path(session.cwd, input));
    const found = await Promise.all(paths.map((path) => files().get_file(path).catch(() => null)));
    // `hash hello` hashes the word, unless a file of that name is there.
    if (found.every((file) => !file)) {
      yield await row(encode(args.inputs.join(" ")), args.inputs.join(" "));
      return;
    }
    for (const [index, file] of found.entries()) {
      if (!file) throw new ShellError(`hash: ${paths[index]}: no such file`);
      yield await row(new Uint8Array(await file.arrayBuffer()), paths[index]);
    }
    return;
  }

  for (const value of await piped(context))
    yield typeof value === "string" ? await row(encode(value), value) : await row(await file_bytes(value.path), value.path);
}

export function* uuid({ args }: CommandContext<{ count: number; version: UuidVersion }>): Generator<string> {
  yield* generate_uuids(args.version, args.count);
}
