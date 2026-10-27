import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { FILE_PROPS } from "$lib/core/api/services/apps/helpers";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "warren",
  name: "Warren",
  icon: AppIcon,
  meta: () => import("./meta"),
  category: AppCategory.PRODUCTIVITY,
  associations: [".warren", ".docx"],
  tools: [".md", ".markdown", "text/markdown"],
  props: FILE_PROPS,
  highlights: () => import("./highlights"),
  defaults: { constraints: { width: { min: 340 }, height: { min: 400 } } },
  achievements: [
    { id: "first-save", title: "First draft", text: "Save a document." },
    { id: "goal", title: "On target", text: "Save a document that meets its word goal." },
    { id: "pdf", title: "Hot off the press", text: "Print a document or save it as a PDF." },
    { id: "words-10000", title: "Tome", text: "Save a document of 10,000 words.", goal: 10000 },
  ],
  shell: () => import("./commands"),
  component: () => import("./warren.app.svelte"),
});
