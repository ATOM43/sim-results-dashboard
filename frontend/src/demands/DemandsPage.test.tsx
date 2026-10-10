import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RevisionsPage } from "@/revisions/RevisionsPage";
import { DemandsPage } from "./DemandsPage";

const components = [
  { id: 1, name: "Bracket", latest: null },
  { id: 2, name: "Housing", latest: null },
];
const fail = {
  peak_magnitude_mm: 22,
  peak_frequency_hz: 37.8,
  verdict: "FAIL",
};
const revisions = [
  {
    revision_id: 1,
    revision_label: "rev1",
    sort_key: 1,
    result: { result_id: 4, ...fail, delta_vs_previous_mm: null },
  },
];
const api: Record<string, unknown> = {
  "/api/projects": [{ id: 1, name: "Demo" }],
  "/api/projects/1/components": components,
  "/api/components/1/revisions": revisions,
  "/api/components/2/revisions": revisions,
  "/api/results/4": {
    id: 4,
    ...fail,
    component: components[0],
    revision: { id: 1, label: "rev1", sort_key: 1 },
    sample_count: 1,
    min_frequency_hz: 5,
    max_frequency_hz: 200,
    overall_peak_magnitude_mm: 22,
    overall_peak_frequency_hz: 37.8,
    limit_mm: 15,
    assess_max_hz: 50,
    margin_mm: -7,
    samples: [{ frequency_hz: 37.8, magnitude_mm: 22, assessed: true }],
    source: {
      source_key: "rev1/Bracket.csv",
      status: "imported",
      warnings: [],
    },
  },
};

type Row = Record<string, unknown> & { id: number; status: string };
let demands: Row[];
let writes: { method: string; path: string; body: Record<string, unknown> }[];
/** When set, every write is refused with this status and FastAPI `detail`. */
let refusal: { status: number; detail: unknown } | undefined;

function demand(
  id: number,
  component: (typeof components)[number],
  status: string,
  description: string,
): Row {
  const entry = {
    revision_id: 1,
    revision_label: "rev1",
    result_id: 4,
    ...fail,
  };
  return {
    id,
    description,
    status,
    component,
    project: { id: 1, name: "Demo" },
    origin_type: "finding",
    origin_revision_label: "rev1",
    origin_value_mm: 22,
    origin_frequency_hz: 37.8,
    origin_limit_mm: 15,
    origin_source_key: "rev1/Bracket.csv",
    created_at: "2026-10-08T12:00:00Z",
    history: [entry],
    latest_result: entry,
    latest_passes_but_open: false,
  };
}

beforeEach(() => {
  demands = [
    demand(2, components[1], "In Progress", "Check the housing"),
    demand(1, components[0], "Open", "Stiffen the bracket"),
  ];
  writes = [];
  refusal = undefined;
  // A small stateful stand-in for the demands API, so writes show up in the refetched lists.
  vi.stubGlobal("fetch", async (input: string, init?: RequestInit) => {
    const url = new URL(input);
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    if (method !== "GET") writes.push({ method, path: url.pathname, body });
    if (method !== "GET" && refusal)
      return Response.json(
        { detail: refusal.detail },
        { status: refusal.status },
      );
    const one = demands.find((d) => `/api/demands/${d.id}` === url.pathname);
    if (url.pathname === "/api/demands" && method === "POST") {
      const component =
        components.find((c) => c.id === body.component_id) ?? components[0];
      const created = demand(3, component, "Open", body.description);
      demands.unshift(created);
      return Response.json(created, { status: 201 });
    }
    if (url.pathname === "/api/demands") {
      const status = url.searchParams.get("status");
      const component = url.searchParams.get("component_id");
      return Response.json(
        demands.filter(
          (d) =>
            (!status || d.status === status) &&
            (!component ||
              String((d.component as { id: number }).id) === component),
        ),
      );
    }
    if (one) return Response.json(Object.assign(one, body));
    return url.pathname in api
      ? Response.json(api[url.pathname])
      : new Response(null, { status: 404 });
  });
});

afterEach(() => vi.unstubAllGlobals());

function Location() {
  const { pathname, search } = useLocation();
  return <output data-testid="url">{pathname + search}</output>;
}

function renderAt(url: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/revisions" element={<RevisionsPage />} />
          <Route path="/demands" element={<DemandsPage />} />
        </Routes>
        <Location />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const describe = (text: string) =>
  fireEvent.change(
    within(screen.getByRole("dialog")).getByLabelText(/^Description/),
    {
      target: { value: text },
    },
  );
// Radix Select mirrors its value into a hidden native <select> inside a form; jsdom cannot open the popup.
const choose = (name: string, value: string) =>
  fireEvent.change(document.querySelector(`select[name=${name}]`)!, {
    target: { value },
  });

it("creates a demand from a FAIL result and selects it on the demands page", async () => {
  renderAt("/revisions?project=1");
  fireEvent.click(
    await screen.findByRole("button", {
      name: "+ Create demand from this finding",
    }),
  );
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByText("Demo / Bracket / rev1")).toBeVisible();
  expect(within(dialog).getByText("7.0 mm · 46.7 % over")).toBeVisible();
  expect(
    within(dialog).getByText("Bracket in rev1 and every later revision"),
  ).toBeVisible();
  // the API always creates demands as Open
  expect(within(dialog).queryByText("Status")).not.toBeInTheDocument();

  describe("Bring the peak below 15 mm");
  fireEvent.click(screen.getByRole("button", { name: "Create demand" }));

  const row = await screen.findByRole("row", { name: /^D-3/ });
  expect(writes).toEqual([
    {
      method: "POST",
      path: "/api/demands",
      body: { origin_result_id: 4, description: "Bring the peak below 15 mm" },
    },
  ]);
  expect(row).toHaveAttribute("aria-selected", "true");
  expect(screen.getByTestId("url")).toHaveTextContent(
    "/demands?project=1&demand=3",
  );
  expect(
    await screen.findByRole("heading", { name: "D-3 · Bracket" }),
  ).toBeVisible();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("blocks submit while the description is empty", async () => {
  renderAt("/demands?component=1");
  fireEvent.click(
    await screen.findByRole("button", { name: "+ New manual demand" }),
  );
  const submit = await screen.findByRole("button", { name: "Create demand" });
  expect(submit).toBeDisabled();
  describe("   ");
  expect(submit).toBeDisabled();
  describe("Check the mount");
  expect(submit).toBeEnabled();
});

it("creates a manual demand for the chosen component", async () => {
  renderAt("/demands");
  fireEvent.click(
    await screen.findByRole("button", { name: "+ New manual demand" }),
  );
  describe("Check the mount");
  // no component yet
  expect(screen.getByRole("button", { name: "Create demand" })).toBeDisabled();
  await screen.findByText("Choose a component", { selector: "p" });
  choose("component", "2");
  fireEvent.click(screen.getByRole("button", { name: "Create demand" }));

  expect(await screen.findByRole("row", { name: /^D-3/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(writes[0].body).toEqual({
    origin_type: "manual",
    component_id: 2,
    description: "Check the mount",
  });
});

it("saves a status change and shows it in the row and the panel", async () => {
  renderAt("/demands?demand=1");
  await screen.findByRole("heading", { name: "D-1 · Bracket" });
  expect(
    screen.getByText("Created 08 Oct 2026 from rev1 finding"),
  ).toBeVisible();
  choose("status", "Resolved");
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

  const row = screen.getByRole("row", { name: /^D-1/ });
  expect(await within(row).findByText("Resolved")).toBeVisible();
  expect(writes).toEqual([
    {
      method: "PATCH",
      path: "/api/demands/1",
      body: { description: "Stiffen the bracket", status: "Resolved" },
    },
  ]);
  expect(screen.getByRole("combobox", { name: "Status" })).toHaveTextContent(
    "Resolved",
  );
  expect(screen.getByRole("radio", { name: "Resolved (1)" })).toBeVisible();
});

it("puts a filter change in the URL and filters the table", async () => {
  renderAt("/demands?project=1");
  fireEvent.click(await screen.findByRole("radio", { name: "Open (1)" }));
  expect(screen.getByTestId("url")).toHaveTextContent(
    "/demands?project=1&status=Open",
  );
  await vi.waitFor(() =>
    expect(screen.queryByRole("row", { name: /^D-2/ })).not.toBeInTheDocument(),
  );
  expect(screen.getByRole("row", { name: /^D-1/ })).toBeVisible();

  fireEvent.click(screen.getByRole("radio", { name: "Housing" }));
  expect(screen.getByTestId("url")).toHaveTextContent(
    "/demands?project=1&status=Open&component=2",
  );
  expect(
    await screen.findByText("No demands match these filters"),
  ).toBeVisible();

  fireEvent.change(screen.getByRole("searchbox", { name: "Search" }), {
    target: { value: "peak" },
  });
  expect(screen.getByTestId("url")).toHaveTextContent("q=peak");
});

it("shows the demand's current status in the detail panel", async () => {
  renderAt("/demands?demand=2");
  await screen.findByRole("heading", { name: "D-2 · Housing" });
  expect(screen.getByRole("combobox", { name: "Status" })).toHaveTextContent(
    "In progress",
  );
});

it("shows the API's reason inside the dialog when a create is refused", async () => {
  refusal = {
    status: 400,
    detail: "cannot raise a demand from a passing result",
  };
  renderAt("/revisions?project=1");
  fireEvent.click(
    await screen.findByRole("button", {
      name: "+ Create demand from this finding",
    }),
  );
  await screen.findByRole("dialog");
  describe("Bring the peak below 15 mm");
  fireEvent.click(screen.getByRole("button", { name: "Create demand" }));

  const alert = await within(screen.getByRole("dialog")).findByRole("alert");
  expect(alert).toHaveTextContent("Could not create the demand");
  expect(alert).toHaveTextContent(
    "cannot raise a demand from a passing result",
  );
  expect(screen.getByTestId("url")).toHaveTextContent("/revisions?project=1");
});

it("shows a validation error in the detail panel when a save is refused", async () => {
  refusal = {
    status: 422,
    detail: [
      { loc: ["body", "status"], msg: "Input should be 'Open' or 'Resolved'" },
    ],
  };
  renderAt("/demands?demand=1");
  await screen.findByRole("heading", { name: "D-1 · Bracket" });
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent("Could not save the demand");
  expect(alert).toHaveTextContent(
    "status: Input should be 'Open' or 'Resolved'",
  );
  expect(screen.queryByText("Saved.")).not.toBeInTheDocument();
});
