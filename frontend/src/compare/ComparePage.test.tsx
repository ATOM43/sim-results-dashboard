import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import { ComparePage } from "./ComparePage";

const peaks = {
  Bracket: [19.9, 22, 13.8],
  Housing: [16.7, 14.9, 14.2],
  Lens: [18, 16.1, 17.5],
};
const names = Object.keys(peaks) as (keyof typeof peaks)[];
const verdict = (peak: number) => (peak <= 15 ? "PASS" : "FAIL");
const trend = (delta: number) => (delta > 0 ? "degraded" : "improved");

/** What the API answers for all three revisions with rev1 as the baseline. */
const comparison = (name: keyof typeof peaks) => ({
  project: { id: 1, name: "Demo" },
  component: { id: names.indexOf(name) + 1, name },
  baseline_revision_label: "rev1",
  grid_mismatch: true,
  grid_note:
    "frequency grids differ in the assessed range: rev1 has 36.8 Hz, lacks 44.3 Hz",
  revisions: peaks[name].map((peak, i, all) => ({
    revision_id: i + 1,
    revision_label: `rev${i + 1}`,
    result: {
      result_id: i + 1,
      peak_magnitude_mm: peak,
      peak_frequency_hz: 37.8,
      verdict: verdict(peak),
      margin_mm: 15 - peak,
      delta_vs_previous_mm: i ? peak - all[i - 1] : null,
      delta_vs_baseline_mm: i ? peak - all[0] : null,
      trend: i ? trend(peak - all[i - 1]) : null,
      samples: [{ frequency_hz: 37.8, magnitude_mm: peak, assessed: true }],
    },
  })),
});

const api: Record<string, unknown> = {
  "/api/projects": [{ id: 1, name: "Demo" }],
  "/api/projects/1/matrix": {
    project: { id: 1, name: "Demo" },
    revisions: [1, 2, 3].map((id) => ({ id, label: `rev${id}` })),
    components: names.map((name, index) => ({
      id: index + 1,
      name,
      cells: peaks[name].map((peak, i, all) => ({
        revision_id: i + 1,
        peak_magnitude_mm: peak,
        verdict: verdict(peak),
        trend: i ? trend(peak - all[i - 1]) : null,
      })),
    })),
  },
  "/api/demands?project_id=1": [{ id: 7, component: { id: 3 } }],
  "/api/components/1/comparison": comparison("Bracket"),
  "/api/components/2/comparison": comparison("Housing"),
  "/api/components/3/comparison": comparison("Lens"),
};

function Location() {
  const { search } = useLocation();
  return <output data-testid="search">{search}</output>;
}

function renderAt(url: string) {
  vi.stubGlobal("fetch", async (input: string) => {
    const path = decodeURIComponent(input.replace(/^https?:\/\/[^/]+/, ""));
    if (path.includes("revisions=revX"))
      return Response.json(
        { detail: "revision revX not found for component 1" },
        { status: 400 },
      );
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
        <ComparePage />
        <Location />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

it("shows Lens rev3 as degraded against rev2", async () => {
  renderAt("/compare?component=3");
  const row = await screen.findByRole("row", { name: /^rev3/ });
  expect(within(row).getByText("+1.4 mm · degraded")).toBeVisible();
  expect(within(row).getByText("2.5 mm over")).toBeVisible();
  expect(
    screen.getByRole("heading", { name: "Compare revisions · Lens" }),
  ).toBeVisible();
  expect(screen.getByText("Demo / Lens / compare")).toBeVisible();
  expect(
    screen.getByText(
      "rev2 improved by 1.9 mm; rev3 degraded by 1.4 mm. Latest (rev3) fails, 2.5 mm over the limit.",
    ),
  ).toBeVisible();
  // the grid shows the same change as an arrow with a signed delta, and the linked demand
  const gridRow = screen.getByRole("row", { name: /^Lens/ });
  expect(within(gridRow).getByText("↑ +1.4")).toBeVisible();
  expect(within(gridRow).getByText("↓ −1.9")).toBeVisible();
  expect(within(gridRow).getByRole("link", { name: "D-7" })).toBeVisible();
  expect(
    screen.getByText(/^Note: Lens — frequency grids differ/),
  ).toBeVisible();
});

it("reads the Bracket deltas against the rev1 baseline", async () => {
  renderAt("/compare");
  await screen.findByRole("row", { name: /^rev3/ });
  const column = ["rev1", "rev2", "rev3"].map(
    (label) =>
      within(
        screen.getByRole("row", { name: new RegExp(`^${label}`) }),
      ).getAllByRole("cell")[3].textContent,
  );
  expect(column).toEqual(["— baseline", "+2.1 mm · higher", "−6.1 mm · lower"]);
  expect(
    screen.getByText(
      "rev2 degraded by 2.1 mm; rev3 improved by 8.2 mm and now passes. Latest (rev3) passes with 1.2 mm headroom.",
    ),
  ).toBeVisible();
  expect(
    screen.getAllByRole("link", { name: "View result" })[2],
  ).toHaveAttribute("href", "/revisions?project=1&component=1&rev=rev3");
});

it("switches the component when a grid row is clicked", async () => {
  renderAt("/compare?project=1");
  fireEvent.click(await screen.findByRole("row", { name: /^Housing/ }));
  expect(screen.getByTestId("search")).toHaveTextContent(
    "?project=1&component=2",
  );
  expect(
    await screen.findByRole("heading", { name: "Compare revisions · Housing" }),
  ).toBeVisible();
});

it("puts the toggled revisions in the URL", async () => {
  renderAt("/compare?project=1");
  await screen.findByRole("row", { name: /^rev3/ });
  fireEvent.click(screen.getByRole("button", { name: "rev2" }));
  expect(screen.getByTestId("search")).toHaveTextContent(
    "?project=1&revisions=rev1%2Crev3",
  );
});

it("shows an empty state when no revision is selected", async () => {
  renderAt("/compare?revisions=");
  expect(await screen.findByText("No revisions selected")).toBeVisible();
  expect(screen.queryByText(/What changed/)).not.toBeInTheDocument();
});

it("shows the API's reason for a revision that does not exist", async () => {
  renderAt("/compare?revisions=revX");
  expect(
    await screen.findByText("revision revX not found for component 1"),
  ).toBeVisible();
});
