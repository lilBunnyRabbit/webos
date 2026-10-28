import type { AppHighlight } from "$lib/core/api/services/apps/type";
import { Handshake as HandshakeIcon, Package as PackageIcon, Receipt as ReceiptIcon, Siren as SirenIcon } from "phosphor-svelte";

export default [
  { icon: ReceiptIcon, title: "Type the list", text: "Type each price and press Enter. You only find out if you got it right when you give the total." },
  { icon: HandshakeIcon, title: "Keep their trust", text: "Customers have names and remember your change. Trusted regulars come back with party orders." },
  { icon: SirenIcon, title: "Mind the police", text: "Short-change a doubtful customer twice and the police watch you type blind. A slip means jail." },
  { icon: PackageIcon, title: "Close up", text: "Warm up before each shift, pay the bills, and restock the shelves by their codes." },
] satisfies AppHighlight[];
