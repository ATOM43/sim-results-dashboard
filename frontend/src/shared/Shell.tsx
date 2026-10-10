import type { ReactNode } from "react";
import { Header } from "./Header";
import { Nav } from "./Nav";

export function Shell({ children }: { children: ReactNode }) {
  return (
    // From md up the shell fills the viewport and only <main> scrolls, so the header and nav stay put.
    // Below md the nav stacks above the content and the page scrolls as one.
    <div className="flex min-h-dvh flex-col md:h-dvh md:overflow-hidden">
      <Header />
      <div className="flex flex-1 flex-col md:min-h-0 md:flex-row">
        <Nav />
        <main className="flex-1 p-6 md:min-w-0 md:overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
