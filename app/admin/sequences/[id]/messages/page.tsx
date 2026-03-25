import { MessageQueueClient } from "./message-queue-client";

export default async function MessagesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <MessageQueueClient sequenceId={id} />;
}
