import { AiAvailability, AiFeature, type AiMessage, type LanguagePair } from "./type";

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

export const history_key = (messages: AiMessage[]) => JSON.stringify(messages.map(({ role, content }) => [role, content]));
