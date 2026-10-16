import type { AppHighlight } from "$lib/core/api/services/apps/type";
import {
  Archive as ArchiveIcon,
  CalendarCheck as CalendarCheckIcon,
  CheckSquare as CheckSquareIcon,
  HandGrabbing as HandGrabbingIcon,
} from "phosphor-svelte";

export default [
  { icon: HandGrabbingIcon, title: "Drag cards", text: "Drag cards between columns across as many boards as you like." },
  { icon: CheckSquareIcon, title: "Rich cards", text: "Each card holds labels, a checklist and notes with simple formatting." },
  { icon: CalendarCheckIcon, title: "Due dates", text: "Give a card a due day and it shows up in Calendar too." },
  { icon: ArchiveIcon, title: "Archive", text: "Clear finished cards into an archive and restore them any time." },
] satisfies AppHighlight[];
