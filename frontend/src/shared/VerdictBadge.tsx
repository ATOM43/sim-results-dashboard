import { CircleCheck, CircleX } from "lucide-react";
import { Badge } from "./ui/badge";

export function VerdictBadge({ verdict }: { verdict: "PASS" | "FAIL" }) {
  const pass = verdict === "PASS";
  const Icon = pass ? CircleCheck : CircleX;
  return (
    <Badge
      variant={pass ? "outline" : "destructive"}
      className={
        pass
          ? "border-success-border bg-success text-success-foreground"
          : undefined
      }
    >
      <Icon aria-hidden data-icon="inline-start" data-verdict-icon={verdict} />
      {verdict}
    </Badge>
  );
}
