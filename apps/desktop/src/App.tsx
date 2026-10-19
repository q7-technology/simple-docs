import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { RequireAuth, RequireScope } from "./auth/guards";
import { Account } from "./pages/Account";
import { OrgSettings } from "./pages/OrgSettings";
import { SettingsHome, SettingsLayout } from "./pages/Settings";
import { SetUp } from "./pages/SetUp";
import { SignIn } from "./pages/SignIn";
import { SOON, Soon } from "./pages/Soon";
import { Users } from "./pages/Users";
import { Layout } from "./ui/Layout";
import { StarField } from "./ui/StarField";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/sign-in" element={<SignIn />} />
      <Route path="/setup" element={<SetUp />} />
      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/documents" replace />} />
          <Route path="/documents" element={<Soon {...SOON.documents} />} />
          <Route path="/clients" element={<Soon {...SOON.clients} />} />
          <Route path="/account" element={<Account />} />
          <Route element={<RequireScope scope="templates:write" />}>
            <Route path="/templates" element={<Soon {...SOON.templates} />} />
          </Route>
          <Route element={<RequireScope scope="spend:read" />}>
            <Route path="/spend" element={<Soon {...SOON.spend} />} />
          </Route>
          <Route element={<RequireScope scope="settings:write" />}>
            <Route path="/settings" element={<SettingsLayout />}>
              <Route index element={<SettingsHome />} />
              {/* as the API asks: Settings needs settings:write, Users users:write too */}
              <Route element={<RequireScope scope="users:write" />}>
                <Route path="users" element={<Users />} />
              </Route>
              <Route path="org" element={<OrgSettings />} />
            </Route>
          </Route>
        </Route>
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
