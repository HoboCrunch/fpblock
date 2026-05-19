export interface PipelineContact {
  id: string;
  full_name: string;
  company_name: string | null;
  icp_score: number | null;
  channel: string | null;
  pipeline_stage: string;
  last_updated: string;
  event_id: string | null;
  event_name: string | null;
  source: "script_backfill" | "script_send" | "sent_folder_reconciler" | "sequence" | "manual" | null;
}

export interface KanbanColumnDef {
  id: string;
  label: string;
  color: string;
}
