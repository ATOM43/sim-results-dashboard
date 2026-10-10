import { BASE_URL, request } from "./client";

export type Verdict = "PASS" | "FAIL";

export type ComponentSummary = {
  id: number;
  name: string;
  latest: {
    result_id: number;
    revision_label: string;
    peak_magnitude_mm: number;
    peak_frequency_hz: number;
    verdict: Verdict;
  } | null;
};

export function getComponents(projectId: number) {
  return request<ComponentSummary[]>(`/api/projects/${projectId}/components`);
}

/** For an <img src>: 404s when the inputs folder has no picture of the component. */
export function componentImageUrl(componentId: number) {
  return `${BASE_URL}/api/components/${componentId}/image`;
}
