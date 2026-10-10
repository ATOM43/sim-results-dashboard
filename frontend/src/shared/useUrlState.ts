import { useSearchParams } from "react-router";

/** One URL query param as state: [value, set]. Setting null removes it; other params and the route are kept. */
export function useUrlState(key: string) {
  const [params, setParams] = useSearchParams();
  const set = (value: string | null) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value === null) next.delete(key);
      else next.set(key, value);
      return next;
    });
  return [params.get(key), set] as const;
}
