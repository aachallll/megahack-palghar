/**
 * LiveAlertPanel — Real-time floating alert panel for the ICU dashboard.
 *
 * Sits on the right side of the screen, showing the latest critical/high
 * alerts as animated popup cards. Auto-refreshes via Supabase realtime.
 * New alerts slide in from the right with a red pulse animation.
 */

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useGlobalAlerts } from '@/hooks/useAlerts';
import {
  AlertTriangle,
  X,
  ChevronRight,
  Bell,
  BellOff,
  Clock,
  User,
  CheckCircle2,
  ShieldAlert,
} from 'lucide-react';
import type { ActiveAlert } from '@/types/database';

const SEVERITY_CONFIG: Record<string, { bg: string; border: string; icon: string; text: string; dot: string; glow: string }> = {
  critical: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    icon: 'text-red-500',
    text: 'text-red-700',
    dot: 'bg-red-500',
    glow: 'shadow-red-200/60',
  },
  high: {
    bg: 'bg-orange-50',
    border: 'border-orange-200',
    icon: 'text-orange-500',
    text: 'text-orange-700',
    dot: 'bg-orange-500',
    glow: 'shadow-orange-200/60',
  },
  medium: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    icon: 'text-amber-500',
    text: 'text-amber-700',
    dot: 'bg-amber-500',
    glow: 'shadow-amber-100/40',
  },
  low: {
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    icon: 'text-blue-500',
    text: 'text-blue-700',
    dot: 'bg-blue-400',
    glow: 'shadow-blue-100/30',
  },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

interface LiveAlertPanelProps {
  collapsed?: boolean;
}

export default function LiveAlertPanel({ collapsed }: LiveAlertPanelProps) {
  const navigate = useNavigate();
  const { data: alerts = [] } = useGlobalAlerts();
  const [isOpen, setIsOpen] = useState(true);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [newAlertIds, setNewAlertIds] = useState<Set<string>>(new Set());
  const prevAlertIdsRef = useRef<Set<string>>(new Set());

  // Track new alerts for animation
  useEffect(() => {
    const currentIds = new Set(alerts.map((a) => a.id));
    const newIds = new Set<string>();
    currentIds.forEach((id) => {
      if (!prevAlertIdsRef.current.has(id)) {
        newIds.add(id);
      }
    });
    if (newIds.size > 0) {
      setNewAlertIds((prev) => new Set([...prev, ...newIds]));
      // Clear the "new" indicator after 5 seconds
      setTimeout(() => {
        setNewAlertIds((prev) => {
          const next = new Set(prev);
          newIds.forEach((id) => next.delete(id));
          return next;
        });
      }, 5000);
    }
    prevAlertIdsRef.current = currentIds;
  }, [alerts]);

  const activeAlerts = alerts
    .filter((a) => a.status === 'active' && !dismissedIds.has(a.id))
    .slice(0, 8); // Show max 8 alerts

  const criticalCount = activeAlerts.filter((a) => a.severity === 'critical').length;
  const totalCount = activeAlerts.length;

  const dismissAlert = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDismissedIds((prev) => new Set([...prev, id]));
  };

  if (collapsed) return null;

  return (
    <>
      {/* Floating Toggle Button (when panel is closed) */}
      <AnimatePresence>
        {!isOpen && totalCount > 0 && (
          <motion.button
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            onClick={() => setIsOpen(true)}
            className="fixed right-4 top-16 z-40 flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-lg hover:shadow-xl transition-all group"
          >
            <div className="relative">
              <Bell className="h-4 w-4 text-gray-600 group-hover:text-primary transition-colors" />
              {criticalCount > 0 && (
                <motion.div
                  animate={{ scale: [1, 1.3, 1] }}
                  transition={{ duration: 1, repeat: Infinity }}
                  className="absolute -top-1.5 -right-1.5 h-4 w-4 bg-red-500 text-white rounded-full flex items-center justify-center text-[9px] font-bold"
                >
                  {criticalCount}
                </motion.div>
              )}
            </div>
            <span className="text-xs font-semibold text-gray-600">
              {totalCount} Alert{totalCount !== 1 ? 's' : ''}
            </span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Alert Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, x: 300 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 300 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed right-4 top-16 bottom-4 w-80 z-40 flex flex-col"
          >
            <div className="bg-white/95 backdrop-blur-lg border border-gray-200 rounded-2xl shadow-2xl flex flex-col overflow-hidden h-full">
              {/* Panel Header */}
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <ShieldAlert className="h-4.5 w-4.5 text-red-500" />
                    {criticalCount > 0 && (
                      <motion.div
                        animate={{ scale: [1, 1.4, 1] }}
                        transition={{ duration: 1.5, repeat: Infinity }}
                        className="absolute -top-0.5 -right-0.5 h-2 w-2 bg-red-500 rounded-full"
                      />
                    )}
                  </div>
                  <h3 className="text-sm font-bold text-gray-800">Live Alerts</h3>
                  {totalCount > 0 && (
                    <span className="bg-red-100 text-red-600 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                      {totalCount}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => navigate('/dashboard/alerts')}
                    className="text-xs text-primary font-semibold hover:underline"
                  >
                    View All
                  </button>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="p-1 hover:bg-gray-100 rounded-lg transition-colors text-gray-400 hover:text-gray-600"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Alert List */}
              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                <AnimatePresence mode="popLayout">
                  {activeAlerts.length === 0 ? (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex flex-col items-center justify-center py-12 text-center"
                    >
                      <div className="h-12 w-12 rounded-full bg-green-50 flex items-center justify-center mb-3">
                        <CheckCircle2 className="h-6 w-6 text-green-500" />
                      </div>
                      <p className="text-sm font-semibold text-gray-600">All Clear</p>
                      <p className="text-xs text-gray-400 mt-1">No active alerts at this time</p>
                    </motion.div>
                  ) : (
                    activeAlerts.map((alert, idx) => (
                      <AlertCard
                        key={alert.id}
                        alert={alert}
                        isNew={newAlertIds.has(alert.id)}
                        index={idx}
                        onDismiss={dismissAlert}
                        onNavigate={() => navigate(`/dashboard/telemetry/${alert.patient_id}`)}
                      />
                    ))
                  )}
                </AnimatePresence>
              </div>

              {/* Panel Footer */}
              {totalCount > 0 && (
                <div className="px-4 py-2.5 border-t border-gray-100 shrink-0">
                  <button
                    onClick={() => navigate('/dashboard/alerts')}
                    className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
                  >
                    Open Alerts Dashboard
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ─── Individual Alert Card ──────────────────────────────────────────────────

function AlertCard({
  alert,
  isNew,
  index,
  onDismiss,
  onNavigate,
}: {
  alert: ActiveAlert;
  isNew: boolean;
  index: number;
  onDismiss: (id: string, e: React.MouseEvent) => void;
  onNavigate: () => void;
}) {
  const config = SEVERITY_CONFIG[alert.severity] || SEVERITY_CONFIG.low;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 60, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 60, scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30, delay: index * 0.05 }}
      onClick={onNavigate}
      className={`
        relative p-3 rounded-xl border cursor-pointer transition-all group
        ${config.bg} ${config.border}
        hover:shadow-lg ${config.glow}
        ${isNew ? 'ring-2 ring-red-400/50 ring-offset-1' : ''}
      `}
    >
      {/* New indicator pulse */}
      {isNew && (
        <motion.div
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 5 }}
          className="absolute -top-1 -right-1"
        >
          <span className="flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
          </span>
        </motion.div>
      )}

      {/* Dismiss button */}
      <button
        onClick={(e) => onDismiss(alert.id, e)}
        className="absolute top-2 right-2 p-0.5 rounded-md opacity-0 group-hover:opacity-100 hover:bg-white/60 transition-all"
      >
        <X className="h-3 w-3 text-gray-400" />
      </button>

      {/* Header row */}
      <div className="flex items-start gap-2.5">
        <div className={`shrink-0 mt-0.5 ${config.icon}`}>
          <AlertTriangle className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          {/* Severity badge */}
          <div className="flex items-center gap-1.5 mb-1">
            <span className={`h-1.5 w-1.5 rounded-full ${config.dot} ${alert.severity === 'critical' ? 'animate-pulse' : ''}`} />
            <span className={`text-[10px] font-bold uppercase tracking-wider ${config.text}`}>
              {alert.severity}
            </span>
          </div>

          {/* Title */}
          <p className="text-xs font-semibold text-gray-800 leading-tight line-clamp-2 pr-4">
            {alert.title}
          </p>

          {/* Patient & time */}
          <div className="flex items-center gap-3 mt-1.5">
            <div className="flex items-center gap-1 text-[10px] text-gray-500">
              <User className="h-3 w-3" />
              <span className="font-medium truncate max-w-[100px]">{alert.patient_name || 'Unknown'}</span>
            </div>
            <div className="flex items-center gap-1 text-[10px] text-gray-400">
              <Clock className="h-3 w-3" />
              <span>{timeAgo(alert.created_at)}</span>
            </div>
          </div>

          {/* Message preview */}
          {alert.message && (
            <p className="text-[11px] text-gray-500 mt-1.5 line-clamp-2 leading-relaxed">
              {alert.message.replace(/\[.*?\]/g, '').trim().slice(0, 120)}
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
}
