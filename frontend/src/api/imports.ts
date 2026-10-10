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

/** What one sync of the inputs folder did. */
export type ImportReport = {
  inserted: number;
  updated: number;
  unchanged: number;
  failed: number;
  missing: string[];
  skipped: string[];
};

/** Re-syncs the server's configured inputs folder. Takes no path on purpose. */
export function runImport() {
  return request<ImportReport>("/api/import", { method: "POST" });
}
