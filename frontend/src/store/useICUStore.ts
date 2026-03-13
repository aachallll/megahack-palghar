/**
 * useICUStore — Global Zustand store for the ICU dashboard.
 *
 *  Holds:
 *   • currentPatientId / currentWardId  — globally selected entities (persisted to sessionStorage)
 *   • aiPredictions  — latest backend AI analysis keyed by patientId, written by usePrediction hook
 *   • wsStatus       — WebSocket connectivity per patient
 */

import { create } from 'zustand';
import { devtools, persist, subscribeWithSelector } from 'zustand/middleware';

import { Vital } from '@/types/database';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VitalTrend {
    vital: string;
    label: string;
    slope: number;
    direction: 'rising' | 'falling' | 'stable';
    change_percent: number;
    alarming: boolean;
    current_value?: number;
}

export interface CorrelationAlert {
    pattern: string;
    severity: 'warning' | 'urgent' | 'critical';
    explanation: string;
    vitals_involved: string[];
    confidence: number;
}

export interface AIPrediction {
    type: 'prediction' | 'waiting';
    patient_id: string;
    mode?: string;
    timestamp?: string;
    latest_vital?: Record<string, number | null>;
    trends: VitalTrend[];
    correlations: CorrelationAlert[];
    predictive_score: number;
    time_to_alert: number | null;
    news2: number | null;
    confidence?: number; // Added for WS feedback
}

export type WSStatus = 'disconnected' | 'connecting' | 'connected';

// ─── Store ────────────────────────────────────────────────────────────────────

interface ICUState {
    // Navigation / selection
    currentPatientId: string | null;
    currentWardId: string | null;
    setCurrentPatient: (id: string | null) => void;
    setCurrentWard: (id: string | null) => void;

    // AI predictions cache (patientId → latest payload from /ws/predict)
    aiPredictions: Record<string, AIPrediction>;
    setAIPrediction: (patientId: string, prediction: AIPrediction) => void;
    clearAIPredictions: () => void;

    // Real-time Vitals (Global source of truth for 1s updates)
    latestVitals: Record<string, Partial<Vital>>;
    updateLatestVital: (patientId: string, vital: Partial<Vital>) => void;

    // WebSocket status per patient
    wsStatus: Record<string, WSStatus>;
    setWSStatus: (patientId: string, status: WSStatus) => void;

    // Global loading
    backendOnline: boolean;
    setBackendOnline: (online: boolean) => void;
}

export const useICUStore = create<ICUState>()(
    devtools(
        subscribeWithSelector(
            persist(
                (set) => ({
                    // ─── Selection ────────────────────────────────────────────────────
                    currentPatientId: null,
                    currentWardId: null,
                    setCurrentPatient: (id) => set({ currentPatientId: id }),
                    setCurrentWard: (id) => set({ currentWardId: id }),

                    // ─── AI Predictions ───────────────────────────────────────────────
                    aiPredictions: {},
                    setAIPrediction: (patientId, prediction) =>
                        set((s) => ({
                            aiPredictions: { ...s.aiPredictions, [patientId]: prediction },
                        })),
                    clearAIPredictions: () => set({ aiPredictions: {} }),

                    // ─── Real-time Vitals ──────────────────────────────────────────────
                    latestVitals: {},
                    updateLatestVital: (patientId, vital) =>
                        set((s) => ({
                            latestVitals: {
                                ...s.latestVitals,
                                [patientId]: { ...(s.latestVitals[patientId] || {}), ...vital }
                            }
                        })),

                    // ─── WS Status ────────────────────────────────────────────────────
                    wsStatus: {},
                    setWSStatus: (patientId, status) =>
                        set((s) => ({
                            wsStatus: { ...s.wsStatus, [patientId]: status },
                        })),

                    // ─── Backend health ───────────────────────────────────────────────
                    backendOnline: false,
                    setBackendOnline: (online) => set({ backendOnline: online }),
                }),
                {
                    name: 'icu-store',
                    // Only persist selection — predictions are live data
                    partialize: (s) => ({
                        currentWardId: s.currentWardId,
                    }),
                }
            )
        ),
        { name: 'ICUStore' }
    )
);

// ─── Selectors (avoid re-renders with fine-grained subscriptions) ─────────────

export const selectPrediction = (patientId: string) =>
    (s: ICUState) => s.aiPredictions[patientId] ?? null;

export const selectWSStatus = (patientId: string) =>
    (s: ICUState) => s.wsStatus[patientId] ?? 'disconnected';
