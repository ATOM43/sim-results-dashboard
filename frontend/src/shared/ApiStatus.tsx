import { useQuery } from "@tanstack/react-query";
import { getHealth } from "@/api/client";

export function ApiStatus() {
  const health = useQuery({
    queryKey: ["health"],
    queryFn: getHealth,
    retry: false,
  });

  if (health.isPending)
    return <p className="text-sm text-muted-foreground">API: checking…</p>;
  if (health.isError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        API: {health.error.message}
      </p>
    );
  }
  return (
    <p className="text-sm text-muted-foreground">API: {health.data.status}</p>
  );
}
