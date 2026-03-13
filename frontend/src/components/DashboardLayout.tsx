import { useState, useEffect } from 'react';
import { NavLink, useLocation, Outlet } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import LiveAlertPanel from '@/components/LiveAlertPanel';
import {
  Activity,
  LayoutGrid,
  Monitor,
  Users,
  Bell,
  FlaskConical,
  Pill,
  Settings,
  LogOut,
  Camera,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  Utensils
} from 'lucide-react';

const navItems = [
  { label: 'Ward Overview', path: '/dashboard', icon: LayoutGrid, exact: true },
  { label: 'Telemetry Monitor', path: '/dashboard/telemetry', icon: Monitor, exact: false },
  { label: 'Patients', path: '/dashboard/patients', icon: Users, exact: false },
  { label: 'Alerts', path: '/dashboard/alerts', icon: Bell, exact: false },
  { label: 'Lab Results', path: '/dashboard/labs', icon: FlaskConical, exact: false },
  { label: 'Medications', path: '/dashboard/medications', icon: Pill, exact: false },
  { label: 'Diet Management', path: '/dashboard/diet', icon: Utensils, exact: false },
  { label: 'Calibration', path: '/dashboard/calibration', icon: Settings, exact: false },
  { label: 'Surveillance', path: '/dashboard/surveillance', icon: Camera, exact: false },
];

const roleBadgeColors: Record<string, string> = {
  admin: 'bg-vital-hr/10 text-vital-hr',
  doctor: 'bg-vital-spo2/10 text-vital-spo2',
  nurse: 'bg-vital-bp/10 text-vital-bp',
  technician: 'bg-vital-rr/10 text-vital-rr',
  receptionist: 'bg-vital-temp/10 text-vital-temp',
};

const SIDEBAR_EXPANDED = 240;
const SIDEBAR_COLLAPSED = 64;

export default function DashboardLayout() {
  const { user, signOut } = useAuth();
  const location = useLocation();
  
  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem('prahari-sidebar-collapsed') === 'true';
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  const LogoutNavItem = () => {
    const { signOut } = useAuth();
    const [showConfirm, setShowConfirm] = useState(false);
    
    const handleLogout = () => {
      setShowConfirm(true);
    };
    
    const confirmLogout = () => {
      signOut();
      setShowConfirm(false);
    };
    
    return (
      <>
        <button
          onClick={handleLogout}
          className="relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors overflow-hidden w-full text-left hover:bg-red-50 hover:text-red-600 group"
          style={{ justifyContent: collapsed ? 'center' : 'flex-start' }}
        >
          <LogOut className="h-4 w-4 text-muted-foreground group-hover:text-red-600" />
          <AnimatePresence>
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.2 }}
                className="relative z-10 whitespace-nowrap overflow-hidden text-muted-foreground group-hover:text-red-600"
              >
                Logout
              </motion.span>
            )}
          </AnimatePresence>
        </button>
        
        {showConfirm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-card border border-border rounded-xl p-6 max-w-sm mx-4"
            >
              <h3 className="text-lg font-semibold mb-2">Confirm Logout</h3>
              <p className="text-sm text-muted-foreground mb-4">Are you sure you want to log out?</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowConfirm(false)}
                  className="flex-1 px-4 py-2 text-sm font-medium rounded-lg border border-border hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmLogout}
                  className="flex-1 px-4 py-2 text-sm font-medium rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors"
                >
                  Logout
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </>
    );
  };

  useEffect(() => {
    localStorage.setItem('prahari-sidebar-collapsed', String(collapsed));
  }, [collapsed]);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const isActive = (navItem: typeof navItems[0]) => {
    return navItem.exact
      ? location.pathname === navItem.path
      : location.pathname.startsWith(navItem.path);
  };

  const NavItem = ({ item }: { item: typeof navItems[0] }) => {
    const [showTooltip, setShowTooltip] = useState(false);
    const active = isActive(item);
    
    return (
      <div 
        className="relative group"
        onMouseEnter={() => collapsed && setShowTooltip(true)}
        onMouseLeave={() => collapsed && setShowTooltip(false)}
      >
        <NavLink
          to={item.path}
          className="relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors overflow-hidden"
          style={{ justifyContent: collapsed ? 'center' : 'flex-start' }}
        >
          {active && (
            <motion.div
              layoutId="sidebar-pill"
              className="absolute inset-0 rounded-xl bg-sidebar-accent"
              transition={{ type: 'spring', stiffness: 350, damping: 30 }}
            />
          )}
          <item.icon 
            className={`h-4 w-4 relative z-10 shrink-0 ${
              active ? 'text-sidebar-accent-foreground' : 'text-muted-foreground group-hover:text-foreground'
            }`} 
          />
          <AnimatePresence>
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.2 }}
                className="relative z-10 whitespace-nowrap overflow-hidden"
              >
                <span className={active ? 'text-sidebar-accent-foreground' : 'text-muted-foreground group-hover:text-foreground'}>
                  {item.label}
                </span>
              </motion.span>
            )}
          </AnimatePresence>
        </NavLink>
        
        {collapsed && showTooltip && (
          <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 bg-foreground text-background text-xs px-2 py-1 rounded-lg whitespace-nowrap z-50 pointer-events-none">
            {item.label}
          </div>
        )}
      </div>
    );
  };

  const SidebarContent = () => (
    <>
      {/* Logo Section */}
      <div className="flex items-center h-16 px-4 border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-primary flex items-center justify-center">
            <Activity className="h-4.5 w-4.5 text-primary-foreground" />
          </div>
          <AnimatePresence>
            {!collapsed && (
              <motion.div
                animate={{ opacity: collapsed ? 0 : 1, width: collapsed ? 0 : 'auto' }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <h1 className="text-base font-bold text-foreground tracking-tight">Prahari</h1>
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest">ICU Intelligence</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Navigation Section */}
      <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => (
          <NavItem key={item.path} item={item} />
        ))}
        
        {/* Logout Section */}
        <div className="mt-4 pt-4 border-t border-border border-dashed">
          <LogoutNavItem />
        </div>
      </nav>

      {/* User Section */}
      <div className="border-t border-border p-2 shrink-0">
        {user && (
          <div className="space-y-2">
            {/* User Info */}
            <div className="flex items-center gap-3 px-2 py-2 rounded-xl" style={{ justifyContent: collapsed ? 'center' : 'flex-start' }}>
              <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground">
                {user.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
              </div>
              <AnimatePresence>
                {!collapsed && (
                  <motion.div
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: 'auto' }}
                    exit={{ opacity: 0, width: 0 }}
                    transition={{ duration: 0.2 }}
                    className="flex-1 min-w-0"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{user.name}</p>
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium uppercase ${roleBadgeColors[user.role] || 'bg-muted text-muted-foreground'}`}>
                        {user.role}
                      </span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            
            {/* Quick Logout Button */}
            <button 
              onClick={() => {
                if (confirm('Are you sure you want to log out?')) {
                  signOut();
                }
              }} 
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors bg-red-50 hover:bg-red-100 text-red-600 hover:text-red-700 border border-red-200 group"
              style={{ justifyContent: collapsed ? 'center' : 'flex-start' }}
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
              <AnimatePresence>
                {!collapsed && (
                  <motion.span
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: 'auto' }}
                    exit={{ opacity: 0, width: 0 }}
                    transition={{ duration: 0.2 }}
                    className="font-medium"
                  >
                    Logout
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
          </div>
        )}
        
        {/* Collapse Toggle Button */}
        <button 
          onClick={() => setCollapsed(!collapsed)} 
          className="w-full flex items-center justify-center h-8 mt-1 rounded-xl hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen bg-background">
      {/* Mobile Overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 z-40 md:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Desktop Sidebar */}
      <motion.aside
        animate={{ width: collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="fixed left-0 top-0 bottom-0 z-50 bg-card border-r border-border flex flex-col overflow-hidden hidden md:flex"
      >
        <SidebarContent />
      </motion.aside>

      {/* Mobile Sidebar */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.aside
            initial={{ x: -SIDEBAR_EXPANDED }}
            animate={{ x: 0 }}
            exit={{ x: -SIDEBAR_EXPANDED }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed left-0 top-0 bottom-0 z-50 bg-card border-r border-border flex flex-col overflow-hidden flex md:hidden"
            style={{ width: SIDEBAR_EXPANDED }}
          >
            <SidebarContent />
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Mobile Header */}
      <div className="fixed top-0 left-0 right-0 h-14 bg-card border-b border-border flex items-center px-4 gap-3 z-30 md:hidden">
        <button onClick={() => setMobileOpen(true)} className="text-muted-foreground hover:text-foreground transition-colors">
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-3 flex-1">
          <Activity className="h-5 w-5 text-primary" />
          <h1 className="text-base font-bold text-foreground">Prahari</h1>
        </div>
        {user && (
          <button 
            onClick={() => {
              if (confirm('Are you sure you want to log out?')) {
                signOut();
              }
            }} 
            className="text-muted-foreground hover:text-red-500 transition-colors"
            title="Sign out"
          >
            <LogOut className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Main Content */}
      <motion.main
        animate={{ 
          marginLeft: collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED,
          paddingTop: 0 // Desktop has no top padding
        }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="flex-1 min-h-screen hidden md:block"
      >
        {/* Desktop Header with Logout */}
        {user && (
          <div className="fixed top-4 right-4 z-50">
            <button 
              onClick={() => {
                if (confirm('Are you sure you want to log out?')) {
                  signOut();
                }
              }} 
              className="bg-card hover:bg-red-50 text-muted-foreground hover:text-red-500 border border-border rounded-lg p-2 transition-colors shadow-sm"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        )}
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -16 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="p-6 md:p-8"
        >
          <Outlet />
        </motion.div>
      </motion.main>

      {/* Mobile Main Content */}
      <main className="flex-1 min-h-screen md:hidden pt-14">
        {/* Mobile Floating Logout Button */}
        {user && (
          <div className="fixed bottom-4 right-4 z-50">
            <button 
              onClick={() => {
                if (confirm('Are you sure you want to log out?')) {
                  signOut();
                }
              }} 
              className="bg-red-500 hover:bg-red-600 text-white rounded-full p-3 shadow-lg transition-colors"
              title="Sign out"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        )}
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -16 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="p-6"
        >
          <Outlet />
        </motion.div>
      </main>

      {/* Live Alert Panel — Desktop only */}
      <div className="hidden md:block">
        <LiveAlertPanel />
      </div>
    </div>
  );
}