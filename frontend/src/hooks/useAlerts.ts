/**
 * useAlerts — React Query hooks for alert data, synced with Zustand alert store.
 *
 * Provides:
 *  useGlobalAlerts()         — all active alerts (for nav badge + Alerts page)
 *  useAlertCounts()          — admitted, critical, unacked counts
 *  useAcknowledgeAlert()     — mutation to ack an alert
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAlertStore } from '@/store/useAlertStore';
import type { ActiveAlert } from '@/types/database';

const STALE = 15_000;

// ─── Query Keys ───────────────────────────────────────────────────────────────

export const alertKeys = {
    global: ['alerts', 'global'] as const,
    critical: ['alerts', 'critical'] as const,
    counts: ['alerts', 'counts'] as const,
};

// ─── Global alerts ────────────────────────────────────────────────────────────

export function useGlobalAlerts() {
    const qc = useQueryClient();
    const setGlobalCritical = useAlertStore((s) => s.setGlobalCritical);
    const setUnreadCount = useAlertStore((s) => s.setUnreadCount);

    const query = useQuery<ActiveAlert[]>({
        queryKey: alertKeys.global,
        staleTime: STALE,
        queryFn: async () => {
            const { data, error } = await supabase
                .from('active_alerts')
                .select('*')
                .order('created_at', { ascending: false });
            if (error) throw error;
            const alerts = data as ActiveAlert[];
            const critical = alerts.filter((a) => a.severity === 'critical');
            setGlobalCritical(critical);
            setUnreadCount(alerts.filter((a) => !a.acknowledged_at).length);
            return alerts;
        },
    });

    // Realtime — any alert change triggers a refetch
    useEffect(() => {
        const channel = supabase
            .channel('alerts-global-rt')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'alerts' }, () => {
                qc.invalidateQueries({ queryKey: alertKeys.global });
                qc.invalidateQueries({ queryKey: alertKeys.counts });
            })
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [qc]);

    return query;
}

// ─── Alert counts ─────────────────────────────────────────────────────────────

export function useAlertCounts() {
    return useQuery({
        queryKey: alertKeys.counts,
        staleTime: STALE,
        queryFn: async () => {
            const [admitted, critical, unacked] = await Promise.all([
                supabase.from('patients').select('id', { count: 'exact', head: true }).eq('patient_status', 'admitted'),
                supabase.from('alerts').select('id', { count: 'exact', head: true }).eq('status', 'active').eq('severity', 'critical'),
                supabase.from('alerts').select('id', { count: 'exact', head: true }).eq('status', 'active').is('acknowledged_by', null),
            ]);
            return {
                admitted: admitted.count ?? 0,
                critical: critical.count ?? 0,
                unacked: unacked.count ?? 0,
            };
        },
    });
}

// ─── Acknowledge mutation ─────────────────────────────────────────────────────

export function useAcknowledgeAlert() {
    const qc = useQueryClient();
    const acknowledgeAlert = useAlertStore((s) => s.acknowledgeAlert);

    return useMutation({
        mutationFn: async ({ alertId, userId, patientId }: { alertId: string; userId: string; patientId: string }) => {
            const { error } = await supabase
                .from('alerts')
                .update({
                    acknowledged_by: userId,
                    acknowledged_at: new Date().toISOString(),
                    status: 'acknowledged',
                })
                .eq('id', alertId);
            if (error) throw error;
            acknowledgeAlert(patientId, alertId);  // optimistic store update
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: alertKeys.global });
            qc.invalidateQueries({ queryKey: alertKeys.counts });
        },
    });
}

// ─── Bulk Clear mutation ──────────────────────────────────────────────────────

export function useClearAllAlerts() {
    const qc = useQueryClient();
    const acknowledgeAll = useAlertStore((s) => s.acknowledgeAllAlerts);

    return useMutation({
        mutationFn: async ({ userId }: { userId: string }) => {
            const { error } = await supabase
                .from('alerts')
                .update({
                    acknowledged_by: userId,
                    acknowledged_at: new Date().toISOString(),
                    status: 'acknowledged',
                })
                .eq('status', 'active');
            if (error) throw error;
            acknowledgeAll(); // optimistic store update
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: alertKeys.global });
            qc.invalidateQueries({ queryKey: alertKeys.counts });
        },
    });
}
