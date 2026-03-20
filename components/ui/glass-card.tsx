import { cn } from "@/lib/utils";

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  glow?: boolean;
  glowColor?: "orange" | "indigo";
  padding?: boolean;
  as?: "div" | "section" | "article";
  onClick?: () => void;
}

export function GlassCard({
  children,
  className,
  hover = false,
  glow = false,
  glowColor = "orange",
  padding = true,
  as: Component = "div",
  onClick,
}: GlassCardProps) {
  return (
    <Component
      onClick={onClick}
      className={cn(
        "glass rounded-xl transition-all duration-200",
        padding && "p-5",
        hover && "glass-hover cursor-pointer",
        glow && (glowColor === "indigo" ? "glass-glow-indigo" : "glass-glow"),
        className
      )}
    >
      {children}
    </Component>
  );
}
