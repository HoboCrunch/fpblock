import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const body = await request.json();
  const { interaction_id, interaction_ids } = body;

  const ids: string[] = interaction_ids ?? (interaction_id ? [interaction_id] : []);

  if (ids.length === 0) {
    return NextResponse.json({ error: "interaction_id or interaction_ids required" }, { status: 400 });
  }

  // Mark interactions as sending
  const { error: updateError } = await supabase
    .from("interactions")
    .update({ status: "sending", occurred_at: new Date().toISOString() })
    .in("id", ids);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Invoke the edge function to actually send
  const { data, error } = await supabase.functions.invoke("send-message", {
    body: { interaction_ids: ids },
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
