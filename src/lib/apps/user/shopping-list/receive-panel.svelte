<script lang="ts">
  import { Button } from "$lib/core/components/ui";
  import { QrCollect } from "$kit/components/qr-transfer";
  import { parse_frame } from "$kit/utils/qr-transfer";
  import { get_app_context } from "$lib/core/contexts/app";
  import { read_share, SHARE_APP, type Share } from "./share";

  let { onreceive, oncancel }: { onreceive: (share: Share) => void; oncancel: () => void } = $props();

  const { window: win } = get_app_context();

  function foreign(text: string): string | null {
    const frame = parse_frame(text);
    return frame ? "Those codes are for another app. Open it there." : null;
  }
</script>

<section aria-label="Receive lists" class="mx-auto flex h-full w-full max-w-md flex-col">
  <div class="flex min-h-0 flex-1 flex-col items-center gap-4 overflow-auto p-4 text-center">
    <div class="flex flex-col gap-1">
      <p class="text-sm font-medium">Scan the other phone's codes</p>
      <p class="text-ui text-foreground/65">On it: Shopping List › Share…. You'll see every change before anything is saved.</p>
    </div>
    <QrCollect app={SHARE_APP} label="Camera for share codes" {foreign} visible={() => win.is_visible} onpayload={(payload) => onreceive(read_share(payload))} />
  </div>
  <div class="flex items-center justify-end gap-2 border-t border-foreground/8 bg-background-light px-4 py-3">
    <Button variant="quiet" onclick={oncancel}>Cancel</Button>
  </div>
</section>
