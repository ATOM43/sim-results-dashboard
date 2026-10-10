import { request } from "./client";

export type ImportFile = {
  source_key: string;
  status: string;
  warnings: string[];
  last_imported_at: string;
  error_message: string | null;
};

export type ImportStatus = {
  last_imported_at: string | null;
  counts: { imported: number; failed: number; missing: number };
  files: ImportFile[];
};

export function getImportStatus() {
  return request<ImportStatus>("/api/import/status");
}
