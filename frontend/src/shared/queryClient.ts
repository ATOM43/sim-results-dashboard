import { QueryClient, type Query } from "@tanstack/react-query";
import { ApiError } from "@/api/client";

const RECOVERY_POLL_MS = 5000;
const RECOVERY_POLL_MAX_MS = 30000;

export function makeQueryClient() {
  // Each query's error count when it last was not failing; the errors since then are its current outage.
  const errorsBefore = new WeakMap<Query, number>();
  return new QueryClient({
    defaultOptions: {
      queries: {
        // One retry: a stopped backend surfaces as an error in about a second, not after the default three backoffs.
        retry: 1,
        // A query that could not reach the API keeps trying, so the app recovers on its own: after 5 s, then
        // doubling up to 30 s, so a long outage is not polled hard. An answer the API gave (404, 400…) is an
        // ApiError and is not polled: asking again would only repeat it.
        refetchInterval: (query: Query) => {
          const { status, error, errorUpdateCount } = query.state;
          if (status !== "error" || error instanceof ApiError) {
            errorsBefore.set(query, errorUpdateCount);
            return false;
          }
          const failures = errorUpdateCount - (errorsBefore.get(query) ?? 0);
          return Math.min(
            RECOVERY_POLL_MS * 2 ** (failures - 1),
            RECOVERY_POLL_MAX_MS,
          );
        },
      },
    },
  });
}
