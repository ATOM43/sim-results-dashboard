import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import { RevisionsPage } from "./RevisionsPage";

const peak = { peak_magnitude_mm: 22, peak_frequency_hz: 37.8 };
const fail = { ...peak, verdict: "FAIL" };
const api: Record<string, unknown> = {
  "/api/projects": [{ id: 1, name: "Demo" }],
  "/api/projects/1/components": [
    {
      id: 1,
      name: "Bracket",
      latest: { result_id: 4, revision_label: "rev2", ...fail },
    },
    { id: 2, name: "Housing", latest: null },
  ],
  "/api/components/1/revisions": [
    {
      revision_id: 1,
      revision_label: "rev1",
      result: { result_id: 3, ...fail, delta_vs_previous_mm: null },
    },
    {
      revision_id: 2,
      revision_label: "rev2",
      result: { result_id: 4, ...fail, delta_vs_previous_mm: 2.1 },
    },
    { revision_id: 3, revision_label: "rev3", result: null },
  ],
  "/api/components/2/revisions": [],
  "/api/demands?component_id=1": [
    {
      id: 9,
      description: "Stiffen the bracket",
      status: "Open",
      origin_type: "finding",
      origin_revision_label: "rev1",
      origin_value_mm: 19.9,
      origin_frequency_hz: 37.6,
      origin_limit_mm: 15,
    },
  ],
  "/api/demands?component_id=2": [],
  "/api/results/4": {
    ...fail,
    component: { name: "Bracket" },
    revision: { label: "rev2" },
    sample_count: 2,
    min_frequency_hz: 5,
    max_frequency_hz: 200,
    overall_peak_magnitude_mm: 30,
    overall_peak_frequency_hz: 120,
    limit_mm: 15,
    assess_max_hz: 50,
    margin_mm: -7,
    samples: [
      { frequency_hz: 37.8, magnitude_mm: 22, assessed: true },
      { frequency_hz: 120, magnitude_mm: 30, assessed: false },
    ],
    source: {
      source_key: "rev1/Bracket.csv",
      status: "imported",
      warnings: [],
    },
  },
};

function Location() {
  const { search } = useLocation();
  return <output data-testid="search">{search}</output>;
}

function renderAt(url: string) {
  vi.stubGlobal("fetch", async (input: string) => {
    const path = input.replace(/^https?:\/\/[^/]+/, "");
    return path in api
      ? Response.json(api[path])
      : new Response(null, { status: 404 });
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <RevisionsPage />
        <Location />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

it("defaults to the first component and its latest revision with a result", async () => {
  renderAt("/revisions");
  expect(
    await screen.findByText(
      "Peak 22.0 mm at 37.8 Hz exceeds the 15.0 mm limit over 0–50 Hz.",
    ),
  ).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Bracket · rev2" })).toBeVisible();
  expect(screen.getByText("Demo / Bracket / rev2")).toBeVisible();
  expect(screen.getByText("Latest rev2 · 22.0 mm")).toBeVisible();
  expect(screen.getByText("Baseline (first revision)")).toBeVisible();
  expect(screen.getByText("+2.1 mm vs rev1 · worse")).toBeVisible();
  expect(screen.getByText("Margin to 15.0 mm limit")).toBeVisible();
  expect(screen.getByText("−7.0 mm")).toBeVisible();
  expect(screen.getByText("46.7 % above the limit")).toBeVisible();
  expect(screen.getByText("Overall peak (0–200 Hz)")).toBeVisible();
  expect(screen.getByText("30.0 mm")).toBeVisible();
  expect(screen.getByText("at 120.0 Hz")).toBeVisible();
  expect(screen.getByText("2 samples · 5–200 Hz · 1 assessed")).toBeVisible();
  expect(screen.getByText("Frequency response · Bracket · rev2")).toBeVisible();
  expect(screen.getByText("D-9")).toBeVisible();
  expect(
    screen.getByText("Origin: rev1 · peak 19.9 mm at 37.6 Hz · limit 15.0 mm"),
  ).toBeVisible();
  expect(
    screen.getByRole("button", { name: "+ Create demand from this finding" }),
  ).toBeDisabled();
  // the thumbnail never loads in jsdom, so the initial-letter placeholder shows
  expect(screen.getByText("B")).toBeVisible();
});

it("says a revision has no data instead of showing a verdict", async () => {
  renderAt("/revisions?component=1&rev=rev3");
  expect(await screen.findAllByText("No data for rev3")).toHaveLength(2);
  expect(screen.queryByText(/limit over/)).not.toBeInTheDocument();
});

it("puts the selected component and revision in the URL", async () => {
  renderAt("/revisions?project=1");
  fireEvent.click(await screen.findByRole("button", { name: /^rev3/ }));
  expect(screen.getByTestId("search")).toHaveTextContent("?project=1&rev=rev3");
  fireEvent.click(screen.getByRole("button", { name: /Housing/ }));
  expect(screen.getByTestId("search")).toHaveTextContent(
    "?project=1&rev=rev3&component=2",
  );
  expect(await screen.findByText("No revisions")).toBeVisible();
});
