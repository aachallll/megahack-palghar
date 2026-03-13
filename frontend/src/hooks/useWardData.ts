/**
 * useWardData — React Query hooks for ward-level data.
 *
 * Provides:
 *  useWards()               — all ICU wards
 *  useWardBeds(wardId)      — beds + occupying patients + latest vitals
 *  useWardOccupancy(wardId) — occupancy stats
 *  useHospital()            — active hospital record
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useICUStore } from '@/store/useICUStore';
import type { Ward, Bed, Patient, Vital, Hospital, WardOccupancy } from '@/types/database';

const STALE = 30_000;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BedRow extends Bed {
    patient?: Patient;
    latestVitals?: Vital;
    sparklineHR?: number[];
}

// ─── Query Keys ───────────────────────────────────────────────────────────────

export const wardKeys = {
    hospital: ['hospital'] as const,
    wards: ['wards'] as const,
    beds: (wardId: string) => ['wards', wardId, 'beds'] as const,
    occupancy: (wardId: string) => ['wards', wardId, 'occupancy'] as const,
};

// ─── Hospital ─────────────────────────────────────────────────────────────────

export function useHospital() {
    return useQuery<Hospital | null>({
        queryKey: wardKeys.hospital,
        staleTime: STALE * 10,
        queryFn: async () => {
            const { data } = await supabase
                .from('hospitals')
                .select('*')
                .eq('operational_status', 'active')
                .limit(1)
                .single();
            return (data as Hospital) ?? null;
        },
    });
}

// ─── Wards list ───────────────────────────────────────────────────────────────

export function useWards() {
    return useQuery<Ward[]>({
        queryKey: wardKeys.wards,
        staleTime: STALE * 10,
        queryFn: async () => {
            const { data, error } = await supabase.from('wards').select('*').eq('type', 'icu');
            if (error) throw error;
            return data as Ward[];
        },
    });
}

// ─── Beds + patients + vitals for a ward ─────────────────────────────────────

export function useWardBeds(wardId: string | null) {
    const qc = useQueryClient();

    const query = useQuery<BedRow[]>({
        queryKey: wardKeys.beds(wardId ?? ''),
        enabled: !!wardId,
        staleTime: STALE,
        queryFn: async () => {
            const [{ data: bedsData }, { data: patientsData }] = await Promise.all([
                supabase.from('beds').select('*').eq('ward_id', wardId!),
                supabase.from('patients').select('*').eq('patient_status', 'admitted'),
            ]);
            if (!bedsData) return [];

            const patientsByBed = new Map<string, Patient>(
                (patientsData ?? []).map((p: Patient) => [p.bed_id, p])
            );

            // ─── Batch fetch vitals for all patients in this ward ───
            const patientIds = (patientsData ?? []).map(p => p.id);
            let vitalsMap = new Map<string, Vital[]>();

            if (patientIds.length > 0) {
                // Fetch the latest 20 vitals for each patient in the list to ensure enough sparkline data
                // PostgREST doesn't support limit-per-group well, so we fetch their recent history in bulk
                const { data: allVitals } = await supabase
                    .from('vitals')
                    .select('*')
                    .in('patient_id', patientIds)
                    .order('timestamp', { ascending: false })
                    .limit(patientIds.length * 15);

                if (allVitals) {
                    allVitals.forEach((v: Vital) => {
                        const existing = vitalsMap.get(v.patient_id) || [];
                        if (existing.length < 8) {
                            existing.push(v);
                            vitalsMap.set(v.patient_id, existing);
                        }
                    });
                }
            }

            const rows: BedRow[] = bedsData.map((bed) => {
                const patient = patientsByBed.get(bed.id);
                if (!patient) return bed as BedRow;

                // Use the batched vitals
                const patientVitals = vitalsMap.get(patient.id) || [];
                const sorted = [...patientVitals].reverse();

                return {
                    ...bed,
                    patient,
                    latestVitals: sorted[sorted.length - 1],
                    sparklineHR: sorted.map((v) => v.heart_rate ?? 0),
                } as BedRow;
            });

            return rows;
        },
    });

    // Realtime vitals INSERT → update affected bed's latestVitals + sparkline
    useEffect(() => {
        if (!wardId) return;
        const channel = supabase
            .channel(`ward-vitals-rt-${wardId}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'vitals' }, (payload) => {
                const newVital = payload.new as Vital;
                qc.setQueryData<BedRow[]>(wardKeys.beds(wardId), (prev) => {
                    if (!prev) return prev;
                    return prev.map((bed) => {
                        if (bed.patient?.id !== newVital.patient_id) return bed;
                        const newSparkline = [...(bed.sparklineHR ?? []), newVital.heart_rate ?? 0].slice(-8);
                        return { ...bed, latestVitals: newVital, sparklineHR: newSparkline };
                    });
                });
            })
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [wardId, qc]);

    return query;
}

// ─── Ward occupancy ───────────────────────────────────────────────────────────

export function useWardOccupancy(wardId: string | null) {
    return useQuery<WardOccupancy | null>({
        queryKey: wardKeys.occupancy(wardId ?? ''),
        enabled: !!wardId,
        staleTime: STALE,
        queryFn: async () => {
            const { data } = await supabase
                .from('ward_occupancy')
                .select('*')
                .eq('id', wardId!)
                .single();
            return (data as WardOccupancy) ?? null;
        },
    });
}
