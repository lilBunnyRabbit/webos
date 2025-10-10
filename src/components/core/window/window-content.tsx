import { useWindowToolbar } from "@/contexts/window";
import { cn } from "@/lib/utils";
import { Loader } from "lucide-react";
import React from "react";

export function WindowContent({ children, className }: { children: React.ReactNode, className?: string }) {
  const { zoom } = useWindowToolbar();

  return (
    <div className={cn("overflow-hidden bg-background rounded-t-sm", className)}>
      <div
        className="h-full w-full overflow-auto @container"
        style={{
          zoom,
        }}
      >
        <React.Suspense
          fallback={
            <div className="flex items-center justify-center h-full">
              <Loader className="w-8 h-8 animate-spin animation-duration-[2.5s] text-primary" />
            </div>
          }
        >
          {children}
        </React.Suspense>
      </div>
    </div>
  );
}
