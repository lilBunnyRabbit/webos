import {
  At as AtIcon,
  Briefcase as BriefcaseIcon,
  ChatCircleDots as ChatCircleDotsIcon,
  ChatsCircle as ChatsCircleIcon,
  Hash as HashIcon,
  UsersThree as UsersThreeIcon,
} from "phosphor-svelte";
import type { IconComponent } from "$lib/core/components/ui";
import type { PlatformReport } from "./checks";
import type { Platform } from "./platforms";

export const PLATFORM_ICONS: Record<Platform, IconComponent> = {
  slack: HashIcon,
  twitter: AtIcon,
  facebook: UsersThreeIcon,
  discord: ChatsCircleIcon,
  linkedin: BriefcaseIcon,
  imessage: ChatCircleDotsIcon,
};

export interface Verdict {
  tone: "success" | "warning" | "error";
  label: string;
}

export function verdict(report: PlatformReport): Verdict {
  if (!report.will_unfurl) return { tone: "error", label: report.score.fail === 1 ? "1 blocking" : `${report.score.fail} blocking` };
  if (!report.looks_good) return { tone: "warning", label: report.score.warn === 1 ? "1 warning" : `${report.score.warn} warnings` };
  return { tone: "success", label: "Looks good" };
}
