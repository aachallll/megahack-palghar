/**
 * usePatientData — React Query hooks for a single patient's data.
 *
 * Provides:
 *  usePatient(id)           — core patient record
 *  useVitalsHistory(id, n)  — latest n vitals, sorted asc
 *  usePatientAlerts(id)     — active alerts with Supabase realtime
 *  usePatientMeds(id)       — active medications
 *  useLabResults(id)        — latest lab results
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useICUStore } from '@/store/useICUStore';
import { useAlertStore } from '@/store/useAlertStore';
import type { Patient, Vital, Alert, Medication, LabResult } from '@/types/database';

const STALE = 30_000;

// ─── Query Keys ───────────────────────────────────────────────────────────────

export const patientKeys = {
    all: ['patients'] as const,
    detail: (id: string) => ['patients', id] as const,
    vitals: (id: string, limit = 20) => ['vitals', id, limit] as const,
    alerts: (id: string) => ['alerts', 'patient', id] as const,
    meds: (id: string) => ['meds', id] as const,
    labs: (id: string) => ['labs', id] as const,
};

// ─── Patient core ─────────────────────────────────────────────────────────────

export function usePatient(patientId: string | null) {
    return useQuery<Patient | null>({
        queryKey: patientKeys.detail(patientId ?? ''),
        enabled: !!patientId,
        staleTime: STALE,
        queryFn: async () => {
            const { data, error } = await supabase
                .from('patients')
                .select('*')
                .eq('id', patientId!)
                .single();
            if (error) throw error;
            return data as Patient;
        },
    });
}

// ─── Vitals history ───────────────────────────────────────────────────────────

export function useVitalsHistory(patientId: string | null, limit = 20) {
    const qc = useQueryClient();

    // React Query for initial load
    const query = useQuery<Vital[]>({
        queryKey: patientKeys.vitals(patientId ?? '', limit),
        enabled: !!patientId,
        staleTime: 5000,         // 5s staleness to allow manual refresh/realtime to settle
        refetchInterval: 30_000, // slower polling, rely on realtime
        queryFn: async () => {
            const { data, error } = await supabase
                .from('vitals')
                .select('*')
                .eq('patient_id', patientId!)
                .order('timestamp', { ascending: false })
                .limit(limit);
            if (error) throw error;
            return (data as Vital[]).reverse();
        },
    });

    // Realtime INSERT subscription for instant updates
    useEffect(() => {
        if (!patientId) return;
        const channel = supabase
            .channel(`vitals-rt-${patientId}`)
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'vitals', filter: `patient_id=eq.${patientId}` },
                (payload) => {
                    const newVital = payload.new as Vital;

                    // ─── Sync with global store ───
                    useICUStore.getState().updateLatestVital(patientId, newVital);

                    qc.setQueryData<Vital[]>(
                        patientKeys.vitals(patientId, limit),
                        (prev) => {
                            const updated = [...(prev ?? []), newVital];
                            return updated.slice(-limit);
                        }
                    );
                }
            )
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [patientId, limit, qc]);

    return query;
}

// ─── Patient alerts (realtime) ────────────────────────────────────────────────

export function usePatientAlerts(patientId: string | null) {
    const qc = useQueryClient();
    const setPatientAlerts = useAlertStore((s) => s.setPatientAlerts);

    const query = useQuery<Alert[]>({
        queryKey: patientKeys.alerts(patientId ?? ''),
        enabled: !!patientId,
        staleTime: STALE,
        queryFn: async () => {
            const { data, error } = await supabase
                .from('alerts')
                .select('*')
                .eq('patient_id', patientId!)
                .eq('status', 'active')
                .order('created_at', { ascending: false });
            if (error) throw error;
            const alerts = data as Alert[];
            setPatientAlerts(patientId!, alerts);
            return alerts;
        },
    });

    useEffect(() => {
        if (!patientId) return;
        const channel = supabase
            .channel(`alerts-rt-${patientId}`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'alerts', filter: `patient_id=eq.${patientId}` },
                () => { qc.invalidateQueries({ queryKey: patientKeys.alerts(patientId) }); }
            )
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [patientId, qc]);

    return query;
}

// ─── Medications ─────────────────────────────────────────────────────────────

export function usePatientMeds(patientId: string | null) {
    return useQuery<Medication[]>({
        queryKey: patientKeys.meds(patientId ?? ''),
        enabled: !!patientId,
        staleTime: STALE * 5,
        queryFn: async () => {
            const { data, error } = await supabase
                .from('medications')
                .select('*')
                .eq('patient_id', patientId!)
                .eq('status', 'active');
            if (error) throw error;
            return data as Medication[];
        },
    });
}

// ─── Lab Results ─────────────────────────────────────────────────────────────

export function useLabResults(patientId: string | null) {
    return useQuery<LabResult[]>({
        queryKey: patientKeys.labs(patientId ?? ''),
        enabled: !!patientId,
        staleTime: STALE * 2,
        queryFn: async () => {
            const { data, error } = await supabase
                .from('lab_results')
                .select('*')
                .eq('patient_id', patientId!)
                .order('resulted_at', { ascending: false })
                .limit(30);
            if (error) throw error;
            return data as LabResult[];
        },
    });
}

// ─── All patients list ────────────────────────────────────────────────────────

export function useAllPatients() {
    return useQuery<Patient[]>({
        queryKey: patientKeys.all,
        staleTime: STALE,
        queryFn: async () => {
            const { data, error } = await supabase
                .from('patients')
                .select('*')
                .eq('patient_status', 'admitted')
                .order('risk_level');
            if (error) throw error;
            return data as Patient[];
        },
    });
}
