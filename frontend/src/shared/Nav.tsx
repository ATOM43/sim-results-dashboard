import { NavLink, useSearchParams } from "react-router";
import { useOpenDemandCount } from "./queries";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";

const pages = [
  { path: "/revisions", label: "Revisions" },
  { path: "/compare", label: "Compare" },
  { path: "/demands", label: "Demands" },
];

export function Nav() {
  const openDemands = useOpenDemandCount().data;
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
        <CardContent className="text-sm text-muted-foreground">
          Pass: peak within 0–50 Hz ≤ 15.0 mm.
        </CardContent>
      </Card>
    </aside>
  );
}
