export const LoadFailure = {
  FETCH: "fetch",
  CODE: "code",
} as const;
export type LoadFailure = (typeof LoadFailure)[keyof typeof LoadFailure];

// Chrome, Firefox and Safari word a failed dynamic import differently; Vite adds its own for CSS preloads.
const FETCH_MESSAGES = [
  /failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /importing a module script failed/i,
  /unable to preload css/i,
  /networkerror/i,
  /failed to fetch/i,
];

export function load_failure(error: unknown): LoadFailure {
  const message = error instanceof Error ? error.message : String(error);
  return FETCH_MESSAGES.some((pattern) => pattern.test(message)) ? LoadFailure.FETCH : LoadFailure.CODE;
}

export function failure_details(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const head = `${error.name}: ${error.message}`;
  const stack = error.stack?.trim() ?? "";
  if (!stack) return head;
  return stack.startsWith(head) ? stack : `${head}\n${stack}`;
}

const MODULE_URL = /(https?:\/\/\S+)$/;

/** The chunk a failed import names (Chrome, Firefox), when it is on this page's origin. Safari names none. */
export function failed_module_url(error: unknown, origin: string): string | null {
  const message = error instanceof Error ? error.message : String(error);
  const match = MODULE_URL.exec(message.trim());
  if (!match) return null;
  try {
    const url = new URL(match[1]);
    return url.origin === origin ? url.href : null;
  } catch {
    return null;
  }
}

// The browser keeps a failed module fetch in its module map, so importing the same URL again fails without asking the
// network. A fresh query makes it a new module that is fetched for real.
export function retry_url(url: string, attempt: number): string {
  const next = new URL(url);
  next.searchParams.set("retry", String(attempt));
  return next.href;
}
