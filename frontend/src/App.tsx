import { Navigate, Route, Routes, useLocation } from "react-router";
import { ComparePage } from "@/compare/ComparePage";
import { DemandsPage } from "@/demands/DemandsPage";
import { RevisionsPage } from "@/revisions/RevisionsPage";
import { Shell } from "@/shared/Shell";

function App() {
  const { search } = useLocation();
  return (
    <Shell>
      <Routes>
        <Route path="/revisions" element={<RevisionsPage />} />
        <Route path="/compare" element={<ComparePage />} />
        <Route path="/demands" element={<DemandsPage />} />
        <Route
          path="*"
          element={<Navigate to={{ pathname: "/revisions", search }} replace />}
        />
      </Routes>
    </Shell>
  );
}

export default App;
