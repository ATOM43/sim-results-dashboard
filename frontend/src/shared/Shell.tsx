import type { ReactNode } from "react";
import { Header } from "./Header";
import { Nav } from "./Nav";
import { useImportStatus, useOpenDemandCount, useProjects } from "./queries";

export function Shell({ children }: { children: ReactNode }) {
  // One banner for all header queries, so a dead backend reads as one message, not three.
  const error = [useProjects(), useImportStatus(), useOpenDemandCount()].find(
    (query) => query.isError,
  )?.error;

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      {error && (
        <p
          role="alert"
          className="border-b bg-destructive/10 px-6 py-2 text-sm text-destructive"
        >
          {error.message}
        </p>
      )}
      <div className="flex flex-1 flex-col md:flex-row">
        <Nav />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
