import { Navigate, NavLink, Route, Routes } from "react-router";
import { ComparePage } from "@/compare/ComparePage";
import { DemandsPage } from "@/demands/DemandsPage";
import { RevisionsPage } from "@/revisions/RevisionsPage";
import { ApiStatus } from "@/shared/ApiStatus";

const pages = [
  { path: "/revisions", label: "Revisions" },
  { path: "/compare", label: "Compare" },
  { path: "/demands", label: "Demands" },
];

function App() {
  return (
    <div className="min-h-screen">
      <header className="flex items-center gap-6 border-b px-6 py-3">
        <span className="font-semibold">Simulation Results</span>
        <nav className="flex gap-4">
          {pages.map((page) => (
            <NavLink
              key={page.path}
              to={page.path}
              className={({ isActive }) =>
                isActive
                  ? "font-medium"
                  : "text-muted-foreground hover:text-foreground"
              }
            >
              {page.label}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto">
          <ApiStatus />
        </div>
      </header>
      <main className="p-6">
        <Routes>
          <Route index element={<Navigate to="/revisions" replace />} />
          <Route path="/revisions" element={<RevisionsPage />} />
          <Route path="/compare" element={<ComparePage />} />
          <Route path="/demands" element={<DemandsPage />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
