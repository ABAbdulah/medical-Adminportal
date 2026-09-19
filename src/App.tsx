import { Navigate, Route, Routes } from "react-router-dom";
import { AdminOnly, Layout } from "./components/Layout";
import { useAuth } from "./lib/auth";
import { Spinner } from "./components/ui";
import { Login } from "./pages/Login";
import { Overview } from "./pages/Overview";
import { Write } from "./pages/Write";
import { Import } from "./pages/Import";
import { Generate } from "./pages/Generate";
import { RequestDetail } from "./pages/RequestDetail";
import { ReviewQueue } from "./pages/ReviewQueue";
import { ReviewOne } from "./pages/ReviewOne";
import { Settings } from "./pages/Settings";
import { AdminDashboard } from "./pages/admin/Dashboard";
import { AdminUsers } from "./pages/admin/Users";
import { AdminQuestions } from "./pages/admin/Questions";
import { AdminRecalls } from "./pages/admin/Recalls";
import { AdminContent } from "./pages/admin/Content";
import { AdminDoctors } from "./pages/admin/Doctors";

export function App() {
  const { user, ready } = useAuth();

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner label="Checking your session…" />
      </div>
    );
  }
  if (!user) return <Login />;

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Overview />} />
        <Route path="write" element={<Write />} />
        <Route path="import" element={<Import />} />
        <Route path="generate" element={<Generate />} />
        <Route path="generate/:briefId" element={<RequestDetail />} />
        <Route path="review" element={<ReviewQueue />} />
        <Route path="review/:candidateId" element={<ReviewOne />} />
        <Route path="settings" element={<Settings />} />
        <Route path="admin" element={<AdminOnly><AdminDashboard /></AdminOnly>} />
        <Route path="admin/users" element={<AdminOnly><AdminUsers /></AdminOnly>} />
        <Route path="admin/questions" element={<AdminOnly><AdminQuestions /></AdminOnly>} />
        <Route path="admin/recalls" element={<AdminOnly><AdminRecalls /></AdminOnly>} />
        <Route path="admin/content" element={<AdminOnly><AdminContent /></AdminOnly>} />
        <Route path="admin/doctors" element={<AdminOnly><AdminDoctors /></AdminOnly>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
