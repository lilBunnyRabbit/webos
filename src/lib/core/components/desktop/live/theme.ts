import type { ThemeToken } from "$lib/core/api/services/settings/type";

/**
 * Token values a canvas can use. A token may be relative colour syntax over other variables
 * (`oklch(from var(--primary) …)`), which a canvas can't parse, so each one is resolved through a probe's computed colour.
 */
export function read_tokens<T extends ThemeToken>(tokens: readonly T[]): Record<T, string> {
  const probe = document.createElement("span");
  probe.style.display = "none";
  document.body.append(probe);
  const colours = {} as Record<T, string>;
  for (const token of tokens) {
    probe.style.color = `var(--${token.replaceAll("_", "-")})`;
    colours[token] = getComputedStyle(probe).color;
  }
  probe.remove();
  return colours;
}

/** Calls `onchange` after the theme's variables on `<html>` change, whoever wrote them. */
export function watch_theme(onchange: () => void): () => void {
  const observer = new MutationObserver(onchange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["style"] });
  return () => observer.disconnect();
}
