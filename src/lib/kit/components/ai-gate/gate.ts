import { AiAvailability } from "$lib/core/api/services/ai/type";

export function combine(answers: AiAvailability[]): AiAvailability {
  if (answers.includes(AiAvailability.NO)) return AiAvailability.NO;
  if (answers.includes(AiAvailability.DOWNLOAD)) return AiAvailability.DOWNLOAD;
  return AiAvailability.READY;
}
