import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import RiskBadge from '@/components/RiskBadge';
import AnimatedNumber from '@/components/AnimatedNumber';
import SkeletonCard from '@/components/SkeletonCard';
import { useGlobalAlerts, useAcknowledgeAlert, useClearAllAlerts } from '@/hooks/useAlerts';
import { AlertSeverity, AlertStatus } from '@/types/database';
import { Search, Filter, RotateCcw, CheckCircle2, AlertTriangle, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

interface AlertFilters {
  severity: AlertSeverity | 'all';
  status: AlertStatus | 'all';
  type: string | 'all';
  search: string;
}

const severityColors = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#10b981'
};

const severityBgColors = {
  critical: 'bg-red-50',
  high: 'bg-orange-50',
  medium: 'bg-yellow-50',
  low: 'bg-green-50'
};

export default function Alerts() {
  const navigate = useNavigate();
  const { user, hasRole } = useAuth();
  const { data: alerts = [], isLoading } = useGlobalAlerts();
  const ackMutation = useAcknowledgeAlert();
  const clearAllMutation = useClearAllAlerts();

  const [filters, setFilters] = useState<AlertFilters>({
    severity: 'all',
    status: 'all',
    type: 'all',
    search: ''
  });
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 25;

  const alertTypes = useMemo(() => {
    return [...new Set(alerts.map(a => a.type).filter(Boolean))];
  }, [alerts]);

  const handleClearAll = async () => {
    if (!user) return;
    if (!confirm('Are you sure you want to clear all active notifications?')) return;

    try {
      await clearAllMutation.mutateAsync({ userId: user.id });
      toast.success('All notifications cleared');
    } catch (error) {
      console.error('Error clearing alerts:', error);
      toast.error('Failed to clear notifications');
    }
  };

  const resetFilters = () => {
    setFilters({
      severity: 'all',
      status: 'all',
      type: 'all',
      search: ''
    });
    setCurrentPage(1);
  };

  const filteredAlerts = useMemo(() => {
    return alerts.filter(alert => {
      if (filters.severity !== 'all' && alert.severity !== filters.severity) return false;
      if (filters.status !== 'all' && alert.status !== filters.status) return false;
      if (filters.type !== 'all' && alert.type !== filters.type) return false;
      if (filters.search && !alert.patient_name?.toLowerCase().includes(filters.search.toLowerCase()) &&
        !alert.mrn?.toLowerCase().includes(filters.search.toLowerCase())) return false;
      return true;
    });
  }, [alerts, filters]);

  const paginatedAlerts = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredAlerts.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredAlerts, currentPage]);

  const totalPages = Math.ceil(filteredAlerts.length / itemsPerPage);

  const summaryCounts = useMemo(() => {
    return {
      critical: alerts.filter(a => a.severity === 'critical' && !a.acknowledged_at).length,
      high: alerts.filter(a => a.severity === 'high' && !a.acknowledged_at).length,
      medium: alerts.filter(a => a.severity === 'medium' && !a.acknowledged_at).length,
      low: alerts.filter(a => a.severity === 'low' && !a.acknowledged_at).length
    };
  }, [alerts]);

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <SkeletonCard className="h-8 w-48" />
            <SkeletonCard className="h-4 w-32" />
          </div>
          <div className="flex gap-2">
            <SkeletonCard className="h-10 w-32 ml-auto" />
            <SkeletonCard className="h-10 w-32" />
          </div>
        </div>
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <SkeletonCard key={i} className="h-24" />
          ))}
        </div>
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => (
            <SkeletonCard key={i} className="h-20" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="p-6 space-y-6"
    >
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">System Alerts</h1>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 text-xs font-bold uppercase tracking-wider border border-blue-100">
              <AnimatedNumber value={alerts.length} /> Total
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {hasRole('nurse', 'doctor', 'admin') && alerts.some(a => !a.acknowledged_at) && (
            <button
              onClick={handleClearAll}
              disabled={clearAllMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-white text-gray-700 border border-gray-200 rounded-xl hover:bg-gray-50 hover:text-red-600 hover:border-red-200 transition-all shadow-sm font-medium text-sm group"
            >
              {clearAllMutation.isPending ? (
                <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4 text-gray-400 group-hover:text-red-500" />
              )}
              Clear All Notifications
            </button>
          )}

          {hasRole('nurse', 'doctor', 'admin') && summaryCounts.critical > 0 && (
            <button
              onClick={() => {
                const criticalUnacked = alerts.filter(a => a.severity === 'critical' && !a.acknowledged_at);
                criticalUnacked.forEach(a => ackMutation.mutate({ alertId: a.id, userId: user!.id, patientId: a.patient_id }));
                toast.success(`Acknowledging ${criticalUnacked.length} critical alerts`);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-all shadow-md font-medium text-sm"
            >
              <AlertTriangle className="w-4 h-4" />
              Acknowledge All Critical
            </button>
          )}
        </div>
      </div>

      {/* Summary Pills */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid grid-cols-4 gap-4"
      >
        {Object.entries(summaryCounts).map(([severity, count]) => (
          <div
            key={severity}
            className={`p-4 rounded-2xl border border-gray-100 shadow-sm transition-all hover:shadow-md ${severityBgColors[severity as AlertSeverity]}`}
          >
            <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">{severity}</div>
            <div className="text-2xl font-bold text-gray-900">
              <AnimatedNumber value={count} />
            </div>
            <div className="mt-2 h-1 w-12 rounded-full" style={{ backgroundColor: severityColors[severity as AlertSeverity] }} />
          </div>
        ))}
      </motion.div>

      {/* Filter Bar */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 space-y-4"
      >
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-100">
            <Filter className="w-4 h-4 text-gray-500" />
            <span className="text-xs font-bold text-gray-700 uppercase tracking-tight">Filters</span>
          </div>

          <select
            value={filters.severity}
            onChange={(e) => setFilters(prev => ({ ...prev, severity: e.target.value as AlertSeverity | 'all' }))}
            className="px-3 py-1.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 transition-all outline-none"
          >
            <option value="all">All Severities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>

          <select
            value={filters.status}
            onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value as AlertStatus | 'all' }))}
            className="px-3 py-1.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 transition-all outline-none"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="acknowledged">Acknowledged</option>
            <option value="resolved">Resolved</option>
          </select>

          <select
            value={filters.type}
            onChange={(e) => setFilters(prev => ({ ...prev, type: e.target.value }))}
            className="px-3 py-1.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 transition-all outline-none"
          >
            <option value="all">All Types</option>
            {alertTypes.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>

          <div className="relative group">
            <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 group-focus-within:text-primary transition-colors" />
            <input
              type="text"
              placeholder="Search patient or MRN..."
              value={filters.search}
              onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
              className="pl-9 pr-3 py-1.5 border border-gray-200 rounded-xl text-sm w-64 focus:ring-2 focus:ring-primary/20 transition-all outline-none"
            />
          </div>

          <button
            onClick={resetFilters}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors"
          >
            <RotateCcw className="w-4 h-4 text-gray-400" />
            Reset
          </button>
        </div>
      </motion.div>

      {/* Alert Feed */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="space-y-4"
      >
        <AnimatePresence mode="popLayout">
          {paginatedAlerts.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center py-24 bg-gray-50/50 rounded-3xl border border-dashed border-gray-200"
            >
              <div className="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center mx-auto mb-4 border border-gray-100">
                <CheckCircle2 className="w-8 h-8 text-green-500" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-1 tracking-tight">No Alerts Found</h3>
              <p className="text-gray-500 max-w-xs mx-auto">Everything looks stable. All active alerts have been cleared or match no filters.</p>
            </motion.div>
          ) : (
            <motion.div
              layout
              className="grid gap-4"
            >
              {paginatedAlerts.map((alert) => (
                <motion.div
                  key={alert.id}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className={`relative overflow-hidden p-5 rounded-2xl bg-white border border-gray-100 shadow-sm transition-all hover:shadow-md cursor-pointer ${alert.severity === 'critical' && !alert.acknowledged_at ? 'ring-2 ring-red-500/20 pulse-critical' : ''
                    }`}
                  onClick={() => navigate(`/dashboard/telemetry/${alert.patient_id}`)}
                >
                  <div
                    className="absolute left-0 top-0 bottom-0 w-1.5"
                    style={{ backgroundColor: severityColors[alert.severity] }}
                  />

                  <div className="flex items-start justify-between gap-6 pl-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2 flex-wrap">
                        <RiskBadge level={alert.severity} label={alert.severity.toUpperCase()} />
                        <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">•</span>
                        <span className="text-sm font-bold text-gray-900 truncate">
                          {alert.patient_name}
                        </span>
                        <span className="text-xs text-gray-400 font-medium px-2 py-0.5 bg-gray-50 rounded-full border border-gray-100">
                          {alert.mrn}
                        </span>
                      </div>

                      <h3 className="text-base font-bold text-gray-900 mb-1 leading-tight tracking-tight">{alert.title}</h3>
                      <p className="text-sm text-gray-600 mb-4 leading-relaxed font-medium">{alert.message}</p>

                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="bg-primary/5 text-primary text-[10px] font-bold px-2 py-1 rounded-lg border border-primary/10 uppercase tracking-wider">{alert.type}</span>
                        <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider bg-gray-50 px-2 py-1 rounded-lg border border-gray-100">Escalation {alert.escalation_level}</span>
                        <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider pt-0.5">
                          {formatDistanceToNow(new Date(alert.created_at), { addSuffix: true })}
                        </span>
                        {alert.acknowledged_by_name && (
                          <div className="flex items-center gap-1.5 ml-auto">
                            <div className="w-5 h-5 rounded-full bg-blue-50 flex items-center justify-center text-[10px] font-bold text-blue-600 border border-blue-100">
                              {alert.acknowledged_by_name[0]}
                            </div>
                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Ack by {alert.acknowledged_by_name}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      {!alert.acknowledged_at && hasRole('nurse', 'doctor', 'admin') && (
                        <button
                          onClick={(e) => { e.stopPropagation(); ackMutation.mutate({ alertId: alert.id, userId: user!.id, patientId: alert.patient_id }); }}
                          disabled={ackMutation.isPending}
                          className="px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-all shadow-sm flex items-center justify-center min-w-[120px]"
                        >
                          {ackMutation.isPending ? (
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          ) : (
                            'Acknowledge'
                          )}
                        </button>
                      )}

                      {alert.status === 'acknowledged' && hasRole('doctor', 'admin') && (
                        <button
                          onClick={(e) => e.stopPropagation()}
                          className="px-4 py-2 bg-green-600 text-white text-xs font-bold rounded-xl hover:bg-green-700 transition-all shadow-sm flex items-center justify-center min-w-[120px]"
                        >
                          Mark Resolved
                        </button>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Pagination */}
      {totalPages > 1 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="flex items-center justify-between mt-8 p-4 bg-white rounded-2xl border border-gray-100 shadow-sm"
        >
          <button
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            disabled={currentPage === 1}
            className="px-4 py-2 text-xs font-bold uppercase tracking-widest text-gray-500 hover:text-gray-900 disabled:opacity-30 transition-colors"
          >
            Previous
          </button>

          <div className="flex items-center gap-2">
            {[...Array(totalPages)].map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentPage(i + 1)}
                className={`w-8 h-8 rounded-xl text-xs font-bold transition-all ${currentPage === i + 1
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-gray-400 hover:bg-gray-50 hover:text-gray-900 border border-transparent hover:border-gray-100'
                  }`}
              >
                {i + 1}
              </button>
            ))}
          </div>

          <button
            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
            disabled={currentPage === totalPages}
            className="px-4 py-2 text-xs font-bold uppercase tracking-widest text-gray-500 hover:text-gray-900 disabled:opacity-30 transition-colors"
          >
            Next
          </button>
        </motion.div>
      )}
    </motion.div>
  );
}