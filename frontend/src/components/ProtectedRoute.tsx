import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { Activity } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { session, loading } = useAuth();

  // Jab tak loading hai — kuch bhi render mat karo
  // Yahi tha root cause — bina loading check ke Navigate fire ho raha tha
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Activity className="h-6 w-6 text-primary animate-pulse" />
          </div>
          <div className="space-y-1 text-center">
            <p className="text-sm font-medium text-foreground">
              Prahari ICU Intelligence
            </p>
            <p className="text-xs text-muted-foreground animate-pulse">
              Initializing clinical systems...
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Session nahi hai — login pe bhejo
  if (!session) {
    return <Navigate to="/auth" replace />;
  }

  // Session hai — page dikhao
  return <>{children}</>;
}