import { request } from "./client";
import type { Verdict } from "./components";

export type Trend = "improved" | "degraded" | "unchanged";

export type ComparisonEntry = {
  revision_id: number;
  revision_label: string;
  sort_key: number;
  /** Null when the component has no result in this revision. */
  result: {
    result_id: number;
    peak_magnitude_mm: number;
    peak_frequency_hz: number;
    verdict: Verdict;
    margin_mm: number;
    delta_vs_previous_mm: number | null;
    delta_vs_baseline_mm: number | null;
    trend: Trend | null;
    samples: {
      frequency_hz: number;
      magnitude_mm: number;
      assessed: boolean;
    }[];
  } | null;
};

export type Comparison = {
  project: { id: number; name: string };
  component: { id: number; name: string };
  baseline_revision_label: string | null;
  grid_mismatch: boolean;
  grid_note: string | null;
  revisions: ComparisonEntry[];
};

export type MatrixCell = {
  revision_id: number;
  result_id: number;
  peak_magnitude_mm: number;
  verdict: Verdict;
  trend: Trend | null;
};

export type Matrix = {
  project: { id: number; name: string };
  revisions: { id: number; label: string; sort_key: number }[];
  /** One cell per revision, in order; null where the component has no result. */
  components: { id: number; name: string; cells: (MatrixCell | null)[] }[];
};

/** Without `revisions` the API selects every revision with a result; without `baseline`, the earliest selected. */
export function getComparison(
  componentId: number,
  revisions?: string[],
  baseline?: string,
) {
  const params = new URLSearchParams();
  if (revisions) params.set("revisions", revisions.join(","));
  if (baseline) params.set("baseline", baseline);
  return request<Comparison>(
    `/api/components/${componentId}/comparison${params.size ? `?${params}` : ""}`,
  );
}

export function getMatrix(projectId: number) {
  return request<Matrix>(`/api/projects/${projectId}/matrix`);
}
