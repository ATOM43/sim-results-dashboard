import { useQueryClient } from "@tanstack/react-query";
import { Button } from "./ui/button";

/** Refetches every query a mounted component is using. */
export function RetryButton() {
  const client = useQueryClient();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => client.refetchQueries({ type: "active" })}
    >
      Retry
    </Button>
  );
}
