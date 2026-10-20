import { z } from "zod";
import { define_command } from "$lib/core/api/services/shell/define";
import type { ShellContribution } from "$lib/core/api/services/shell/type";

const logic = () => import("./shell");

export default {
  values: {
    "shopping-list": {
      columns: ["name", "left", "in_cart"],
      text: (list) => `${list.name}: ${list.left} left, ${list.in_cart} in the cart`,
      open: (list) => void logic().then((m) => m.open_list(String(list.id))),
    },
    "shopping-item": {
      columns: ["list", "amount", "item", "in_cart"],
      text: (item) => `${item.in_cart ? "[x]" : "[ ]"} ${item.amount ? `${item.amount} ` : ""}${item.item}`,
      cell: (item, column) => (column === "in_cart" ? (item.in_cart ? "yes" : "") : String(item[column])),
      open: (item) => void logic().then((m) => m.open_list(String(item.list_id))),
    },
  },
  commands: [
    define_command({
      id: "list ls",
      description: "Shopping lists, with how many items are left to buy on each",
      ai: "read",
      yields: "shopping-list",
      run: async () => (await logic()).lists(),
    }),
    define_command({
      id: "list items",
      description: "What's on a shopping list (all lists when none is named): items to buy, then those in the cart",
      ai: "read",
      args: z.object({ list: z.string().optional().describe("List name, like Groceries") }),
      positional: ["list"],
      yields: "shopping-item",
      run: async (context) => (await logic()).items(context),
    }),
  ],
} satisfies ShellContribution;
