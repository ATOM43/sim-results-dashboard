const BASE_URL: string =
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
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, init);
  } catch {
    throw new Error(
      `Cannot reach the API at ${BASE_URL}. Is the backend running?`,
    );
  }
  if (!response.ok) {
    throw new ApiError(
      response.status,
      `API returned ${response.status} ${response.statusText} for ${path}`,
    );
  }
  return (await response.json()) as T;
}

export function getHealth() {
  return request<{ status: string }>("/api/health");
}
