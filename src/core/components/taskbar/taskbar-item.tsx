import { cn } from "@/core/lib/utils";
import { isNonNullable } from "@lilbunnyrabbit/utils";

interface TaskbarItemProps extends React.ComponentProps<"button"> {
  isFocused?: boolean;
  isMinimized?: boolean;
}

export const TaskbarItem = ({ isFocused, isMinimized, className, ...props }: TaskbarItemProps) => {
  return (
    <button
      className={cn(
        "group relative flex justify-center items-center rounded-sm transition-all duration-150 min-w-0 flex-shrink-0 w-10 h-10 hover:bg-foreground/10 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:size-6 data-[state=open]:bg-primary/10",
        isFocused && !isMinimized && "text-primary",
        isNonNullable(isMinimized) && !isMinimized && "bg-primary/10",
        className
      )}
      {...props}
    />
  );
};
