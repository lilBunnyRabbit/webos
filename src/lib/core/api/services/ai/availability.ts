import { AiAvailability, AiFeature, type AiMessage, type AiPart, type LanguagePair } from "./type";

export const IMAGE_INPUTS: { type: "text" | "image" }[] = [{ type: "text" }, { type: "image" }];

export function to_availability(answer: BuiltInAvailability): AiAvailability {
  if (answer === "available") return AiAvailability.READY;
  if (answer === "downloadable" || answer === "downloading") return AiAvailability.DOWNLOAD;
  return AiAvailability.NO;
}

/** Without a pair, translate answers for the API alone: pairs report `downloadable` until a site first uses them. */
export async function check(feature: AiFeature, pair?: LanguagePair): Promise<AiAvailability> {
  try {
    switch (feature) {
      case AiFeature.SUMMARIZE:
        return globalThis.Summarizer ? to_availability(await globalThis.Summarizer.availability()) : AiAvailability.NO;
      case AiFeature.DETECT:
        return globalThis.LanguageDetector ? to_availability(await globalThis.LanguageDetector.availability()) : AiAvailability.NO;
      case AiFeature.PROMPT:
        return globalThis.LanguageModel ? to_availability(await globalThis.LanguageModel.availability()) : AiAvailability.NO;
      case AiFeature.PROMPT_IMAGE:
        return globalThis.LanguageModel
          ? to_availability(await globalThis.LanguageModel.availability({ expectedInputs: IMAGE_INPUTS }))
          : AiAvailability.NO;
      case AiFeature.TRANSLATE:
        if (!globalThis.Translator) return AiAvailability.NO;
        if (!pair) return AiAvailability.DOWNLOAD;
        return to_availability(
          await globalThis.Translator.availability({ sourceLanguage: pair.from, targetLanguage: pair.to })
        );
    }
  } catch {
    // An invalid language tag rejects instead of answering "unavailable".
    return AiAvailability.NO;
  }
}

/** `en-US` and `en` are the same language for "already in the target language". */
export const same_language = (a: string, b: string) => a.split("-")[0].toLowerCase() === b.split("-")[0].toLowerCase();

export const has_image = (messages: AiMessage[]) =>
  messages.some(({ content }) => typeof content !== "string" && content.some((part) => part.type === "image"));

// By identity: the same Blob continues a chat, another picture of the same size and type doesn't.
const image_ids = new WeakMap<Blob, number>();
let next_image_id = 0;

function part_key(part: AiPart): [string, string | number] {
  if (part.type === "text") return ["text", part.value];
  let id = image_ids.get(part.value);
  if (id === undefined) image_ids.set(part.value, (id = next_image_id++));
  return ["image", id];
}

export const history_key = (messages: AiMessage[]) =>
  JSON.stringify(
    messages.map(({ role, content }) => [role, typeof content === "string" ? content : content.map(part_key)])
  );
