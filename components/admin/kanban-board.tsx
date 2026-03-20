"use client";

import { useCallback, useState } from "react";
import {
  DragDropContext,
  type DropResult,
} from "@hello-pangea/dnd";
import { KanbanColumn } from "@/components/admin/kanban-column";
import type { PipelineContact, KanbanColumnDef } from "@/lib/types/pipeline";

const STATUS_ORDER = [
  "not_contacted",
  "draft",
  "scheduled",
  "sent",
  "opened",
  "replied",
  "bounced_failed",
] as const;

export type KanbanStage = (typeof STATUS_ORDER)[number];

const COLUMN_DEFS: KanbanColumnDef[] = [
  { id: "not_contacted", label: "Not Contacted", color: "bg-gray-500" },
  { id: "draft", label: "Draft", color: "bg-yellow-500" },
  { id: "scheduled", label: "Scheduled", color: "bg-blue-500" },
  { id: "sent", label: "Sent", color: "bg-green-500" },
  { id: "opened", label: "Opened", color: "bg-teal-400" },
  { id: "replied", label: "Replied", color: "bg-emerald-500" },
  { id: "bounced_failed", label: "Bounced/Failed", color: "bg-red-500" },
];

type Props = {
  contacts: PipelineContact[];
  onMoveContact: (
    contactId: string,
    fromStage: string,
    toStage: string
  ) => Promise<void>;
};

function groupByStage(
  contacts: PipelineContact[]
): Record<string, PipelineContact[]> {
  const groups: Record<string, PipelineContact[]> = {};
  for (const col of COLUMN_DEFS) {
    groups[col.id] = [];
  }
  for (const c of contacts) {
    const stage = c.pipeline_stage || "not_contacted";
    if (groups[stage]) {
      groups[stage].push(c);
    } else {
      groups["not_contacted"].push(c);
    }
  }
  return groups;
}

export function KanbanBoard({ contacts, onMoveContact }: Props) {
  const [grouped, setGrouped] = useState(() => groupByStage(contacts));

  const handleDragEnd = useCallback(
    async (result: DropResult) => {
      const { source, destination, draggableId } = result;
      if (!destination) return;
      if (
        source.droppableId === destination.droppableId &&
        source.index === destination.index
      )
        return;

      // Cannot move TO "not_contacted"
      if (destination.droppableId === "not_contacted") return;

      const fromStage = source.droppableId;
      const toStage = destination.droppableId;

      // Optimistic update
      setGrouped((prev) => {
        const next = { ...prev };
        const fromList = [...(next[fromStage] || [])];
        const toList =
          fromStage === toStage
            ? fromList
            : [...(next[toStage] || [])];

        const [moved] = fromList.splice(source.index, 1);
        if (!moved) return prev;

        const updated = { ...moved, pipeline_stage: toStage };
        if (fromStage === toStage) {
          fromList.splice(destination.index, 0, updated);
          next[fromStage] = fromList;
        } else {
          toList.splice(destination.index, 0, updated);
          next[fromStage] = fromList;
          next[toStage] = toList;
        }
        return next;
      });

      try {
        await onMoveContact(draggableId, fromStage, toStage);
      } catch {
        // Revert on failure
        setGrouped(groupByStage(contacts));
      }
    },
    [contacts, onMoveContact]
  );

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory md:snap-none">
        {COLUMN_DEFS.map((col) => (
          <KanbanColumn
            key={col.id}
            column={col}
            contacts={grouped[col.id] || []}
          />
        ))}
      </div>
    </DragDropContext>
  );
}
