"use client";

/**
 * Lightweight toast: no external lib. Single global subject, mounted once via
 * <ToastViewport />. Consumers call `toast.success()` / `toast.error()` /
 * `toast.info()`.
 */

import { useEffect, useState } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastKind = "success" | "error" | "info";

interface ToastEntry {
  id: number;
  kind: ToastKind;
  message: string;
}

type Listener = (entry: ToastEntry) => void;

let nextId = 1;
const listeners = new Set<Listener>();

function emit(kind: ToastKind, message: string) {
  const entry: ToastEntry = { id: nextId++, kind, message };
  listeners.forEach((l) => l(entry));
}

export const toast = {
  success: (m: string) => emit("success", m),
  error: (m: string) => emit("error", m),
  info: (m: string) => emit("info", m),
};

const KIND_STYLES: Record<ToastKind, string> = {
  success: "bg-green-500/10 border-green-500/30 text-green-300",
  error: "bg-red-500/10 border-red-500/30 text-red-300",
  info: "bg-[var(--accent-indigo)]/10 border-[var(--accent-indigo)]/30 text-[var(--accent-indigo)]",
};

const KIND_ICONS: Record<ToastKind, React.ComponentType<{ className?: string }>> = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
};

export function ToastViewport() {
  const [items, setItems] = useState<ToastEntry[]>([]);

  useEffect(() => {
    const listener: Listener = (entry) => {
      setItems((prev) => [...prev, entry]);
      const ttl = entry.kind === "error" ? 6000 : 3500;
      window.setTimeout(() => {
        setItems((prev) => prev.filter((p) => p.id !== entry.id));
      }, ttl);
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      {items.map((entry) => {
        const Icon = KIND_ICONS[entry.kind];
        return (
          <div
            key={entry.id}
            className={cn(
              "pointer-events-auto flex items-start gap-2 rounded-lg border px-3 py-2 backdrop-blur-md shadow-lg max-w-sm animate-[slideIn_.18s_ease-out]",
              KIND_STYLES[entry.kind]
            )}
            role="status"
          >
            <Icon className="h-4 w-4 mt-0.5 shrink-0" />
            <p className="text-sm leading-snug flex-1">{entry.message}</p>
            <button
              onClick={() =>
                setItems((prev) => prev.filter((p) => p.id !== entry.id))
              }
              className="text-current opacity-60 hover:opacity-100 transition-opacity shrink-0"
              aria-label="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
