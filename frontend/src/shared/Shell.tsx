import type { ReactNode } from "react";
import { Header } from "./Header";
import { Nav } from "./Nav";

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <div className="flex flex-1 flex-col md:flex-row">
        <Nav />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
