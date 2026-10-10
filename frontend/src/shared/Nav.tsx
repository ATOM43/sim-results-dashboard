import { NavLink, useSearchParams } from "react-router";
import { useApiError, useOpenDemandCount } from "./queries";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
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
    <aside className="flex flex-col gap-4 border-b p-4 md:w-56 md:shrink-0 md:border-r md:border-b-0">
      <nav className="flex flex-wrap gap-1 md:flex-col">
        {pages.map((page) => (
          <Button
            key={page.path}
            asChild
            variant="ghost"
            className="justify-start aria-[current=page]:bg-muted"
          >
            <NavLink to={{ pathname: page.path, search }}>
              {page.label}
              {page.path === "/demands" && openDemands !== undefined && (
                <Badge
                  variant="secondary"
                  className="ml-auto"
                  aria-label={`${openDemands} open`}
                >
                  {openDemands}
                </Badge>
              )}
            </NavLink>
          </Button>
        ))}
      </nav>
      <Card size="sm">
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
