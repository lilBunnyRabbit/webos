import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { Wrench as WrenchIcon } from "phosphor-svelte";

export default define_app({
  id: "dev-tools",
  name: "Dev Tools",
  icon: WrenchIcon,
  version: "1.0.0",
  description: "Base64, hashes, URL encoding, UUIDs, regex and JSON in one place.",
  keywords: [
    "base64",
    "hash",
    "sha",
    "url",
    "uuid",
    "regex",
    "json",
    "encode",
    "decode",
    "format",
    "developer",
    "programming",
    "tools",
  ],
  category: AppCategory.DEVELOPER,
  defaults: { constraints: { width: { min: 320 }, height: { min: 320 } } },
  component: () => import("./dev-tools.app.svelte"),
});
