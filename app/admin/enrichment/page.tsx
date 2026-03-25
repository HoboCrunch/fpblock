import { Suspense } from "react";
import { EnrichmentShell } from "./enrichment-shell";

export default function EnrichmentPage() {
  return (
    <Suspense>
      <EnrichmentShell />
    </Suspense>
  );
}
