import type { LanguageSupport } from "@codemirror/language";
import { file_extension } from "$lib/core/api/services/apps/associations";

export const Language = {
  JAVASCRIPT: "javascript",
  TYPESCRIPT: "typescript",
  JSON: "json",
  MARKDOWN: "markdown",
  CSS: "css",
  HTML: "html",
  YAML: "yaml",
} as const;
export type Language = (typeof Language)[keyof typeof Language];

const BY_EXTENSION: Record<string, Language> = {
  ".js": Language.JAVASCRIPT,
  ".mjs": Language.JAVASCRIPT,
  ".cjs": Language.JAVASCRIPT,
  ".jsx": Language.JAVASCRIPT,
  ".ts": Language.TYPESCRIPT,
  ".mts": Language.TYPESCRIPT,
  ".tsx": Language.TYPESCRIPT,
  ".json": Language.JSON,
  ".md": Language.MARKDOWN,
  ".markdown": Language.MARKDOWN,
  ".css": Language.CSS,
  ".html": Language.HTML,
  ".htm": Language.HTML,
  ".yaml": Language.YAML,
  ".yml": Language.YAML,
};

/** `null` = plain text (Svelte, TOML, INI, `.env`, logs, anything unknown). */
export function language_for(name: string): Language | null {
  return BY_EXTENSION[file_extension(name)] ?? null;
}

/** Each language package is its own chunk, loaded the first time a file needs it. */
export async function load_language(language: Language): Promise<LanguageSupport> {
  switch (language) {
    case Language.JAVASCRIPT:
      return (await import("@codemirror/lang-javascript")).javascript({ jsx: true });
    case Language.TYPESCRIPT:
      return (await import("@codemirror/lang-javascript")).javascript({ typescript: true, jsx: true });
    case Language.JSON:
      return (await import("@codemirror/lang-json")).json();
    case Language.MARKDOWN:
      return (await import("@codemirror/lang-markdown")).markdown();
    case Language.CSS:
      return (await import("@codemirror/lang-css")).css();
    case Language.HTML:
      return (await import("@codemirror/lang-html")).html();
    case Language.YAML:
      return (await import("@codemirror/lang-yaml")).yaml();
  }
}
