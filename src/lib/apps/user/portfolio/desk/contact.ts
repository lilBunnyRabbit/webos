export interface Draft {
  subject: string;
  message: string;
}

export const ZONE = "Europe/Ljubljana";

const TIME = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: ZONE });

/** RFC 6068 wants CRLF line breaks in a body; empty fields add nothing, so a blank draft is just the address. */
export function mailto(address: string, draft: Draft): string {
  const fields: [string, string][] = [
    ["subject", draft.subject.trim()],
    ["body", draft.message.trim().replace(/\r?\n/g, "\r\n")],
  ];
  const query = fields.filter(([, value]) => value).map(([key, value]) => `${key}=${encodeURIComponent(value)}`);
  return `mailto:${address}${query.length > 0 ? `?${query.join("&")}` : ""}`;
}

/** Where the owner lives, which is not the profile's broader "Ljubljana area": the clock names the place itself. */
export const HOME = "Ig";

export function clock(at: Date): string {
  return TIME.format(at);
}

export function local_time(at: Date): string {
  return `${clock(at)} in ${HOME}`;
}

export function until_next_minute(at: Date): number {
  return 60_000 - (at.getTime() % 60_000);
}

export function subject_of(input: string): string {
  const rest = input.trim().replace(/^\S+\s*/, "");
  return rest.replace(/^(["'“])(.*)(["'”])$/s, "$2").trim();
}
