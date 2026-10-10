import { useSearchParams } from "react-router";

/** One URL query param as state: [value, set]. Setting null removes it; other params and the route are kept. `replace` keeps per-keystroke values out of the history. */
export function useUrlState(key: string, options?: { replace?: boolean }) {
  const [params, setParams] = useSearchParams();
  const set = (value: string | null) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value === null) next.delete(key);
      else next.set(key, value);
      return next;
    }, options);
  return [params.get(key), set] as const;
}
