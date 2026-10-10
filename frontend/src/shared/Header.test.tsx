import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import { Header } from "./Header";

const file = (source_key: string, status = "imported", extra = {}) => ({
  source_key,
  status,
  warnings: [],
  last_imported_at: "2026-10-10T12:00:00Z",
  error_message: null,
  ...extra,
});
const clean = [file("rev1/Bracket.csv"), file("rev1/Lens.csv")];

/** Renders the header against an import status built from `files`; `undefined` makes the API fail. */
function renderWith(files?: ReturnType<typeof file>[]) {
  const count = (status: string) =>
    files!.filter((f) => f.status === status).length;
  vi.stubGlobal("fetch", async (input: string) => {
    const path = new URL(input).pathname;
    if (path === "/api/projects")
      return Response.json([{ id: 1, name: "Demo" }]);
    if (path === "/api/demands") return Response.json([]);
    if (path === "/api/import/status" && files)
      return Response.json({
        last_imported_at: "2026-10-10T12:00:00Z",
        counts: {
          imported: count("imported"),
          failed: count("failed"),
          missing: count("missing"),
        },
        files,
      });
    return new Response(null, { status: 500 });
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

it("shows a plain badge with the file count when every file imported", async () => {
  renderWith(clean);
  const badge = await screen.findByRole("button", { name: "Import: 2 files" });
  expect(badge).not.toHaveClass("bg-warning");

  fireEvent.click(badge);
  const dialog = await screen.findByRole("dialog");
  expect(
    within(dialog).getByText(/^2 imported, 0 failed, 0 missing/),
  ).toBeVisible();
  expect(within(dialog).getAllByRole("listitem")).toHaveLength(2);
  expect(within(dialog).queryByText(/failed$|missing$/)).toBeNull();
});

it("turns amber and lists failed and missing files first, each with its reason", async () => {
  renderWith([
    ...clean,
    file("rev1/Housing.csv", "missing", {
      // left over from an earlier failed import; the file is gone now
      error_message: "rev1/Housing.csv: file is empty",
    }),
    file("rev5/Lens.csv", "failed", {
      error_message:
        "rev5/Lens.csv line 2: magnitude 'abc' is not a number\nrev5/Lens.csv line 3: duplicate frequency 5 Hz (already on line 2)",
    }),
    file("rev2/Lens.csv", "imported", { warnings: ["data ends at 150 Hz"] }),
  ]);
  const badge = await screen.findByRole("button", {
    name: "Import: 1 failed, 1 missing",
  });
  expect(badge).toHaveClass("bg-warning", "text-warning-foreground");

  fireEvent.click(badge);
  const dialog = await screen.findByRole("dialog");
  expect(
    within(dialog).getByText(/^3 imported, 1 failed, 1 missing/),
  ).toBeVisible();
  const [missing, failed, ...imported] =
    within(dialog).getAllByRole("listitem");
  expect(missing).toHaveTextContent(
    "rev1/Housing.csv: no longer in the inputs folder; the last imported result is kept",
  );
  expect(missing).not.toHaveTextContent("file is empty");
  expect(within(missing).getByText("missing")).toHaveClass("bg-warning");
  // both problems of the one file are shown, one per line
  const reason = within(failed).getByText(/magnitude 'abc' is not a number/);
  expect(reason).toHaveTextContent("duplicate frequency 5 Hz");
  expect(reason).toHaveClass("whitespace-pre-line");
  expect(within(failed).getByText("failed")).toHaveClass("bg-warning");
  expect(imported).toHaveLength(3);
  expect(within(imported[0]).getByText("imported")).not.toHaveClass(
    "bg-warning",
  );
  expect(imported[2]).toHaveTextContent("Warning: data ends at 150 Hz");
});

it("says the import status is unavailable when the API fails", async () => {
  renderWith();
  expect(await screen.findByText("Import: unavailable")).toBeVisible();
  expect(screen.queryByRole("button", { name: /^Import:/ })).toBeNull();
});
