"use client";

import { ListPlus } from "lucide-react";
import { addToList } from "@/app/admin/lists/actions";

interface AddToListDropdownProps {
  personId: string;
  lists: Array<{ id: string; name: string }>;
}

export function AddToListDropdown({ personId, lists }: AddToListDropdownProps) {
  if (lists.length === 0) return null;

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const listId = e.target.value;
    if (!listId) return;
    await addToList(listId, [personId]);
    e.target.value = "";
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg glass hover:bg-white/[0.05] transition-colors">
      <ListPlus className="w-4 h-4 text-[var(--text-secondary)] flex-shrink-0" />
      <select
        className="flex-1 bg-transparent text-sm text-[var(--text-secondary)] border-none outline-none cursor-pointer appearance-none"
        onChange={handleChange}
        defaultValue=""
      >
        <option value="" className="bg-[#0f0f13]">
          Add to List...
        </option>
        {lists.map((list) => (
          <option key={list.id} value={list.id} className="bg-[#0f0f13]">
            {list.name}
          </option>
        ))}
      </select>
    </div>
  );
}
