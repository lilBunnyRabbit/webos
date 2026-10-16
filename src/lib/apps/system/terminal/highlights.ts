import type { AppHighlight } from "$lib/core/api/services/apps/type";
import { Funnel as FunnelIcon, Keyboard as KeyboardIcon, Table as TableIcon, TextColumns as TextColumnsIcon } from "phosphor-svelte";

export default [
  { icon: FunnelIcon, title: "Pipes", text: "Pipe one command into the next, then filter and sort the results with where and sort." },
  { icon: TableIcon, title: "Clickable results", text: "Results come back as tables, and clicking a row opens what it shows." },
  { icon: TextColumnsIcon, title: "Tab completion", text: "Tab completes commands, paths and apps, and your history suggests the rest as you type." },
  { icon: KeyboardIcon, title: "Touch keys", text: "On a touchscreen, a key row adds Tab, Ctrl, arrows and the pipe." },
] satisfies AppHighlight[];
