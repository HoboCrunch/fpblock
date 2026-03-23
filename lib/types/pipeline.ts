export interface PipelineContact {
  id: string;
  full_name: string;
  company_name: string | null;
  icp_score: number | null;
  channel: string | null;
  pipeline_stage: string;
  last_updated: string;
  initiative_id: string | null;
  event_id: string | null;
  event_name: string | null;
}

export interface KanbanColumnDef {
  id: string;
  label: string;
  color: string;
}
