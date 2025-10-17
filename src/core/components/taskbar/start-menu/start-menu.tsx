import { cn } from "@/core/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from "@radix-ui/react-dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import React, { useState } from "react";
import { StartMenuContent } from "./start-menu-content";

// TODO: Styling

export function StartMenu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>

      <DialogPortal>
        <DialogOverlay className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-background/80" />

        <DialogContent
          className={cn(
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-4xl h-[60dvh] translate-x-[-50%] translate-y-[-50%] gap-4 duration-200 overflow-hidden",
            "p-0 bg-foreground rounded-lg border-2 border-foreground shadow-2xl"
          )}
        >
          <VisuallyHidden>
            <DialogTitle data-slot="dialog-title">Start Menu</DialogTitle>
            <DialogDescription data-slot="dialog-description">Search for an application to open.</DialogDescription>
          </VisuallyHidden>

          <StartMenuContent onClose={() => setOpen(false)} />
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}
