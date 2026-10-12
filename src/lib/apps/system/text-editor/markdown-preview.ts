import type { Theme } from "$lib/core/api/services/settings/type";

export const SCROLL_MESSAGE = "text-editor:scroll";

export async function render_markdown(text: string): Promise<string> {
  const { marked } = await import("marked");
  return marked.parse(text, { gfm: true, async: false });
}

/**
 * The preview runs in a sandboxed frame with an opaque origin, so nothing in the file can reach WebOS. The CSP only
 * lets our nonce'd script run: `<script>` and `on*=` handlers from the Markdown stay dead. The script restores the
 * scroll position across re-renders and reports it back.
 */
export function preview_document(body: string, theme: Theme, scroll_y: number, nonce: string): string {
  const vars = Object.entries(theme)
    .map(([key, value]) => `--${key.replaceAll("_", "-")}:${value}`)
    .join(";");
  const csp = `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; img-src data: blob: https:`;
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<base target="_blank">
<style>:root{${vars}}${PROSE}</style>
</head><body>${body}
<script nonce="${nonce}">
scrollTo(0, ${Math.max(0, Math.round(scroll_y))});
addEventListener("scroll", () => parent.postMessage({ type: "${SCROLL_MESSAGE}", y: scrollY }, "*"), { passive: true });
</script></body></html>`;
}

const PROSE = `
*,*::before,*::after{box-sizing:border-box}
html{color-scheme:light dark;background:var(--background)}
body{margin:0 auto;max-width:72ch;padding:1.25rem 1.5rem 3rem;color:var(--foreground);font:0.875rem/1.65 Inter,ui-sans-serif,system-ui,sans-serif;overflow-wrap:anywhere}
h1,h2,h3,h4,h5,h6{line-height:1.25;margin:1.6em 0 0.6em;font-weight:600}
h1{font-size:1.6rem}h2{font-size:1.3rem;padding-bottom:0.3em;border-bottom:1px solid color-mix(in oklch,var(--foreground) 10%,transparent)}h3{font-size:1.1rem}h4,h5,h6{font-size:1rem}
body>:first-child{margin-top:0}
p,ul,ol,blockquote,pre,table{margin:0 0 1em}
ul,ol{padding-left:1.5em}li+li{margin-top:0.25em}
li:has(>input[type=checkbox]){list-style:none;margin-left:-1.4em}
input[type=checkbox]{accent-color:var(--primary);margin:0 0.4em 0 0;vertical-align:-0.1em}
a{color:var(--primary);text-underline-offset:2px}
strong{font-weight:600}
code,pre{font-family:Hack,ui-monospace,monospace;font-size:0.8125rem}
code{background:color-mix(in oklch,var(--foreground) 8%,transparent);padding:0.1em 0.35em;border-radius:0.3rem}
pre{background:var(--background-dark);padding:0.75rem 1rem;border-radius:0.5rem;overflow:auto;line-height:1.5}
pre code{background:none;padding:0}
blockquote{margin-left:0;padding:0.1em 1em;border-left:3px solid color-mix(in oklch,var(--primary) 50%,transparent);color:color-mix(in oklch,var(--foreground) 80%,transparent)}
hr{border:0;border-top:1px solid color-mix(in oklch,var(--foreground) 12%,transparent);margin:2em 0}
table{border-collapse:collapse;display:block;overflow:auto}
th,td{border:1px solid color-mix(in oklch,var(--foreground) 12%,transparent);padding:0.35em 0.7em;text-align:left}
th{background:var(--background-light);font-weight:600}
img{max-width:100%}
::selection{background:color-mix(in oklch,var(--primary) 28%,transparent)}
`;
