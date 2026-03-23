import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const body = await request.json();

  const { candidate_id, action, winner_id, loser_id, entity_type } = body as {
    candidate_id: string;
    action?: "dismiss";
    winner_id?: string;
    loser_id?: string;
    entity_type?: string;
  };

  if (!candidate_id) {
    return NextResponse.json(
      { error: "candidate_id is required" },
      { status: 400 }
    );
  }

  // --- Dismiss flow ---
  if (action === "dismiss") {
    const { error } = await supabase
      .from("correlation_candidates")
      .update({ status: "dismissed" })
      .eq("id", candidate_id);

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, status: "dismissed" });
  }

  // --- Merge flow ---
  if (!winner_id || !loser_id || !entity_type) {
    return NextResponse.json(
      { error: "winner_id, loser_id, and entity_type are required for merge" },
      { status: 400 }
    );
  }

  // Call the appropriate RPC function
  const rpcName =
    entity_type === "person" ? "merge_persons" : "merge_organizations";

  const { error: mergeError } = await supabase.rpc(rpcName, {
    winner_id,
    loser_id,
  });

  if (mergeError) {
    return NextResponse.json(
      { error: mergeError.message },
      { status: 500 }
    );
  }

  // Update candidate status to merged
  const { error: updateError } = await supabase
    .from("correlation_candidates")
    .update({ status: "merged" })
    .eq("id", candidate_id);

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, status: "merged" });
}
