import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "../lib/cn";

// Native button variants adapted from refs/t3code/apps/web/src/components/ui/button.tsx
// (MIT, T3 Tools Inc., 6bc6cb6). Base UI useRender omitted.

const buttonVariants = cva(
  "relative inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-[var(--control-radius)] border font-medium text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    defaultVariants: {
      size: "default",
      variant: "default",
    },
    variants: {
      size: {
        default: "h-8 px-3",
        icon: "size-8",
        "icon-sm": "size-7",
        sm: "h-7 px-2.5 text-xs",
      },
      variant: {
        default: "border-primary bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "border-transparent bg-destructive/15 text-destructive hover:bg-destructive/25",
        ghost: "border-transparent text-foreground hover:bg-accent",
        outline: "border-border bg-transparent text-foreground hover:bg-accent",
      },
    },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, size, type = "button", variant, ...props },
  ref,
) {
  return <button ref={ref} className={cn(buttonVariants({ className, size, variant }))} type={type} {...props} />;
});
