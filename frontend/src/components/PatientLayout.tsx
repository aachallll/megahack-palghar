import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import {
  Activity,
  HeartPulse,
  CalendarDays,
  TestTube,
  Pill,
  Watch,
  Utensils,
  LogOut,
} from 'lucide-react';

const items = [
  { label: 'Overview', path: '/patient/dashboard', icon: HeartPulse },
  { label: 'Medications', path: '/patient/medications', icon: Pill },
  { label: 'Lab Reports', path: '/patient/labs', icon: TestTube },
  { label: 'Appointments', path: '/patient/appointments', icon: CalendarDays },
  { label: 'Wearables', path: '/patient/wearables', icon: Watch },
  { label: 'Diet', path: '/patient/diet', icon: Utensils },
];

export default function PatientLayout() {
  const { user, signOut } = useAuth();
  const location = useLocation();

  const isActive = (path: string) => location.pathname.startsWith(path);

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="w-[260px] border-r border-border bg-card hidden md:flex flex-col">
        <div className="h-16 px-4 border-b border-border flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-primary flex items-center justify-center">
            <Activity className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <div className="text-sm font-bold text-foreground tracking-tight">Prahari</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-widest">Patient Portal</div>
          </div>
        </div>

        <nav className="flex-1 px-2 py-4 space-y-0.5">
          {items.map((it) => {
            const active = isActive(it.path);
            return (
              <NavLink
                key={it.path}
                to={it.path}
                className="relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors overflow-hidden"
              >
                {active && (
                  <motion.div
                    layoutId="patient-sidebar-pill"
                    className="absolute inset-0 rounded-xl bg-sidebar-accent"
                    transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                  />
                )}
                <it.icon className={`h-4 w-4 relative z-10 ${active ? 'text-sidebar-accent-foreground' : 'text-muted-foreground'}`} />
                <span className={`relative z-10 ${active ? 'text-sidebar-accent-foreground' : 'text-muted-foreground'}`}>
                  {it.label}
                </span>
              </NavLink>
            );
          })}
        </nav>

        <div className="border-t border-border p-3 space-y-2">
          {user && (
            <div className="px-2">
              <div className="text-sm font-medium text-foreground truncate">{user.name}</div>
              <div className="text-xs text-muted-foreground truncate">{user.email}</div>
            </div>
          )}
          <button
            onClick={() => signOut()}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm border border-border hover:bg-muted transition-colors text-muted-foreground"
          >
            <LogOut className="h-4 w-4" />
            Logout
          </button>
        </div>
      </aside>

      <main className="flex-1">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.2 }}
            className="p-6 md:p-8"
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}

