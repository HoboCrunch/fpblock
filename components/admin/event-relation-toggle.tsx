"use client";

import type { EventPersonRelation } from "@/lib/queries/event-persons";

export interface EventRelationToggleProps {
  speaker: boolean;
  orgAffiliated: boolean;
  onChange: (next: { speaker: boolean; orgAffiliated: boolean }) => void;
  disabled?: boolean;
}

export function EventRelationToggle({
  speaker,
  orgAffiliated,
  onChange,
  disabled,
}: EventRelationToggleProps) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <label className="flex items-center gap-1.5 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={speaker}
          disabled={disabled}
          onChange={(e) => onChange({ speaker: e.target.checked, orgAffiliated })}
          className="accent-current"
        />
        <span>Speaker</span>
      </label>
      <label className="flex items-center gap-1.5 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={orgAffiliated}
          disabled={disabled}
          onChange={(e) => onChange({ speaker, orgAffiliated: e.target.checked })}
          className="accent-current"
        />
        <span>Org-affiliated</span>
      </label>
    </div>
  );
}

export function toggleToRelation(
  speaker: boolean,
  orgAffiliated: boolean
): EventPersonRelation | null {
  if (speaker && orgAffiliated) return "either";
  if (speaker && !orgAffiliated) return "direct";
  if (!speaker && orgAffiliated) return "org_affiliated";
  return null;
}
