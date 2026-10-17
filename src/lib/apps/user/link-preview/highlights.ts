import type { AppHighlight } from "$lib/core/api/services/apps/type";
import { Cards as CardsIcon, FileHtml as FileHtmlIcon, ListChecks as ListChecksIcon } from "phosphor-svelte";

export default [
  { icon: CardsIcon, title: "Six previews", text: "How the link looks in Slack, X, Facebook, Discord, LinkedIn and iMessage, side by side." },
  { icon: ListChecksIcon, title: "What to fix", text: "Every platform's checks with the tag to add: missing images, wrong sizes, canonical links that point elsewhere." },
  { icon: FileHtmlIcon, title: "File, paste or URL", text: "Open an HTML file, paste a page's source, or fetch a URL whose server allows it, such as your local dev server." },
] satisfies AppHighlight[];
