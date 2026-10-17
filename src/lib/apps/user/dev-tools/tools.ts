import {
  Binary as BinaryIcon,
  BracketsCurly as BracketsCurlyIcon,
  CalendarDots as CalendarDotsIcon,
  Certificate as CertificateIcon,
  Clock as ClockIcon,
  Fingerprint as FingerprintIcon,
  Hash as HashIcon,
  Key as KeyIcon,
  Link as LinkIcon,
  MagnifyingGlass as MagnifyingGlassIcon,
} from "phosphor-svelte";
import { z } from "zod";
import { DEFAULT_RUNS, MAX_RUNS } from "./cron";
import { JsonIndent } from "./json";
import { UrlScope } from "./url";
import { UuidVersion } from "./uuid";

export const TOOLS = [
  { value: "base64", label: "Base64", icon: BinaryIcon },
  { value: "hash", label: "Hashes", icon: HashIcon },
  { value: "url", label: "URL", icon: LinkIcon },
  { value: "uuid", label: "UUID", icon: FingerprintIcon },
  { value: "regex", label: "Regex", icon: MagnifyingGlassIcon },
  { value: "json", label: "JSON", icon: BracketsCurlyIcon },
  { value: "jwt", label: "JWT", icon: KeyIcon },
  { value: "time", label: "Time", icon: ClockIcon },
  { value: "cron", label: "Cron", icon: CalendarDotsIcon },
  { value: "cert", label: "Certificate", icon: CertificateIcon },
] as const;

export type Tool = (typeof TOOLS)[number]["value"];

export const TOOL_IDS = TOOLS.map((tool) => tool.value);

export const Direction = { ENCODE: "encode", DECODE: "decode" } as const;
export type Direction = (typeof Direction)[keyof typeof Direction];

export const DIRECTION_OPTIONS = [
  { value: Direction.ENCODE, label: "Encode" },
  { value: Direction.DECODE, label: "Decode" },
];

/** Texts longer than this aren't saved, so a pasted file can't fill localStorage. */
export const MAX_STORED_TEXT = 20_000;

const text = z.string().catch("");
const direction = z.enum(Direction).catch(Direction.ENCODE);

// Each field falls back on its own, so one bad value doesn't reset the rest.
export const DevToolsState = z.object({
  tool: z.enum(TOOL_IDS).catch("base64"),
  base64: z.object({ input: text, direction, url_safe: z.boolean().catch(false) }).catch({
    input: "",
    direction: Direction.ENCODE,
    url_safe: false,
  }),
  hash: z.object({ input: text }).catch({ input: "" }),
  url: z
    .object({ input: text, direction, scope: z.enum(UrlScope).catch(UrlScope.COMPONENT), parse_input: text })
    .catch({ input: "", direction: Direction.ENCODE, scope: UrlScope.COMPONENT, parse_input: "" }),
  uuid: z
    .object({ version: z.enum(UuidVersion).catch(UuidVersion.V4), count: z.number().int().min(1).catch(1) })
    .catch({ version: UuidVersion.V4, count: 1 }),
  regex: z
    .object({ pattern: text, flags: z.string().catch("g"), text })
    .catch({ pattern: "", flags: "g", text: "" }),
  json: z.object({ input: text, indent: z.enum(JsonIndent).catch(JsonIndent.TWO) }).catch({
    input: "",
    indent: JsonIndent.TWO,
  }),
  jwt: z.object({ input: text }).catch({ input: "" }),
  // An empty zone follows the device's own.
  time: z.object({ input: text, zone: text }).catch({ input: "", zone: "" }),
  cron: z
    .object({ input: text, count: z.number().int().min(1).max(MAX_RUNS).catch(DEFAULT_RUNS) })
    .catch({ input: "", count: DEFAULT_RUNS }),
  cert: z.object({ input: text }).catch({ input: "" }),
});
export type DevToolsState = z.infer<typeof DevToolsState>;

export function initial_state(): DevToolsState {
  return DevToolsState.parse({});
}

function cap(value: string): string {
  return value.length > MAX_STORED_TEXT ? "" : value;
}

export function to_stored(state: DevToolsState): DevToolsState {
  return {
    ...state,
    base64: { ...state.base64, input: cap(state.base64.input) },
    hash: { input: cap(state.hash.input) },
    url: { ...state.url, input: cap(state.url.input), parse_input: cap(state.url.parse_input) },
    regex: { ...state.regex, pattern: cap(state.regex.pattern), text: cap(state.regex.text) },
    json: { ...state.json, input: cap(state.json.input) },
    jwt: { input: cap(state.jwt.input) },
    time: { ...state.time, input: cap(state.time.input) },
    cron: { ...state.cron, input: cap(state.cron.input) },
    cert: { input: cap(state.cert.input) },
  };
}
