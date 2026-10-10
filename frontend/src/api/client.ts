export const BASE_URL: string =
  import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** Typed fetch: resolves with the JSON body, rejects on network failure or any non-2xx response. */
export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, init);
  } catch {
    throw new Error(
      `Cannot reach the API at ${BASE_URL}. Is the backend running?`,
    );
  }
  if (!response.ok) {
    // FastAPI puts a string in `detail` for HTTPException and a list of {loc, msg} for validation errors.
    const body: unknown = await response.json().catch(() => null);
    const detail = (body as { detail?: unknown } | null)?.detail;
    throw new ApiError(
      response.status,
      typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? detail
              .map(
                (e: { loc: unknown[]; msg: string }) =>
                  `${e.loc.slice(1).join(".")}: ${e.msg}`,
              )
              .join("; ")
          : `${response.status} ${response.statusText}`,
    );
  }
  return (await response.json()) as T;
}
