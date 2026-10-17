import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { arg } from "$lib/core/api/services/shell/arg";
import { define_command } from "$lib/core/api/services/shell/define";
import { QrCode as QrCodeIcon } from "phosphor-svelte";
import { z } from "zod";

const logic = () => import("./shell");

export default define_app({
  id: "qr-studio",
  name: "QR Studio",
  icon: QrCodeIcon,
  version: "1.0.0",
  description: "Makes QR codes for links, text, Wi-Fi, contacts and UPN payments, and shows step by step how one is built.",
  keywords: ["qr", "qr code", "generator", "barcode", "wifi", "vcard", "contact", "upn", "payment", "encode", "reed solomon"],
  category: AppCategory.UTILITIES,
  props: z.object({ text: z.string().optional() }),
  defaults: { constraints: { width: { min: 340 }, height: { min: 360 } } },
  shell: {
    commands: [
      define_command({
        id: "qr",
        description: "Make a QR code image of text, or of what's piped in",
        args: z.object({
          text: z.array(z.string()).default([]).describe("The text; quote it or give it as words"),
          ecc: z.enum(["L", "M", "Q", "H"]).default("M").describe("Error correction: L 7%, M 15%, Q 25%, H 30%"),
          out: arg.path().optional().describe("A .png or .svg file, or a folder; qr.png in the current folder by default"),
        }),
        positional: ["text"],
        short: { out: "o", ecc: "e" },
        yields: "file",
        run: async (context) => (await logic()).qr(context),
      }),
    ],
  },
  highlights: () => import("./highlights"),
  component: () => import("./qr-studio.app.svelte"),
});
