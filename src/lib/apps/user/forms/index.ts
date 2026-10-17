import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { FORMS_PROPS } from "./props";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "forms",
  name: "Forms",
  icon: AppIcon,
  version: "1.0.0",
  category: AppCategory.PRODUCTIVITY,
  description: "Write a form as a Markdown checklist, send it as a link and collect the answers people send back.",
  keywords: ["form", "survey", "poll", "questionnaire", "checklist", "answers", "feedback", "link", "formlink"],
  associations: [".form.md", ".answers"],
  props: FORMS_PROPS,
  defaults: { constraints: { width: { min: 340 }, height: { min: 360 } } },
  shell: () => import("./commands"),
  highlights: () => import("./highlights"),
  component: () => import("./forms.app.svelte"),
});
