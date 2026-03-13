import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Activity } from 'lucide-react';

export default function PatientProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading, user } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Activity className="h-6 w-6 text-primary animate-pulse" />
          </div>
          <div className="space-y-1 text-center">
            <p className="text-sm font-medium text-foreground">Prahari Patient Portal</p>
            <p className="text-xs text-muted-foreground animate-pulse">Loading your health dashboard...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!session) return <Navigate to="/patient/auth" replace />;

  // Must be mapped profile role=patient
  if (!user || user.role !== 'patient') return <Navigate to="/dashboard" replace />;

  return <>{children}</>;
}

