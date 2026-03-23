import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const body = await request.json();
  const { action, interaction_ids, scheduled_at } = body as {
    action: "approve" | "schedule" | "delete" | "supersede";
    interaction_ids: string[];
    scheduled_at?: string;
  };

  if (!action || !interaction_ids || interaction_ids.length === 0) {
    return NextResponse.json({ error: "action and interaction_ids required" }, { status: 400 });
  }

  switch (action) {
    case "approve": {
      const { error } = await supabase.from("interactions").update({ status: "scheduled" }).in("id", interaction_ids).eq("status", "draft");
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      break;
    }
    case "schedule": {
      if (!scheduled_at) return NextResponse.json({ error: "scheduled_at required" }, { status: 400 });
      const { error } = await supabase.from("interactions").update({ status: "scheduled", scheduled_at }).in("id", interaction_ids);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      break;
    }
    case "delete": {
      const { error } = await supabase.from("interactions").delete().in("id", interaction_ids);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      break;
    }
    case "supersede": {
      // No "superseded" in InteractionStatus — use "failed" as closest equivalent
      const { error } = await supabase.from("interactions").update({ status: "failed" }).in("id", interaction_ids);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      break;
    }
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  return NextResponse.json({ success: true, action, count: interaction_ids.length });
}
