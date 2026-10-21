import type { AppHighlight } from "$lib/core/api/services/apps/type";
import { ImageSquare as ImageSquareIcon, ListChecks as ListChecksIcon, PaperPlaneTilt as PaperPlaneTiltIcon, Scribble as ScribbleIcon } from "phosphor-svelte";

export default [
  { icon: ListChecksIcon, title: "Guided pitch", text: "Eight short sections ask about the problem, the picture, files, phones and the name, so an idea arrives ready." },
  { icon: ImageSquareIcon, title: "Pictures in the words", text: "Paste, drop or snap a picture straight into a sentence; tap it to make it full width." },
  { icon: ScribbleIcon, title: "Quick sketches", text: "Draw a rough layout with a pen and an eraser and drop it into the text." },
  { icon: PaperPlaneTiltIcon, title: "One file to send", text: "Send the whole notebook or just one proposal as a Markdown file anyone can read." },
] satisfies AppHighlight[];
