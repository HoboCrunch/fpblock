import { SequenceDetailClient } from "./sequence-detail-client";

export default async function SequenceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SequenceDetailClient sequenceId={id} />;
}
