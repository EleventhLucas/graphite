import { forwardRef, type ButtonHTMLAttributes, type PropsWithChildren } from "react";
import { cn } from "../lib/cn";

type ButtonProps = PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: "default" | "ghost" | "danger";
    size?: "default" | "icon";
  }
>;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex h-8 items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30 disabled:pointer-events-none disabled:opacity-45",
        variant === "default" &&
          "border-border bg-accent text-accent-foreground hover:bg-foreground/10",
        variant === "ghost" && "border-transparent bg-transparent hover:bg-accent",
        variant === "danger" && "border-red-500/30 bg-red-500/10 text-red-600 hover:bg-red-500/20",
        size === "icon" && "w-8 px-0",
        className,
      )}
      type="button"
      {...props}
    />
  ),
);
Button.displayName = "Button";
