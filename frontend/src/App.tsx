import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import DashboardLayout from "@/components/DashboardLayout";
import Landing from "./pages/Landing";
import AuthPage from "./pages/Auth";
import WardOverview from "./pages/WardOverview";
import TelemetryMonitor from "./pages/TelemetryMonitor";
import Patients from "./pages/Patients";
import Alerts from "./pages/Alerts";
import LabResults from "./pages/LabResults";
import Medications from "./pages/Medications";
import DietManagement from "./pages/DietManagement";
import PatientAuth from "./pages/PatientAuth";
import PatientLayout from "./components/PatientLayout";
import PatientProtectedRoute from "./components/PatientProtectedRoute";
import PatientDashboard from "./pages/patient/PatientDashboard";
import PatientMedications from "./pages/patient/PatientMedications";
import PatientLabResults from "./pages/patient/PatientLabResults";
import PatientWearables from "./pages/patient/PatientWearables";
import Stub from "./pages/patient/Stub";
import Calibration from "./pages/Calibration";
import Surveillance from "./pages/Surveillance";
import NotFound from "./pages/NotFound";
import Wards from "./pages/Wards";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: (failureCount, error: unknown) => {
        if (typeof error === 'object' && error !== null && 'status' in error) {
          const status = (error as { status: number }).status;
          if (status >= 400 && status < 500) return false;
        }
        return failureCount < 2;
      },
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: 1,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/patient/auth" element={<PatientAuth />} />
            <Route
              path="/patient"
              element={
                <PatientProtectedRoute>
                  <PatientLayout />
                </PatientProtectedRoute>
              }
            >
              <Route path="dashboard" element={<PatientDashboard />} />
              <Route path="medications" element={<PatientMedications />} />
              <Route path="labs" element={<PatientLabResults />} />
              <Route path="appointments" element={<Stub title="My Appointments" />} />
              <Route path="visits" element={<Stub title="My Visits" />} />
              <Route path="wearables" element={<PatientWearables />} />
              <Route path="diet" element={<Stub title="My Diet Plan" />} />
              <Route index element={<Navigate to="/patient/dashboard" replace />} />
            </Route>
            <Route path="/dashboard" element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
              <Route index element={<Wards />} />
              <Route path="ward/:wardId" element={<WardOverview />} />
              {/* Allow both /dashboard/telemetry and /dashboard/telemetry/:patientId */}
              <Route path="telemetry" element={<TelemetryMonitor />} />
              <Route path="telemetry/:patientId" element={<TelemetryMonitor />} />
              <Route path="patients" element={<Patients />} />
              <Route path="alerts" element={<Alerts />} />
              <Route path="labs" element={<LabResults />} />
              <Route path="medications" element={<Medications />} />
              <Route path="diet" element={<DietManagement />} />
              <Route path="calibration" element={<Calibration />} />
              <Route path="surveillance" element={<Surveillance />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
