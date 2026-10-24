import { app_name } from "./app-names";
import { browser_label, type Browser } from "./browser";
import { fixed_by_update, next_dismissed, problems, requirement, Status, type CompatResult } from "./check";
import { Level, LEVEL_LABELS, LEVELS } from "./features";
import { read_dismissed, write_dismissed } from "./storage";

export interface CompatScreenOptions {
  results: CompatResult[];
  browser: Browser;
  /** The app of a solo link, which the results are already scoped to. */
  app: string | null;
  /** Why WebOS itself failed to load, after Try anyway. */
  error?: string;
  on_continue(): void;
}

export const SCREEN_ID = "compat-screen";

// Brand Dark as hex: the screen is for old engines, and Firefox before 113 drops `oklch()`. Same colours as the tokens.
const STYLE = `
#${SCREEN_ID}{--bg:#17252c;--surface:#1d2e36;--line:#2a404a;--fg:#b1aba8;--primary:#a4b483;--focus:#e3f9b2;--warning:#e49b39;--error:#f88876;
position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;overflow-y:auto;overscroll-behavior:contain;background:var(--bg);color:var(--fg);
font:14px/1.45 Inter,ui-sans-serif,system-ui,sans-serif;-webkit-text-size-adjust:100%}
#${SCREEN_ID} *{box-sizing:border-box}
#${SCREEN_ID} .c-main{flex:1 0 auto;width:100%;max-width:44rem;margin:0 auto;padding:max(24px,env(safe-area-inset-top)) calc(16px + env(safe-area-inset-right)) 24px calc(16px + env(safe-area-inset-left))}
#${SCREEN_ID} header{display:grid;gap:8px;padding:16px 0 8px}
#${SCREEN_ID} h1{margin:8px 0 0;font-size:22px;line-height:1.25;font-weight:650;color:var(--fg)}
#${SCREEN_ID} h2{display:flex;align-items:baseline;gap:8px;margin:28px 0 8px;font-size:13px;font-weight:600;letter-spacing:.02em;text-transform:uppercase}
#${SCREEN_ID} h2 span{font-weight:400;opacity:.65}
#${SCREEN_ID} p{margin:0}
#${SCREEN_ID} .c-browser{justify-self:start;padding:2px 8px;border-radius:6px;background:var(--surface);font:12px/1.6 Hack,ui-monospace,monospace}
#${SCREEN_ID} .c-muted{opacity:.65}
#${SCREEN_ID} .c-error{margin-top:16px;padding:12px;border-radius:8px;background:var(--surface);color:var(--error);font:13px/1.5 Hack,ui-monospace,monospace;overflow-wrap:anywhere}
#${SCREEN_ID} ul{display:grid;gap:1px;margin:0;padding:0;list-style:none;border-radius:12px;overflow:hidden;background:var(--line)}
#${SCREEN_ID} li{display:grid;gap:4px;padding:12px 16px;background:var(--surface)}
#${SCREEN_ID} .c-head{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:4px 12px}
#${SCREEN_ID} .c-name{font-weight:600;font-size:15px}
#${SCREEN_ID} .c-badge{padding:1px 6px;border-radius:4px;font-size:12px;font-weight:500;white-space:nowrap;border:1px solid currentColor}
#${SCREEN_ID} .c-missing{color:var(--error)}
#${SCREEN_ID} .c-outdated{color:var(--warning)}
#${SCREEN_ID} .c-need{font-size:13px;color:var(--primary)}
#${SCREEN_ID} footer{position:sticky;bottom:0;padding:12px env(safe-area-inset-right) max(12px,env(safe-area-inset-bottom)) env(safe-area-inset-left);background:var(--bg);border-top:1px solid var(--line)}
#${SCREEN_ID} .c-footer{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px 16px;max-width:44rem;margin:0 auto;padding:0 16px}
#${SCREEN_ID} label{display:flex;align-items:center;gap:10px;min-height:44px;cursor:pointer}
#${SCREEN_ID} input{width:20px;height:20px;margin:0;accent-color:var(--primary)}
#${SCREEN_ID} button{min-height:44px;padding:0 20px;border:0;border-radius:8px;background:var(--primary);color:var(--bg);font:inherit;font-weight:600;cursor:pointer}
#${SCREEN_ID} button:hover{opacity:.85}
#${SCREEN_ID} button:active{opacity:.7}
#${SCREEN_ID} :focus-visible{outline:2px solid var(--focus);outline-offset:2px}
@media (max-width:480px){#${SCREEN_ID} .c-footer button{flex:1}}
`;

function element<K extends keyof HTMLElementTagNameMap>(tag: K, class_name?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (class_name) node.className = class_name;
  if (text !== undefined) node.textContent = text;
  return node;
}

function title_of(wrong: CompatResult[]): string {
  if (wrong.length === 0) return "Everything WebOS uses works here";
  if (wrong.some((result) => result.feature.level === Level.START && result.status === Status.MISSING)) {
    return "WebOS probably won't start in this browser";
  }
  return "Some things won't work in this browser";
}

function lead_of(wrong: CompatResult[], total: number, browser: Browser): string {
  if (wrong.length === 0) return `All ${total} features it checks for are supported.`;
  const missing = wrong.filter((result) => result.status === Status.MISSING).length;
  const outdated = wrong.length - missing;
  const parts = [];
  if (missing > 0) parts.push(`${missing} ${missing === 1 ? "feature is" : "features are"} missing`);
  if (outdated > 0) parts.push(`${outdated} may misbehave in this version`);
  const fixable = wrong.filter((result) => fixed_by_update(result, browser)).length;
  const fix = fixable === 0 ? "" : fixable === wrong.length ? " Updating the browser fixes them." : ` Updating the browser fixes ${fixable} of them.`;
  return `${parts.join(" and ")}.${fix}`;
}

function row(result: CompatResult, browser: Browser): HTMLLIElement {
  const { feature } = result;
  const item = element("li");
  const head = element("div", "c-head");
  head.append(
    element("span", "c-name", feature.name),
    result.status === Status.MISSING ? element("span", "c-badge c-missing", "Missing") : element("span", "c-badge c-outdated", "May misbehave")
  );
  item.append(head, element("p", undefined, feature.lost));
  if (feature.apps?.length) item.append(element("p", "c-muted", `Apps: ${feature.apps.map(app_name).join(", ")}`));
  item.append(element("p", "c-need", requirement(feature, browser)));
  return item;
}

/** Draws the warning over everything, in plain DOM: Svelte and the shell may be what's broken. Returns a remover. */
export function show_compat_screen(options: CompatScreenOptions): () => void {
  const { results, browser, app, error } = options;
  document.getElementById(SCREEN_ID)?.remove();
  const wrong = problems(results);
  const start_missing = wrong.some((result) => result.feature.level === Level.START && result.status === Status.MISSING);

  const root = element("div");
  root.id = SCREEN_ID;
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-labelledby", `${SCREEN_ID}-title`);

  const style = element("style", undefined, STYLE);
  const main = element("div", "c-main");
  const header = element("header");
  const logo = element("img");
  logo.src = `${import.meta.env.BASE_URL}logo.svg`;
  logo.alt = "lilBunnyRabbit";
  logo.width = logo.height = 48;
  const title = element("h1", undefined, title_of(wrong));
  title.id = `${SCREEN_ID}-title`;
  const label = browser_label(browser);
  header.append(logo, title, element("p", "c-browser", app ? `${app_name(app)} · ${label}` : label), element("p", "c-muted", lead_of(wrong, results.length, browser)));
  if (error) header.append(element("p", "c-error", `WebOS couldn't load: ${error}`));
  main.append(header);

  for (const level of LEVELS) {
    const group = wrong.filter((result) => result.feature.level === level);
    if (group.length === 0) continue;
    const heading = element("h2", undefined, LEVEL_LABELS[level]);
    heading.append(element("span", undefined, String(group.length)));
    const list = element("ul");
    list.append(...group.map((result) => row(result, browser)));
    main.append(heading, list);
  }

  const footer = element("footer");
  const inner = element("div", "c-footer");
  const remember = element("label");
  const checkbox = element("input");
  checkbox.type = "checkbox";
  remember.append(checkbox, "Don't show again");
  const button = element("button", undefined, start_missing ? "Try anyway" : "Continue anyway");
  button.type = "button";
  if (wrong.length > 0) inner.append(remember);
  inner.append(button);
  footer.append(inner);

  const remove = () => {
    document.removeEventListener("keydown", on_key);
    root.remove();
  };
  const go = () => {
    if (checkbox.checked) write_dismissed(next_dismissed(read_dismissed(), results, app !== null));
    remove();
    options.on_continue();
  };
  const on_key = (event: KeyboardEvent) => {
    if (event.key === "Escape") go();
  };
  button.addEventListener("click", go);
  document.addEventListener("keydown", on_key);

  root.append(style, main, footer);
  document.body.append(root);
  button.focus();
  return remove;
}
