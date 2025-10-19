import { cn } from "@/core/lib/utils";
import React from "react";

interface DateTimeProps {
  className?: string;
}

export const DateTime = ({ className }: DateTimeProps) => {
  const [now, setNow] = React.useState(() => new Date());

  React.useEffect(() => {
    const interval = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Format time, e.g., "13:05:24" or with locale options if needed
  const time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const date = now.toLocaleDateString([], { month: "short", day: "numeric" });

  return (
    <div className={cn("flex flex-col items-center text-xs tabular-nums leading-tight select-none shrink-0 text-center", className)}>
      <div>{time}</div>
      <div className="opacity-70">{date}</div>
    </div>
  );
};
