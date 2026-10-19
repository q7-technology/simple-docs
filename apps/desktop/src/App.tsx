import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { RequireAuth } from "./auth/guards";
import { SetUp } from "./pages/SetUp";
import { SignIn } from "./pages/SignIn";
import { StarField } from "./ui/StarField";

/** Until the shell (Task 22). */
function SignedIn() {
  return (
    <main id="main" className="relative z-10 p-8">
      <h1 className="text-section-title-sm">Signed in</h1>
    </main>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/sign-in" element={<SignIn />} />
      <Route path="/setup" element={<SetUp />} />
      <Route element={<RequireAuth />}>
        <Route index element={<SignedIn />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <StarField />
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
