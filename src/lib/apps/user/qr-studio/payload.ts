import { z } from "zod";
import { Charset, is_latin2 } from "./encode/segments";
import { Ecc } from "./encode/tables";

export const ContentKind = {
  TEXT: "text",
  URL: "url",
  WIFI: "wifi",
  VCARD: "vcard",
  EMAIL: "email",
  PHONE: "phone",
  UPN: "upn",
} as const;
export type ContentKind = (typeof ContentKind)[keyof typeof ContentKind];

export const WifiSecurity = { WPA: "WPA", WEP: "WEP", NONE: "nopass" } as const;
export type WifiSecurity = (typeof WifiSecurity)[keyof typeof WifiSecurity];

const wifi_schema = z.object({
  ssid: z.string(),
  password: z.string(),
  security: z.enum([WifiSecurity.WPA, WifiSecurity.WEP, WifiSecurity.NONE]),
  hidden: z.boolean(),
});

const vcard_schema = z.object({
  first: z.string(),
  last: z.string(),
  org: z.string(),
  title: z.string(),
  phone: z.string(),
  email: z.string(),
  url: z.string(),
  street: z.string(),
  city: z.string(),
  zip: z.string(),
  country: z.string(),
});

const email_schema = z.object({ to: z.string(), subject: z.string(), body: z.string() });

const upn_schema = z.object({
  payer_name: z.string(),
  payer_street: z.string(),
  payer_city: z.string(),
  amount: z.string(),
  purpose_code: z.string(),
  purpose: z.string(),
  due: z.string(),
  iban: z.string(),
  reference: z.string(),
  name: z.string(),
  street: z.string(),
  city: z.string(),
});

export const content_schema = z.object({
  kind: z.enum([ContentKind.TEXT, ContentKind.URL, ContentKind.WIFI, ContentKind.VCARD, ContentKind.EMAIL, ContentKind.PHONE, ContentKind.UPN]),
  text: z.string(),
  url: z.string(),
  wifi: wifi_schema,
  vcard: vcard_schema,
  email: email_schema,
  phone: z.string(),
  upn: upn_schema,
});

export type Content = z.infer<typeof content_schema>;
export type WifiContent = z.infer<typeof wifi_schema>;
export type VcardContent = z.infer<typeof vcard_schema>;
export type EmailContent = z.infer<typeof email_schema>;
export type UpnContent = z.infer<typeof upn_schema>;

export const DEFAULT_CONTENT: Content = {
  kind: ContentKind.URL,
  text: "",
  url: "https://lilbunnyrabbit.github.io/webos/",
  wifi: { ssid: "", password: "", security: WifiSecurity.WPA, hidden: false },
  vcard: { first: "", last: "", org: "", title: "", phone: "", email: "", url: "", street: "", city: "", zip: "", country: "" },
  email: { to: "", subject: "", body: "" },
  phone: "",
  upn: { payer_name: "", payer_street: "", payer_city: "", amount: "", purpose_code: "OTHR", purpose: "", due: "", iban: "", reference: "SI99", name: "", street: "", city: "" },
};

export interface Payload {
  text: string;
  charset: Charset;
  /** Set by formats whose spec pins the symbol, like UPN's version 15 at ECC M. */
  fixed: { ecc: Ecc; version: number } | null;
  problems: string[];
}

const plain = (text: string, problems: string[] = []): Payload => ({ text, charset: Charset.UTF8, fixed: null, problems });

export function wifi_escape(value: string): string {
  return value.replace(/[\\;,:"]/g, (char) => `\\${char}`);
}

export function wifi_payload({ ssid, password, security, hidden }: WifiContent): string {
  const parts = [`T:${security}`, `S:${wifi_escape(ssid)}`];
  if (security !== WifiSecurity.NONE) parts.push(`P:${wifi_escape(password)}`);
  if (hidden) parts.push("H:true");
  return `WIFI:${parts.join(";")};;`;
}

function vcard_escape(value: string): string {
  return value.replace(/[\\,;]/g, (char) => `\\${char}`).replace(/\r?\n/g, "\\n");
}

export function vcard_payload(card: VcardContent): string {
  const e = vcard_escape;
  const name = [card.first, card.last].filter(Boolean).join(" ");
  const lines = ["BEGIN:VCARD", "VERSION:3.0", `N:${e(card.last)};${e(card.first)};;;`, `FN:${e(name)}`];
  if (card.org) lines.push(`ORG:${e(card.org)}`);
  if (card.title) lines.push(`TITLE:${e(card.title)}`);
  if (card.phone) lines.push(`TEL;TYPE=CELL:${e(card.phone)}`);
  if (card.email) lines.push(`EMAIL:${e(card.email)}`);
  if (card.url) lines.push(`URL:${e(card.url)}`);
  if (card.street || card.city || card.zip || card.country) lines.push(`ADR:;;${e(card.street)};${e(card.city)};;${e(card.zip)};${e(card.country)}`);
  lines.push("END:VCARD");
  return lines.join("\r\n");
}

export function email_payload({ to, subject, body }: EmailContent): string {
  const query = [subject && `subject=${encodeURIComponent(subject)}`, body && `body=${encodeURIComponent(body)}`].filter(Boolean).join("&");
  return `mailto:${to.trim()}${query ? `?${query}` : ""}`;
}

export function phone_payload(phone: string): string {
  return `tel:${phone.replace(/[^\d+*#]/g, "")}`;
}

export function url_payload(url: string): string {
  const trimmed = url.trim();
  if (trimmed === "" || /^[a-z][a-z\d+.-]*:/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

/** "12,50", "12.50", "1.234,50" → 1250 cents; `null` when it isn't an amount. */
export function parse_amount(amount: string): number | null {
  const compact = amount.replace(/\s/g, "");
  if (compact === "") return 0;
  const match = /^(\d{1,3}(?:[.]\d{3})*|\d+)(?:[,.](\d{1,2}))?$/.exec(compact);
  if (!match) return null;
  const whole = Number(match[1].replace(/\./g, ""));
  const cents = Number((match[2] ?? "0").padEnd(2, "0"));
  return whole * 100 + cents;
}

const UPN_LIMITS = { name: 33, street: 33, city: 33, purpose: 42, reference: 26 };
const UPN_FIELD_NAMES: Record<string, string> = {
  payer_name: "Payer name",
  payer_street: "Payer address",
  payer_city: "Payer town",
  purpose: "Purpose",
  reference: "Reference",
  name: "Recipient name",
  street: "Recipient address",
  city: "Recipient town",
};

/**
 * UPN QR, the Slovenian payment slip code (Bank Association of Slovenia, ZBS): 19 fields, each ended by a line feed,
 * then a checksum (the field lengths plus 19) and an empty reserve field, in ISO 8859-2 behind ECI 4, always version
 * 15 at ECC M.
 */
export function upn_fields(upn: UpnContent): string[] {
  const cents = parse_amount(upn.amount) ?? 0;
  const [year, month, day] = upn.due.split("-");
  return [
    "UPNQR",
    "",
    "",
    "",
    "",
    upn.payer_name.trim(),
    upn.payer_street.trim(),
    upn.payer_city.trim(),
    String(cents).padStart(11, "0"),
    "",
    "",
    upn.purpose_code.trim().toUpperCase(),
    upn.purpose.trim(),
    upn.due ? `${day}.${month}.${year}` : "",
    upn.iban.replace(/\s/g, "").toUpperCase(),
    upn.reference.replace(/\s/g, "").toUpperCase(),
    upn.name.trim(),
    upn.street.trim(),
    upn.city.trim(),
  ];
}

export function upn_payload(upn: UpnContent): string {
  const fields = upn_fields(upn);
  const checksum = String(fields.reduce((sum, field) => sum + field.length, 0) + 19).padStart(3, "0");
  return [...fields, checksum, ""].join("\n");
}

export function upn_problems(upn: UpnContent): string[] {
  const problems: string[] = [];
  const iban = upn.iban.replace(/\s/g, "").toUpperCase();
  if (!/^SI56\d{15}$/.test(iban)) problems.push("Recipient IBAN should be SI56 and 15 digits");
  const cents = parse_amount(upn.amount);
  if (cents === null) problems.push("Amount should look like 12,50");
  else if (cents > 99_999_999_999) problems.push("Amount is too large");
  if (!/^[A-Z]{4}$/.test(upn.purpose_code.trim().toUpperCase())) problems.push("Purpose code is four letters, like OTHR");
  const reference = upn.reference.replace(/\s/g, "").toUpperCase();
  if (!/^(SI\d{2}[\d-]{0,22}|RF\d{2}[A-Z\d]{1,21})$/.test(reference)) problems.push("Reference starts with SI and the model, like SI00 or SI99, or with RF");
  if (!upn.name.trim()) problems.push("Recipient name is missing");
  for (const key of ["payer_name", "payer_street", "payer_city", "purpose", "reference", "name", "street", "city"] as const) {
    const limit = key === "purpose" ? UPN_LIMITS.purpose : key === "reference" ? UPN_LIMITS.reference : UPN_LIMITS.name;
    if (upn[key].trim().length > limit) problems.push(`${UPN_FIELD_NAMES[key]} is longer than ${limit} characters`);
  }
  if (!is_latin2(Object.values(upn).join(""))) problems.push("Some characters can't be written in a UPN code and become ?");
  return problems;
}

export function content_payload(content: Content): Payload {
  switch (content.kind) {
    case ContentKind.TEXT:
      return plain(content.text);
    case ContentKind.URL:
      return plain(url_payload(content.url));
    case ContentKind.WIFI:
      return plain(wifi_payload(content.wifi), content.wifi.ssid ? [] : ["Network name is missing"]);
    case ContentKind.VCARD:
      return plain(vcard_payload(content.vcard));
    case ContentKind.EMAIL:
      return plain(email_payload(content.email), content.email.to.includes("@") ? [] : ["Address is missing"]);
    case ContentKind.PHONE:
      return plain(phone_payload(content.phone));
    case ContentKind.UPN:
      return { text: upn_payload(content.upn), charset: Charset.LATIN2, fixed: { ecc: Ecc.M, version: 15 }, problems: upn_problems(content.upn) };
  }
}
