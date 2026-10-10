import { request } from "./client";
import type { Verdict } from "./components";

export type ResultDetail = {
  id: number;
  project: { id: number; name: string };
  component: { id: number; name: string };
  revision: { id: number; label: string; sort_key: number };
  sample_count: number;
  min_frequency_hz: number;
  max_frequency_hz: number;
  peak_magnitude_mm: number;
  peak_frequency_hz: number;
  overall_peak_magnitude_mm: number;
  overall_peak_frequency_hz: number;
  limit_mm: number;
  assess_max_hz: number;
  verdict: Verdict;
  margin_mm: number;
  samples: { frequency_hz: number; magnitude_mm: number; assessed: boolean }[];
  source: {
    source_key: string;
    status: string;
    warnings: string[];
    last_imported_at: string;
  };
};

export function getResult(resultId: number) {
  return request<ResultDetail>(`/api/results/${resultId}`);
}
