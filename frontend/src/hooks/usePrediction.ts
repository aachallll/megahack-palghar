/**
 * usePrediction — Singleton WebSocket manager for AI prediction streaming.
 *
 * Connects to /ws/predict/{patientId} and writes every received payload
 * into the Zustand ICU store. Each patient gets its own WS connection that
 * is created/destroyed based on whether any component is subscribed.
 *
 * Usage:
 *   const { prediction, wsStatus } = usePrediction(patientId);
 *
 * The hook is safe to call from multiple components — the connection is
 * deduplicated via a module-level registry.
 */

import { useEffect, useRef, useCallback } from 'react';
import { useICUStore, selectPrediction, selectWSStatus, type AIPrediction } from '@/store/useICUStore';

const API_WS_BASE = 'ws://localhost:8000';

// Module-level WS registry — persists across React renders and route changes
const wsRegistry: Map<string, WebSocket> = new Map();
const wsRefCounts: Map<string, number> = new Map();

function getOrCreateWS(
    patientId: string,
    onMessage: (data: AIPrediction) => void,
    onStatus: (status: 'connecting' | 'connected' | 'disconnected') => void
): () => void {
    // Increment ref count
    wsRefCounts.set(patientId, (wsRefCounts.get(patientId) ?? 0) + 1);

    if (!wsRegistry.has(patientId)) {
        onStatus('connecting');
        const ws = new WebSocket(`${API_WS_BASE}/ws/predict/${patientId}`);

        ws.onopen = () => onStatus('connected');
        ws.onclose = () => {
            onStatus('disconnected');
            wsRegistry.delete(patientId);
        };
        ws.onerror = () => {
            onStatus('disconnected');
        };
        ws.onmessage = (evt) => {
            try {
                const data: AIPrediction = JSON.parse(evt.data);
                onMessage(data);
            } catch { /* noop */ }
        };

        wsRegistry.set(patientId, ws);
    } else {
        // WS already open — just register status
        const ws = wsRegistry.get(patientId)!;
        if (ws.readyState === WebSocket.OPEN) onStatus('connected');
        else onStatus('connecting');
    }

    // Return cleanup function
    return () => {
        const count = (wsRefCounts.get(patientId) ?? 1) - 1;
        wsRefCounts.set(patientId, count);
        if (count <= 0) {
            // Last subscriber gone — close the socket
            const ws = wsRegistry.get(patientId);
            if (ws) {
                ws.close();
                wsRegistry.delete(patientId);
            }
            wsRefCounts.delete(patientId);
        }
    };
}

// ─── Reconnect wrapper (retries after 3 s on disconnect) ──────────────────────

function useReconnectingWS(
    patientId: string | null,
    onMessage: (data: AIPrediction) => void,
    onStatus: (status: 'connecting' | 'connected' | 'disconnected') => void
) {
    const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const cleanupRef = useRef<() => void>(() => { });

    useEffect(() => {
        if (!patientId) return;

        const connect = () => {
            const cleanup = getOrCreateWS(
                patientId,
                onMessage,
                (status) => {
                    onStatus(status);
                    if (status === 'disconnected') {
                        // schedule reconnect in 3 s
                        retryTimer.current = setTimeout(connect, 3000);
                    }
                }
            );
            cleanupRef.current = cleanup;
        };

        connect();

        return () => {
            if (retryTimer.current) clearTimeout(retryTimer.current);
            cleanupRef.current();
        };
    }, [patientId, onMessage, onStatus]); // eslint-disable-line react-hooks/exhaustive-deps
}

// ─── Public hook ─────────────────────────────────────────────────────────────

export function usePrediction(patientId: string | null) {
    const setAIPrediction = useICUStore((s) => s.setAIPrediction);
    const setWSStatus = useICUStore((s) => s.setWSStatus);
    const updateLatestVital = useICUStore((s) => s.updateLatestVital);

    const onMessage = useCallback((data: AIPrediction) => {
        if (patientId) {
            setAIPrediction(patientId, data);

            // Also update the global vitals if the prediction contains latest data
            if (data.latest_vital) {
                updateLatestVital(patientId, {
                    heart_rate: data.latest_vital.heart_rate,
                    oxygen_saturation: data.latest_vital.oxygen_saturation,
                    blood_pressure_systolic: data.latest_vital.blood_pressure_systolic,
                    blood_pressure_diastolic: data.latest_vital.blood_pressure_diastolic,
                    respiratory_rate: data.latest_vital.respiratory_rate,
                    temperature: data.latest_vital.temperature,
                });
            }
        }
    }, [patientId, setAIPrediction, updateLatestVital]);

    const onStatus = useCallback((status: 'connecting' | 'connected' | 'disconnected') => {
        if (patientId) setWSStatus(patientId, status);
    }, [patientId, setWSStatus]);

    useReconnectingWS(patientId, onMessage, onStatus);

    // Return store slices
    const prediction = useICUStore(selectPrediction(patientId ?? ''));
    const wsStatus = useICUStore(selectWSStatus(patientId ?? ''));

    return { prediction, wsStatus };
}
