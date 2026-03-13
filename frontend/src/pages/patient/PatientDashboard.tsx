import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { motion } from 'framer-motion';
import { CalendarDays, Pill, TestTube, Watch } from 'lucide-react';

export default function PatientDashboard() {
  const { session } = useAuth();
  const uid = session?.user?.id ?? null;
  const [loading, setLoading] = useState(true);
  const [nextAppt, setNextAppt] = useState<any | null>(null);
  const [activeMeds, setActiveMeds] = useState<number>(0);
  const [recentLabs, setRecentLabs] = useState<number>(0);
  const [wearableToday, setWearableToday] = useState<number>(0);

  useEffect(() => {
    if (!uid) return;
    (async () => {
      setLoading(true);
      try {
        const { data: appt } = await supabase
          .from('appointments')
          .select('*')
          .eq('patient_user_id', uid)
          .in('status', ['requested', 'confirmed'])
          .order('scheduled_at', { ascending: true })
          .limit(1)
          .maybeSingle();
        setNextAppt(appt ?? null);

        const { count: medsCount } = await supabase
          .from('patient_medications')
          .select('*', { count: 'exact', head: true })
          .eq('patient_user_id', uid)
          .eq('status', 'active');
        setActiveMeds(medsCount ?? 0);

        const { count: labsCount } = await supabase
          .from('patient_lab_results')
          .select('*', { count: 'exact', head: true })
          .eq('patient_user_id', uid);
        setRecentLabs(labsCount ?? 0);

        const start = new Date();
        start.setHours(0, 0, 0, 0);
        const { count: wearableCount } = await supabase
          .from('wearable_readings')
          .select('*', { count: 'exact', head: true })
          .eq('patient_user_id', uid)
          .gte('recorded_at', start.toISOString());
        setWearableToday(wearableCount ?? 0);
      } finally {
        setLoading(false);
      }
    })();
  }, [uid]);

  const nextApptText = useMemo(() => {
    if (!nextAppt) return 'No upcoming appointment';
    const dt = new Date(nextAppt.scheduled_at);
    return `${dt.toLocaleString()} • ${nextAppt.status}`;
  }, [nextAppt]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">My Health Dashboard</h1>
        <p className="text-sm text-muted-foreground">Your medications, lab reports, appointments, and wearable insights.</p>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="card-clinical">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <CalendarDays className="h-4 w-4 text-primary" /> Next appointment
            </div>
            <div className="text-xs text-muted-foreground mt-2">{nextApptText}</div>
          </div>
          <div className="card-clinical">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Pill className="h-4 w-4 text-vital-hr" /> Active medications
            </div>
            <div className="text-2xl font-bold mt-2">{activeMeds}</div>
          </div>
          <div className="card-clinical">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <TestTube className="h-4 w-4 text-vital-spo2" /> Lab reports
            </div>
            <div className="text-2xl font-bold mt-2">{recentLabs}</div>
          </div>
          <div className="card-clinical">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Watch className="h-4 w-4 text-vital-rr" /> Wearable readings today
            </div>
            <div className="text-2xl font-bold mt-2">{wearableToday}</div>
          </div>
        </div>
      )}
    </motion.div>
  );
}

