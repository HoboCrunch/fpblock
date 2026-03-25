"use client";

import { memo, useState, useEffect } from "react";

export const NavTooltip = memo(function NavTooltip({
  label,
  show,
  anchorRef,
}: {
  label: string;
  show: boolean;
  anchorRef: React.RefObject<HTMLElement | null>;
}) {
  const [pos, setPos] = useState({ top: 0 });

  useEffect(() => {
    if (show && anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect();
      setPos({ top: rect.top + rect.height / 2 });
    }
  }, [show, anchorRef]);

  if (!show) return null;

  return (
    <div
      className="fixed z-[100] left-[72px] -translate-y-1/2 pointer-events-none"
      style={{ top: pos.top }}
    >
      <div className="relative flex items-center">
        {/* arrow */}
        <div className="w-1.5 h-1.5 rotate-45 bg-[#232326] border-l border-b border-[var(--glass-border-hover)] -mr-[3px]" />
        <div className="px-2.5 py-1.5 rounded-md bg-[#232326] border border-[var(--glass-border-hover)] shadow-lg shadow-black/40">
          <span className="text-xs font-medium text-white whitespace-nowrap">
            {label}
          </span>
        </div>
      </div>
    </div>
  );
});
