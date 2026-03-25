"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Kanban, Table } from "lucide-react";
import { cn } from "@/lib/utils";
import { KanbanBoard } from "@/components/admin/kanban-board";
import { PipelineTable } from "@/components/admin/pipeline-table";
import { moveContact } from "@/app/admin/pipeline/actions";
import type { PipelineContact } from "@/lib/types/pipeline";
import type { Event, Initiative } from "@/lib/types/database";

type Props = {
  contacts: PipelineContact[];
  events: Event[];
  initiatives: Pick<Initiative, "id" | "name" | "status">[];
  initialStageFilter: string | null;
  initialInitiativeFilter: string | null;
};

export function PipelineView({
  contacts,
  events,
  initiatives,
  initialStageFilter,
  initialInitiativeFilter,
}: Props) {
  const router = useRouter();
  const [view, setView] = useState<"kanban" | "table">("kanban");
  const [eventFilter, setEventFilter] = useState<string>("");
  const [channelFilter, setChannelFilter] = useState<string>("");
  const [icpMin, setIcpMin] = useState<string>("");
  const [icpMax, setIcpMax] = useState<string>("");
  const [stageFilter, setStageFilter] = useState<string>(initialStageFilter || "");
  const [initiativeFilter, setInitiativeFilter] = useState<string>(initialInitiativeFilter || "");

  const handleInitiativeChange = (value: string) => {
    setInitiativeFilter(value);
    // Update URL to reflect initiative filter (triggers server re-fetch)
    const url = new URL(window.location.href);
    if (value) {
      url.searchParams.set("initiative", value);
    } else {
      url.searchParams.delete("initiative");
    }
    if (stageFilter) {
      url.searchParams.set("stage", stageFilter);
    }
    router.push(url.pathname + url.search);
  };

  const filtered = contacts.filter((c) => {
    if (eventFilter && c.event_id !== eventFilter) return false;
    if (channelFilter && c.channel !== channelFilter) return false;
    if (stageFilter && c.pipeline_stage !== stageFilter) return false;
    if (icpMin && (c.icp_score == null || c.icp_score < Number(icpMin))) return false;
    if (icpMax && (c.icp_score == null || c.icp_score > Number(icpMax))) return false;
    return true;
  });

  const handleMoveContact = useCallback(
    async (contactId: string, fromStage: string, toStage: string) => {
      await moveContact(contactId, fromStage, toStage);
    },
    []
  );

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex items-center justify-end">
        <div className="flex items-center gap-1 bg-white/[0.03] border border-white/[0.06] rounded-lg p-1">
          <button
            onClick={() => setView("kanban")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-all duration-200",
              view === "kanban"
                ? "bg-[#f58327] text-white"
                : "text-white/50 hover:text-white/70"
            )}
          >
            <Kanban className="w-4 h-4" />
            Kanban
          </button>
          <button
            onClick={() => setView("table")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-all duration-200",
              view === "table"
                ? "bg-[#f58327] text-white"
                : "text-white/50 hover:text-white/70"
            )}
          >
            <Table className="w-4 h-4" />
            Table
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={initiativeFilter}
          onChange={(e) => handleInitiativeChange(e.target.value)}
          className="bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-white/70 backdrop-blur-xl focus:outline-none focus:border-white/[0.15] transition-all duration-200"
        >
          <option value="">All Initiatives</option>
          {initiatives.map((init) => (
            <option key={init.id} value={init.id}>
              {init.name}
            </option>
          ))}
        </select>

        <select
          value={eventFilter}
          onChange={(e) => setEventFilter(e.target.value)}
          className="bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-white/70 backdrop-blur-xl focus:outline-none focus:border-white/[0.15] transition-all duration-200"
        >
          <option value="">All Events</option>
          {events.map((ev) => (
            <option key={ev.id} value={ev.id}>
              {ev.name}
            </option>
          ))}
        </select>

        <select
          value={channelFilter}
          onChange={(e) => setChannelFilter(e.target.value)}
          className="bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-white/70 backdrop-blur-xl focus:outline-none focus:border-white/[0.15] transition-all duration-200"
        >
          <option value="">All Channels</option>
          <option value="email">Email</option>
          <option value="linkedin">LinkedIn</option>
          <option value="twitter">Twitter</option>
          <option value="telegram">Telegram</option>
        </select>

        <select
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value)}
          className="bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-white/70 backdrop-blur-xl focus:outline-none focus:border-white/[0.15] transition-all duration-200"
        >
          <option value="">All Stages</option>
          <option value="not_contacted">Not Contacted</option>
          <option value="draft">Draft</option>
          <option value="scheduled">Scheduled</option>
          <option value="sent">Sent</option>
          <option value="opened">Opened</option>
          <option value="replied">Replied</option>
          <option value="bounced_failed">Bounced/Failed</option>
        </select>

        <div className="flex items-center gap-1.5">
          <input
            type="number"
            placeholder="ICP min"
            value={icpMin}
            onChange={(e) => setIcpMin(e.target.value)}
            className="w-20 bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-white/70 backdrop-blur-xl focus:outline-none focus:border-white/[0.15] transition-all duration-200"
          />
          <span className="text-white/30 text-xs">&mdash;</span>
          <input
            type="number"
            placeholder="ICP max"
            value={icpMax}
            onChange={(e) => setIcpMax(e.target.value)}
            className="w-20 bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-white/70 backdrop-blur-xl focus:outline-none focus:border-white/[0.15] transition-all duration-200"
          />
        </div>

        <span className="text-xs text-white/30 ml-auto">
          {filtered.length} person{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* View */}
      {view === "kanban" ? (
        <KanbanBoard contacts={filtered} onMoveContact={handleMoveContact} />
      ) : (
        <PipelineTable contacts={filtered} />
      )}
    </div>
  );
}
