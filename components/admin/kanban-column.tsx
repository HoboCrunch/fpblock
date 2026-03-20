"use client";

import { Droppable, Draggable } from "@hello-pangea/dnd";
import { DragCard } from "@/components/admin/drag-card";
import { cn } from "@/lib/utils";
import type { PipelineContact, KanbanColumnDef } from "@/lib/types/pipeline";

type Props = {
  column: KanbanColumnDef;
  contacts: PipelineContact[];
};

export function KanbanColumn({ column, contacts }: Props) {
  return (
    <div className="flex-shrink-0 w-64 snap-center">
      <div className="flex items-center gap-2 mb-3 px-1">
        <span className={cn("w-2.5 h-2.5 rounded-full", column.color)} />
        <h3 className="text-sm font-medium text-white/70">
          {column.label}
        </h3>
        <span className="text-xs text-white/40 bg-white/5 rounded-full px-2 py-0.5">
          {contacts.length}
        </span>
      </div>
      <Droppable droppableId={column.id}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={cn(
              "min-h-[200px] rounded-xl p-2 space-y-2 transition-colors duration-200",
              "bg-white/[0.02] border border-white/[0.06]",
              snapshot.isDraggingOver && "bg-white/[0.05] border-white/[0.12]"
            )}
          >
            {contacts.map((contact, index) => (
              <Draggable
                key={contact.id}
                draggableId={contact.id}
                index={index}
              >
                {(dragProvided, dragSnapshot) => (
                  <div
                    ref={dragProvided.innerRef}
                    {...dragProvided.draggableProps}
                    {...dragProvided.dragHandleProps}
                  >
                    <DragCard
                      contact={contact}
                      isDragging={dragSnapshot.isDragging}
                    />
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  );
}
