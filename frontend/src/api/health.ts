import { request } from "./client";

export function getHealth() {
  return request<{ status: string }>("/api/health");
}
