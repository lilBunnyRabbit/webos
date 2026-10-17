import type { AppHighlight } from "$lib/core/api/services/apps/type";
import { Lightbulb as LightbulbIcon, QrCode as QrCodeIcon, ShieldCheck as ShieldCheckIcon, WifiHigh as WifiHighIcon } from "phosphor-svelte";

export default [
  { icon: QrCodeIcon, title: "Make QR codes", text: "Text, links, contacts, email, phone numbers and Slovenian UPN payments." },
  { icon: WifiHighIcon, title: "Wi-Fi in one scan", text: "Guests point their camera at the code and join your network." },
  { icon: ShieldCheckIcon, title: "Checked before you save", text: "Every code is read back, so you know it scans, then saved as PNG or SVG." },
  { icon: LightbulbIcon, title: "How it works", text: "Watch your text become bits, error correction and a masked grid of modules." },
] satisfies AppHighlight[];
