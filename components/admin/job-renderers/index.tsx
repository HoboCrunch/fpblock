"use client";

import React from "react";
import type { Job } from "@/lib/jobs/types";
import { EnrichmentRenderer } from "./enrichment-renderer";
import { CsvImportRenderer } from "./csv-import-renderer";
import { DefaultRenderer } from "./default-renderer";

/**
 * Renders the appropriate per-type detail for a job, matching by job_type.
 * Matching is by prefix so all enrichment_* variants go to EnrichmentRenderer.
 *
 * Returns a JSX element directly (rather than a component type) so callers do
 * not create a component during render (react-hooks/static-components). The
 * hooks inside each renderer still run correctly because the renderer is
 * mounted as a real element.
 */
export function renderJobDetail(job: Job): React.ReactNode {
  if (job.job_type.startsWith("enrichment")) {
    return <EnrichmentRenderer job={job} />;
  }
  if (job.job_type === "csv_import") {
    return <CsvImportRenderer job={job} />;
  }
  return <DefaultRenderer job={job} />;
}

export { EnrichmentRenderer, CsvImportRenderer, DefaultRenderer };
