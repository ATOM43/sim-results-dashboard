import { NavLink, useSearchParams } from "react-router";
import { useApiError, useOpenDemandCount } from "./queries";
import { Card, CardContent } from "./ui/card";

const pages = [
  { path: "/revisions", label: "Revisions" },
  { path: "/compare", label: "Compare" },
  { path: "/demands", label: "Demands" },
];

export function Nav() {
  const count = useOpenDemandCount().data;
  // Hidden rather than stale while the API is failing.
  const openDemands = useApiError() ? undefined : count;
  // Only the project follows you between pages; page-specific params (component, rev) do not.
  const project = useSearchParams()[0].get("project");
  const search = project ? `?project=${encodeURIComponent(project)}` : "";

  return (
    <aside className="flex flex-col gap-4 border-b bg-card p-4 md:w-56 md:shrink-0 md:overflow-y-auto md:border-r md:border-b-0">
      <nav className="flex flex-wrap gap-1 md:flex-col">
        {pages.map((page) => (
          <NavLink
            key={page.path}
            to={{ pathname: page.path, search }}
            // NavLink sets aria-current="page" on the active item. Three states: idle (no fill), hover (grey fill),
            // active (primary tint plus a 3 px bar, which still marks it in greyscale).
            className="group relative flex h-8 items-center gap-2 rounded-lg px-3 text-sm font-medium text-muted-foreground outline-none transition-colors duration-150 not-aria-[current=page]:hover:bg-muted not-aria-[current=page]:hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 aria-[current=page]:bg-primary/10 aria-[current=page]:text-primary aria-[current=page]:before:absolute aria-[current=page]:before:inset-y-1.5 aria-[current=page]:before:left-0 aria-[current=page]:before:w-[3px] aria-[current=page]:before:rounded-full aria-[current=page]:before:bg-primary"
          >
            {page.label}
            {page.path === "/demands" && openDemands !== undefined && (
              <span
                aria-label={`${openDemands} open`}
                className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums transition-colors duration-150 group-[:not([aria-current=page]):hover]:bg-card in-aria-[current=page]:bg-primary/15"
              >
                {openDemands}
              </span>
            )}
          </NavLink>
        ))}
      </nav>
      {/* Bottom of the column; when the column is shorter than its content, the column scrolls. */}
      <Card size="sm" className="shrink-0 md:mt-auto">
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>Pass: peak within 0–50 Hz ≤ 15.0 mm.</p>
          {/* Same fill and stroke as the FrequencyChart band and limit line. */}
          <p className="flex items-center gap-2">
            <span
              aria-hidden
              className="h-3 w-5 rounded-sm border bg-assessed"
            />
            Assessed range
          </p>
          <p className="flex items-center gap-2">
            <span
              aria-hidden
              className="w-5 border-t-2 border-dashed border-warning-foreground"
            />
            15.0 mm limit
          </p>
          <p className="text-xs">
            Samples above 50 Hz are plotted but not assessed. This is a
            data-review criterion, not a safety assessment.
          </p>
        </CardContent>
      </Card>
    </aside>
  );
}
