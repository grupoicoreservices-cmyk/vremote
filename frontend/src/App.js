import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import Layout from "@/components/Layout";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Devices from "@/pages/Devices";
import Sessions from "@/pages/Sessions";
import Users from "@/pages/Users";
import AddressBook from "@/pages/AddressBook";
import AuditLogs from "@/pages/AuditLogs";
import AccessTokens from "@/pages/AccessTokens";
import Agent from "@/pages/Agent";
import Settings from "@/pages/Settings";
import { Toaster } from "@/components/ui/sonner";

function App() {
  return (
    <div className="App dark">
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Dashboard />} />
              <Route path="devices" element={<Devices />} />
              <Route path="sessions" element={<Sessions />} />
              <Route path="address-book" element={<AddressBook />} />
              <Route path="audit-logs" element={<AuditLogs />} />
              <Route path="users" element={<ProtectedRoute requireAdmin><Users /></ProtectedRoute>} />
              <Route path="access-tokens" element={<ProtectedRoute requireAdmin><AccessTokens /></ProtectedRoute>} />
              <Route path="agent" element={<Agent />} />
              <Route path="settings" element={<Settings />} />
            </Route>
          </Routes>
        </BrowserRouter>
        <Toaster theme="dark" />
      </AuthProvider>
    </div>
  );
}

export default App;
