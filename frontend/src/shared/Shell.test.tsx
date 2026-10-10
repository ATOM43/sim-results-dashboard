import { QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import App from "@/App";
import { makeQueryClient } from "./queryClient";

const unreachable = /Cannot reach the API at /;
const api: Record<string, unknown> = {
  "/api/projects": [{ id: 1, name: "Demo" }],
  "/api/projects/1/components": [],
  "/api/import/status": {
    last_imported_at: null,
    counts: { imported: 9, failed: 0, missing: 0 },
    files: [],
  },
  "/api/demands": [{ id: 1 }, { id: 2 }],
};
/** What the API does: answer, refuse every request with a 500, or not be there at all. */
let mode: "up" | "500" | "down";
let projectRequests = 0;

function renderApp() {
  vi.stubGlobal("fetch", async (input: string) => {
    if (input.endsWith("/api/projects")) projectRequests += 1;
    if (mode === "down") throw new TypeError("Failed to fetch");
    if (mode === "500")
      return Response.json({ detail: "database is locked" }, { status: 500 });
    const { pathname } = new URL(input);
    return pathname in api
      ? Response.json(api[pathname])
      : new Response(null, { status: 404 });
  });
  const client = makeQueryClient();
  // The app's own client, minus the retry: its one-second backoff would only slow the tests down.
  client.setDefaultOptions({
    queries: { ...client.getDefaultOptions().queries, retry: false },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/revisions"]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return client;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** The one error card, in the page area. Fails if anything else on the page is an alert, such as a top banner. */
const card = () => {
  const alert = screen.getByRole("alert");
  expect(screen.getByRole("main")).toContainElement(alert);
  return alert;
};

it("shows a network failure once, as a page card with Retry, and renders the page after a Retry that succeeds", async () => {
  mode = "down";
  renderApp();

  await screen.findByRole("alert");
  expect(card()).toHaveTextContent("Something went wrong");
  expect(card()).toHaveTextContent(unreachable);
  // one message and one Retry on the whole page: no banner above the content
  expect(screen.getAllByText(unreachable)).toHaveLength(1);
  expect(screen.getAllByRole("button", { name: "Retry" })).toHaveLength(1);
  expect(screen.getByText("Projects unavailable")).toBeVisible();
  expect(screen.getByText("Import: unavailable")).toBeVisible();

  mode = "up";
  fireEvent.click(within(card()).getByRole("button", { name: "Retry" }));

  expect(await screen.findByText("No components")).toBeVisible();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  expect(screen.getByRole("button", { name: "Import: 9 files" })).toBeVisible();
  expect(screen.getByLabelText("2 open")).toBeVisible();
});

it("still shows the page error card for a 500, with the API's reason", async () => {
  mode = "500";
  renderApp();

  await screen.findByRole("alert");
  expect(card()).toHaveTextContent("Something went wrong");
  expect(card()).toHaveTextContent("database is locked");
  expect(screen.getByText("Import: unavailable")).toBeVisible();
});

it("hides cached header numbers while unreachable, polls with a backoff and recovers on its own", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  mode = "up";
  const client = renderApp();
  expect(await screen.findByLabelText("2 open")).toBeVisible();
  expect(
    await screen.findByRole("button", { name: "Import: 9 files" }),
  ).toBeVisible();

  mode = "down";
  await act(() => client.refetchQueries());

  await screen.findByRole("alert");
  expect(card()).toHaveTextContent(unreachable);
  expect(screen.getByText("Import: unavailable")).toBeVisible();
  expect(screen.queryByLabelText("2 open")).toBeNull();

  // The wait doubles from 5 s and stops growing at 30 s; there is no last attempt.
  for (const wait of [5, 10, 20, 30, 30, 30]) {
    const before = projectRequests;
    // one second short of the wait: nothing has been asked yet
    await act(() => vi.advanceTimersByTimeAsync((wait - 1) * 1000));
    expect(projectRequests).toBe(before);
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(projectRequests).toBe(before + 1);
    expect(card()).toHaveTextContent(unreachable);
  }

  mode = "up";
  await act(() => vi.advanceTimersByTimeAsync(30000));

  await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  expect(screen.getByText("No components")).toBeVisible();
  expect(screen.getByLabelText("2 open")).toBeVisible();
  expect(screen.getByRole("button", { name: "Import: 9 files" })).toBeVisible();
});

it("starts the backoff again at 5 s for the next outage", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  mode = "up";
  const client = renderApp();
  await screen.findByLabelText("2 open");

  for (let outage = 0; outage < 2; outage += 1) {
    mode = "down";
    await act(() => client.refetchQueries());
    await screen.findByRole("alert");
    await act(() => vi.advanceTimersByTimeAsync(5000)); // fails again: the next wait is 10 s
    mode = "up";
    const before = projectRequests;
    await act(() => vi.advanceTimersByTimeAsync(9000));
    expect(projectRequests).toBe(before);
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(projectRequests).toBe(before + 1);
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  }
});
