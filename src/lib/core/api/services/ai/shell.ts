import { z } from "zod";
import { error_message } from "$lib/core/utils";
import { arg } from "../shell/arg";
import { define_command } from "../shell/define";
import { ShellError, type CommandContext, type ShellContribution, type Tagged } from "../shell/type";
import { to_text } from "../shell/values";
import { is_file_value } from "../files/shell";
import { resolve_path } from "../files/path";
import type { FilesService } from "../files/type";
import { AiAvailability, SUMMARY_LENGTHS, SUMMARY_TYPES, type AiFeature, type AiService } from "./type";

export const LANGUAGE_KIND = "language";

// What Chrome's translator offered when this was written; `availability` has the final word per pair.
export const LANGUAGES = [
  "ar", "bg", "bn", "cs", "da", "de", "el", "en", "es", "fi", "fr", "he", "hi", "hr", "hu", "id", "it", "ja", "kn", "ko",
  "lt", "mr", "nl", "no", "pl", "pt", "ro", "ru", "sk", "sl", "sv", "ta", "te", "th", "tr", "uk", "vi", "zh", "zh-Hant",
];

export interface LanguageValue extends Tagged {
  $type: "language";
  language: string;
  name: string;
  confidence: number;
  of: string;
}

export function language_name(code: string): string {
  if (code === "und") return "Unknown";
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}

const percent = (value: number) => `${Math.round(value * 100)}%`;

interface Source {
  of: string;
  text: string;
}

/** The given files, else the given words as one text; piped, each file plus everything else joined as one text. */
async function sources(
  command: string,
  inputs: string[],
  context: CommandContext<unknown>,
  files: FilesService | null
): Promise<Source[]> {
  const read = async (path: string): Promise<Source> => {
    const file = await files?.get_file(path).catch(() => null);
    if (!file) throw new ShellError(`${command}: ${path}: no such file`);
    return { of: file.name, text: await file.text() };
  };

  let found: Source[];
  if (inputs.length > 0 || !context.piped) {
    if (inputs.length === 0) throw new ShellError(`${command}: give a file or text, or pipe some in`);
    const paths = inputs.map((input) => resolve_path(context.session.cwd, input));
    const exists = await Promise.all(paths.map((path) => files?.get_file(path).catch(() => null)));
    // `summarize hello world` reads the words, unless files of those names are there.
    found = exists.every((file) => !file) ? [{ of: "text", text: inputs.join(" ") }] : await Promise.all(paths.map(read));
  } else {
    const texts: string[] = [];
    found = [];
    for await (const value of context.input) {
      if (!is_file_value(value)) texts.push(to_text(value, () => undefined));
      else if (value.kind === "directory") throw new ShellError(`${command}: ${value.path} is a folder`);
      else found.push(await read(value.path));
    }
    if (texts.length > 0) found.unshift({ of: "input", text: texts.join("\n") });
  }

  const empty = found.find((source) => !source.text.trim());
  if (empty) throw new ShellError(`${command}: ${empty.of} has no text`);
  return found;
}

async function each<T>(command: string, list: Source[], work: (source: Source) => Promise<T>): Promise<T[]> {
  const results: T[] = [];
  for (const source of list) {
    try {
      results.push(await work(source));
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      throw new ShellError(`${command}: ${list.length > 1 ? `${source.of}: ` : ""}${error_message(error)}`);
    }
  }
  return results;
}

const labelled = (list: Source[], results: string[]) =>
  results.map((result, index) => (list.length > 1 ? `${list[index].of}\n${result}` : result));

export function ai_shell(ai: AiService, files: () => FilesService | null): ShellContribution {
  const available = (feature: AiFeature) => () =>
    ai.features[feature] !== AiAvailability.NO || "needs Chrome's built-in AI on a desktop";
  const inputs = () => z.array(arg.path()).default([]).describe("Files or text, or what's piped in");

  return {
    commands: [
      define_command({
        id: "summarize",
        description: "Summarize text or files on this device",
        args: z.object({
          inputs: inputs(),
          type: z.enum(SUMMARY_TYPES).default("key-points").describe("tldr, key-points, teaser or headline"),
          length: z.enum(SUMMARY_LENGTHS).default("short").describe("short, medium or long"),
        }),
        positional: ["inputs"],
        available: available("summarize"),
        async *run(context) {
          const { args, signal } = context;
          const list = await sources("summarize", args.inputs, context, files());
          const results = await each("summarize", list, (source) =>
            ai.summarize(source.text, { type: args.type, length: args.length, signal })
          );
          yield* labelled(list, results);
        },
      }),
      define_command({
        id: "translate",
        description: "Translate text or files on this device",
        args: z.object({
          inputs: inputs(),
          to: arg.kind(LANGUAGE_KIND).describe("Language to translate into, like de or sl"),
          from: arg.kind(LANGUAGE_KIND).optional().describe("The text's language, detected by default"),
        }),
        positional: ["inputs"],
        available: available("translate"),
        async *run(context) {
          const { args, signal } = context;
          const list = await sources("translate", args.inputs, context, files());
          const results = await each("translate", list, (source) =>
            ai.translate(source.text, { to: args.to, from: args.from, signal })
          );
          yield* labelled(list, results);
        },
      }),
      define_command({
        id: "lang",
        description: "Which language text or files are in",
        args: z.object({ inputs: inputs() }),
        positional: ["inputs"],
        yields: "language",
        available: available("detect"),
        async *run(context) {
          const list = await sources("lang", context.args.inputs, context, files());
          const results = await each("lang", list, (source) => ai.detect(source.text, { signal: context.signal }));
          for (const [index, ranked] of results.entries()) {
            const top = ranked[0] ?? { language: "und", confidence: 0 };
            yield {
              $type: "language",
              language: top.language,
              name: language_name(top.language),
              confidence: top.confidence,
              of: list[index].of,
            } satisfies LanguageValue;
          }
        },
      }),
    ],
    completers: {
      [LANGUAGE_KIND]: () => LANGUAGES.map((code) => ({ value: code, detail: language_name(code) })),
    },
    values: {
      language: {
        columns: ["language", "name", "confidence", "of"],
        cell: (value, column) => (column === "confidence" ? percent(Number(value.confidence)) : String(value[column] ?? "")),
        text: (value) => `${String(value.name)} (${String(value.language)}), ${percent(Number(value.confidence))}`,
      },
    },
  };
}

