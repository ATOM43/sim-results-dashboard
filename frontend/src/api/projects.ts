import { request } from "./client";

export type Project = {
  id: number;
  name: string;
  component_count: number;
  revision_count: number;
};

export function getProjects() {
  return request<Project[]>("/api/projects");
}
