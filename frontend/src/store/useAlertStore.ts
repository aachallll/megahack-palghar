/**
 * useAlertStore — Zustand store for alerts.
 *
 * Provides a global, realtime-updated list of active alerts across all patients.
 * TanStack Query + Supabase realtime should call setAlerts() whenever the DB changes.
 */

import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import type { Alert, ActiveAlert } from '@/types/database';

interface AlertState {
    // Active alerts for the currently viewed patient
    patientAlerts: Record<string, Alert[]>;
    setPatientAlerts: (patientId: string, alerts: Alert[]) => void;
    acknowledgeAlert: (patientId: string, alertId: string) => void;

    // Global ward-wide critical alerts (from active_alerts view)
    globalCritical: ActiveAlert[];
    setGlobalCritical: (alerts: ActiveAlert[]) => void;

    // Unread count (for nav badge)
    unreadCount: number;
    setUnreadCount: (count: number) => void;
    decrementUnread: () => void;
    acknowledgeAllAlerts: () => void;
}

export const useAlertStore = create<AlertState>()(
    devtools(
        subscribeWithSelector(
        (set) => ({
            patientAlerts: {},
            setPatientAlerts: (patientId, alerts) =>
                set((s) => ({ patientAlerts: { ...s.patientAlerts, [patientId]: alerts } })),
            acknowledgeAlert: (patientId, alertId) =>
                set((s) => ({
                    patientAlerts: {
                        ...s.patientAlerts,
                        [patientId]: (s.patientAlerts[patientId] ?? []).map((a) =>
                            a.id === alertId ? { ...a, status: 'acknowledged' as const } : a
                        ),
                    },
                    unreadCount: Math.max(0, s.unreadCount - 1),
                })),

            acknowledgeAllAlerts: () =>
                set((s) => {
                    const newPatientAlerts = { ...s.patientAlerts };
                    Object.keys(newPatientAlerts).forEach(pid => {
                        newPatientAlerts[pid] = newPatientAlerts[pid].map(a => ({
                            ...a,
                            status: 'acknowledged' as const
                        }));
                    });
                    return {
                        patientAlerts: newPatientAlerts,
                        unreadCount: 0,
                        globalCritical: []
                    };
                }),

            globalCritical: [],
            setGlobalCritical: (alerts) => set({ globalCritical: alerts }),

            unreadCount: 0,
            setUnreadCount: (count) => set({ unreadCount: count }),
            decrementUnread: () => set((s) => ({ unreadCount: Math.max(0, s.unreadCount - 1) })),
        })),
        { name: 'AlertStore' }
    )
);
