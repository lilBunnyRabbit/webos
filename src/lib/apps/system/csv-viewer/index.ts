import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
// Not via the barrel: manifests load while the barrel is still initializing, so its constants are not yet defined.
import { FILE_PROPS } from "$lib/core/api/services/apps/helpers";
import { FileCsv as FileCsvIcon } from "phosphor-svelte";

export default define_app({
  id: "csv-viewer",
  name: "CSV Viewer",
  icon: FileCsvIcon,
  version: "1.0.0",
  category: AppCategory.PRODUCTIVITY,
  keywords: ["csv", "tsv", "table", "spreadsheet", "data", "excel", "columns"],
  associations: ["text/csv", "text/tab-separated-values", ".csv", ".tsv"],
  props: FILE_PROPS,
  defaults: {
    constraints: {
      width: { min: 400 },
      height: { min: 300 },
    },
  },
  component: () => import("./csv-viewer.app.svelte"),
});
