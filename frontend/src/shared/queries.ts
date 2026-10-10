import { useQuery } from "@tanstack/react-query";
import { getOpenDemandCount } from "@/api/demands";
import { getImportStatus } from "@/api/imports";
import { getProjects } from "@/api/projects";
import { useUrlState } from "@/shared/useUrlState";

export function useProjects() {
  return useQuery({ queryKey: ["projects"], queryFn: getProjects });
}

export function useImportStatus() {
  return useQuery({ queryKey: ["import-status"], queryFn: getImportStatus });
}

/** Open demands in the selected project. Idle until a project is known. */
export function useOpenDemandCount() {
  const [project] = useSelectedProject();
  return useQuery({
    queryKey: ["demands", "open-count", project?.id],
    queryFn: () => getOpenDemandCount(project!.id),
    enabled: project !== undefined,
  });
}

/** The project named by ?project=<id>, else the first one. Undefined until projects load. */
export function useSelectedProject() {
  const [param, setProject] = useUrlState("project");
  const projects = useProjects().data ?? [];
  const project =
    projects.find((p) => String(p.id) === param) ?? projects.at(0);
  return [project, setProject] as const;
}
