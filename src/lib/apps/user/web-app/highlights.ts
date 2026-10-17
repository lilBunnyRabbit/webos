import type { AppHighlight } from "$lib/core/api/services/apps/type";
import { AppWindow as AppWindowIcon, ArrowSquareOut as ArrowSquareOutIcon, Desktop as DesktopIcon } from "phosphor-svelte";

export default [
  { icon: DesktopIcon, title: "Sites on the desktop", text: "Add a web address and it becomes a .webapp icon, named after the site." },
  { icon: AppWindowIcon, title: "A window of its own", text: "Each site opens in its own window with its name and icon, ready to reload or copy." },
  { icon: ArrowSquareOutIcon, title: "When a site says no", text: "Some sites refuse to be shown inside other pages; one click opens them in a browser tab instead." },
] satisfies AppHighlight[];
