import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Watch, Play, Square, Activity, Heart, Footprints,
  Brain, ShieldCheck, ChevronDown, AlertTriangle, Info,
  Flame, Moon, TrendingUp, TrendingDown, Zap,
  BarChart3, Clock, Waves, X, RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';

/* ─── Types ─────────────────────────────────────────────────────────── */
interface WearableReading {
  id: string;
  patient_user_id: string;
  device_name: string | null;
  reading_type: string;
  reading_value: number;
  units: string | null;
  recorded_at: string;
}

interface SimConfig {
  heartRate: { base: number; noise: number; trend: number };
  steps: { base: number; noise: number };
  spo2: { base: number; noise: number };
  calories: { base: number; noise: number };
  sleep: { base: number; noise: number };
  stress: { base: number; noise: number };
}

interface AIWearableInsight {
  type: 'health' | 'activity' | 'warning' | 'tip';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
}

/* ─── Simulation Profiles ───────────────────────────────────────────── */
const SIM_PROFILES: Record<string, { label: string; icon: typeof Heart; config: SimConfig }> = {
  relaxed: {
    label: 'Relaxing',
    icon: Moon,
    config: {
      heartRate: { base: 68, noise: 4, trend: 0 },
      steps: { base: 0, noise: 2 },
      spo2: { base: 98, noise: 0.5 },
      calories: { base: 1.2, noise: 0.3 },
      sleep: { base: 85, noise: 5 },
      stress: { base: 20, noise: 8 },
    },
  },
  walking: {
    label: 'Walking',
    icon: Footprints,
    config: {
      heartRate: { base: 95, noise: 8, trend: 0.3 },
      steps: { base: 80, noise: 20 },
      spo2: { base: 97, noise: 1 },
      calories: { base: 4.5, noise: 1.2 },
      sleep: { base: 0, noise: 0 },
      stress: { base: 35, noise: 10 },
    },
  },
  exercise: {
    label: 'Exercising',
    icon: Flame,
    config: {
      heartRate: { base: 145, noise: 15, trend: 1.2 },
      steps: { base: 150, noise: 30 },
      spo2: { base: 95, noise: 2 },
      calories: { base: 10, noise: 3 },
      sleep: { base: 0, noise: 0 },
      stress: { base: 55, noise: 12 },
    },
  },
  sleeping: {
    label: 'Sleeping',
    icon: Moon,
    config: {
      heartRate: { base: 58, noise: 3, trend: -0.1 },
      steps: { base: 0, noise: 0 },
      spo2: { base: 97, noise: 0.8 },
      calories: { base: 0.8, noise: 0.2 },
      sleep: { base: 92, noise: 3 },
      stress: { base: 10, noise: 5 },
    },
  },
  stressed: {
    label: 'High Stress',
    icon: Zap,
    config: {
      heartRate: { base: 105, noise: 12, trend: 0.5 },
      steps: { base: 20, noise: 15 },
      spo2: { base: 96, noise: 1.5 },
      calories: { base: 2, noise: 0.5 },
      sleep: { base: 0, noise: 0 },
      stress: { base: 75, noise: 15 },
    },
  },
};

/* ─── AI Health Insights ─────────────────────────────────────────────── */
function generateWearableInsights(readings: WearableReading[]): AIWearableInsight[] {
  const insights: AIWearableInsight[] = [];
  if (readings.length === 0) return insights;

  // Group by type
  const byType = readings.reduce<Record<string, number[]>>((acc, r) => {
    (acc[r.reading_type] = acc[r.reading_type] || []).push(r.reading_value);
    return acc;
  }, {});

  // Heart rate analysis
  const hrs = byType['heart_rate'] || [];
  if (hrs.length > 0) {
    const avg = hrs.reduce((a, b) => a + b, 0) / hrs.length;
    const max = Math.max(...hrs);
    const min = Math.min(...hrs);

    if (avg > 100) {
      insights.push({ type: 'warning', severity: 'warning', title: '💓 Elevated Heart Rate', message: `Average HR today: ${avg.toFixed(0)} bpm. Resting HR above 100 bpm may indicate stress or dehydration.` });
    }
    if (max > 160) {
      insights.push({ type: 'warning', severity: 'warning', title: '🏃 Peak Heart Rate Alert', message: `Peak HR reached ${max} bpm. Ensure you stay within your target zone (${Math.round(220 - 35 * 0.85)} bpm max recommended).` });
    }
    if (min < 50 && hrs.length > 5) {
      insights.push({ type: 'health', severity: 'info', title: '🫀 Low Resting HR', message: `Resting HR as low as ${min} bpm — this is normal for athletes, but consult your doctor if you feel dizzy.` });
    }
  }

  // SpO2 analysis
  const spo2 = byType['spo2'] || [];
  if (spo2.length > 0) {
    const avg = spo2.reduce((a, b) => a + b, 0) / spo2.length;
    if (avg < 95) {
      insights.push({ type: 'warning', severity: 'critical', title: '🫁 Low Oxygen Saturation', message: `Average SpO2: ${avg.toFixed(1)}%. If consistently below 95%, contact your doctor immediately.` });
    }
  }

  // Steps analysis
  const steps = byType['steps'] || [];
  if (steps.length > 0) {
    const total = steps.reduce((a, b) => a + b, 0);
    if (total > 8000) {
      insights.push({ type: 'activity', severity: 'info', title: '🎉 Great Activity!', message: `You've taken ${total.toLocaleString()} steps today. You're on track for your daily goal!` });
    } else if (total < 2000 && steps.length > 10) {
      insights.push({ type: 'tip', severity: 'info', title: '🚶 Move More', message: `Only ${total.toLocaleString()} steps so far. Try a 15-minute walk to boost your activity level.` });
    }
  }

  // Stress analysis
  const stress = byType['stress'] || [];
  if (stress.length > 0) {
    const avg = stress.reduce((a, b) => a + b, 0) / stress.length;
    if (avg > 60) {
      insights.push({ type: 'tip', severity: 'warning', title: '🧘 High Stress Detected', message: `Average stress level: ${avg.toFixed(0)}/100. Try deep breathing exercises or a short meditation break.` });
    }
  }

  // Calories
  const cals = byType['calories'] || [];
  if (cals.length > 0) {
    const total = cals.reduce((a, b) => a + b, 0);
    insights.push({ type: 'activity', severity: 'info', title: '🔥 Calorie Burn', message: `${total.toFixed(0)} kcal burned from tracked activity. Keep it up!` });
  }

  return insights;
}

/* ─── Sparkline Component ────────────────────────────────────────────── */
function MiniSparkline({ data, color, height = 40 }: { data: number[]; color: string; height?: number }) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const w = 120;
  const points = data.slice(-30).map((v, i, arr) =>
    `${(i / (arr.length - 1)) * w},${height - ((v - min) / range) * (height - 4)}`
  ).join(' ');

  return (
    <svg width={w} height={height} className="shrink-0">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ─── Helpers ────────────────────────────────────────────────────────── */
function fmtTime(d: string) {
  return new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/* ─── Component ──────────────────────────────────────────────────────── */
export default function PatientWearables() {
  const { session } = useAuth();
  const uid = session?.user?.id ?? null;

  const [readings, setReadings] = useState<WearableReading[]>([]);
  const [loading, setLoading] = useState(true);
  const [simRunning, setSimRunning] = useState(false);
  const [simProfile, setSimProfile] = useState('relaxed');
  const [showAI, setShowAI] = useState(true);
  const [liveData, setLiveData] = useState<Record<string, number[]>>({});
  const simRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stepRef = useRef(0);

  /* ─── Fetch ─────────────────────────────────────────────────────── */
  const fetchReadings = useCallback(async () => {
    if (!uid) return;
    setLoading(true);
    try {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const { data, error } = await supabase
        .from('wearable_readings')
        .select('*')
        .eq('patient_user_id', uid)
        .gte('recorded_at', start.toISOString())
        .order('recorded_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      setReadings(data ?? []);

      // Populate sparkline data from existing readings
      const grouped: Record<string, number[]> = {};
      (data ?? []).reverse().forEach(r => {
        (grouped[r.reading_type] = grouped[r.reading_type] || []).push(r.reading_value);
      });
      setLiveData(grouped);
    } catch (e: any) {
      toast.error('Failed to load wearable data');
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useEffect(() => { fetchReadings(); }, [fetchReadings]);

  /* ─── Simulation ────────────────────────────────────────────────── */
  const startSimulation = () => {
    if (!uid || simRunning) return;
    setSimRunning(true);
    stepRef.current = 0;
    toast.success(`Simulation started: ${SIM_PROFILES[simProfile].label}`);

    simRef.current = setInterval(async () => {
      const profile = SIM_PROFILES[simProfile];
      const config = profile.config;
      stepRef.current += 1;
      const step = stepRef.current;

      const noise = () => (Math.random() - 0.5) * 2;
      const wave = (amp: number, period: number) => amp * Math.sin((2 * Math.PI * step) / period);

      const newReadings: { reading_type: string; reading_value: number; units: string }[] = [
        { reading_type: 'heart_rate', reading_value: Math.round(Math.max(40, Math.min(200, config.heartRate.base + config.heartRate.trend * step + noise() * config.heartRate.noise + wave(5, 8)))), units: 'bpm' },
        { reading_type: 'spo2', reading_value: Math.round(Math.max(88, Math.min(100, config.spo2.base + noise() * config.spo2.noise)) * 10) / 10, units: '%' },
        { reading_type: 'steps', reading_value: Math.round(Math.max(0, config.steps.base + noise() * config.steps.noise)), units: 'steps' },
        { reading_type: 'calories', reading_value: Math.round(Math.max(0, config.calories.base + noise() * config.calories.noise) * 10) / 10, units: 'kcal' },
        { reading_type: 'stress', reading_value: Math.round(Math.max(0, Math.min(100, config.stress.base + noise() * config.stress.noise + wave(8, 12)))), units: 'score' },
      ];

      // Update live sparkline data
      setLiveData(prev => {
        const next = { ...prev };
        newReadings.forEach(r => {
          const arr = [...(next[r.reading_type] || []), r.reading_value];
          next[r.reading_type] = arr.slice(-60); // Keep last 60
        });
        return next;
      });

      // Save to DB (batch)
      try {
        const rows = newReadings.map(r => ({
          patient_user_id: uid,
          device_name: 'Prahari Smartwatch (Sim)',
          reading_type: r.reading_type,
          reading_value: r.reading_value,
          units: r.units,
        }));
        const { data, error } = await supabase.from('wearable_readings').insert(rows).select();
        if (!error && data) {
          setReadings(prev => [...data.reverse(), ...prev].slice(0, 500));
        }
      } catch (e) {
        console.error('Sim save error:', e);
      }
    }, 3000); // Every 3 seconds
  };

  const stopSimulation = () => {
    if (simRef.current) clearInterval(simRef.current);
    simRef.current = null;
    setSimRunning(false);
    stepRef.current = 0;
    toast.info('Simulation stopped');
  };

  useEffect(() => {
    return () => {
      if (simRef.current) clearInterval(simRef.current);
    };
  }, []);

  /* ─── Derived ───────────────────────────────────────────────────── */
  const currentValues = useMemo(() => {
    const result: Record<string, number> = {};
    ['heart_rate', 'spo2', 'steps', 'calories', 'stress'].forEach(type => {
      const arr = liveData[type];
      if (arr && arr.length > 0) result[type] = arr[arr.length - 1];
    });
    return result;
  }, [liveData]);

  const todayTotals = useMemo(() => {
    const steps = (liveData['steps'] || []).reduce((a, b) => a + b, 0);
    const cals = (liveData['calories'] || []).reduce((a, b) => a + b, 0);
    const hrs = liveData['heart_rate'] || [];
    const avgHR = hrs.length > 0 ? hrs.reduce((a, b) => a + b, 0) / hrs.length : 0;
    return { steps, cals: cals.toFixed(0), avgHR: avgHR.toFixed(0), readings: readings.length };
  }, [liveData, readings]);

  const insights = useMemo(() => generateWearableInsights(readings), [readings]);

  /* ─── Vital Card Config ────────────────────────────────────────── */
  const vitalCards: { key: string; label: string; unit: string; icon: typeof Heart; color: string; bg: string }[] = [
    { key: 'heart_rate', label: 'Heart Rate', unit: 'bpm', icon: Heart, color: '#ef4444', bg: 'bg-red-50' },
    { key: 'spo2', label: 'SpO₂', unit: '%', icon: Waves, color: '#3b82f6', bg: 'bg-blue-50' },
    { key: 'steps', label: 'Steps', unit: 'steps', icon: Footprints, color: '#10b981', bg: 'bg-emerald-50' },
    { key: 'calories', label: 'Calories', unit: 'kcal', icon: Flame, color: '#f97316', bg: 'bg-orange-50' },
    { key: 'stress', label: 'Stress', unit: '/100', icon: Zap, color: '#8b5cf6', bg: 'bg-violet-50' },
  ];

  /* ─── Render ────────────────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(4)].map((_, i) => <div key={i} className="h-24 rounded-2xl skeleton-shimmer" />)}
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">My Wearables</h1>
          <p className="text-sm text-muted-foreground">
            {todayTotals.readings} readings today • {todayTotals.steps.toLocaleString()} steps • {todayTotals.cals} kcal burned
          </p>
        </div>
        <button onClick={() => fetchReadings()}
          className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition">
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      {/* Simulation Control Panel */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card-clinical">
        <div className="flex items-center gap-2 mb-4">
          <Watch className="h-5 w-5 text-primary" />
          <span className="font-semibold text-sm text-foreground">Wearable Simulator</span>
          {simRunning && (
            <span className="flex items-center gap-1 ml-2">
              <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-xs text-green-600 font-medium">LIVE</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {Object.entries(SIM_PROFILES).map(([key, profile]) => {
            const Icon = profile.icon;
            const isActive = simProfile === key;
            return (
              <button
                key={key}
                disabled={simRunning}
                onClick={() => setSimProfile(key)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition border ${
                  isActive
                    ? 'bg-primary/10 border-primary text-primary'
                    : 'border-border text-muted-foreground hover:bg-muted disabled:opacity-50'
                }`}
              >
                <Icon className="h-4 w-4" />
                {profile.label}
              </button>
            );
          })}
        </div>

        <div className="flex gap-3 mt-4">
          {!simRunning ? (
            <button onClick={startSimulation}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition">
              <Play className="h-4 w-4" /> Start Simulation
            </button>
          ) : (
            <button onClick={stopSimulation}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 transition">
              <Square className="h-4 w-4" /> Stop Simulation
            </button>
          )}
        </div>

        <p className="text-[11px] text-muted-foreground mt-3 italic">
          Simulates real-time smartwatch data every 3 seconds. Data is saved to your account.
        </p>
      </motion.div>

      {/* Live Vital Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {vitalCards.map(vc => {
          const Icon = vc.icon;
          const val = currentValues[vc.key];
          const sparkData = liveData[vc.key] || [];
          return (
            <motion.div
              key={vc.key}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="card-clinical relative overflow-hidden"
            >
              <div className="flex items-center gap-2 mb-2">
                <div className={`h-8 w-8 rounded-lg ${vc.bg} flex items-center justify-center`}>
                  <Icon className="h-4 w-4" style={{ color: vc.color }} />
                </div>
                <span className="text-xs font-semibold text-muted-foreground uppercase">{vc.label}</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold text-foreground">
                  {val !== undefined ? (vc.key === 'calories' ? val.toFixed(1) : Math.round(val)) : '—'}
                </span>
                <span className="text-xs text-muted-foreground">{vc.unit}</span>
              </div>
              {sparkData.length >= 2 && (
                <div className="mt-2 -mx-2">
                  <MiniSparkline data={sparkData} color={vc.color} height={30} />
                </div>
              )}
              {simRunning && val !== undefined && (
                <div className="absolute top-2 right-2">
                  <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse inline-block" />
                </div>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card-clinical">
          <div className="text-xs font-semibold text-muted-foreground uppercase mb-1">Total Steps</div>
          <div className="text-xl font-bold text-foreground">{todayTotals.steps.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground">/ 10,000 goal</div>
          <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${Math.min(100, (todayTotals.steps / 10000) * 100)}%` }} />
          </div>
        </div>
        <div className="card-clinical">
          <div className="text-xs font-semibold text-muted-foreground uppercase mb-1">Calories Burned</div>
          <div className="text-xl font-bold text-foreground">{todayTotals.cals}</div>
          <div className="text-xs text-muted-foreground">kcal today</div>
        </div>
        <div className="card-clinical">
          <div className="text-xs font-semibold text-muted-foreground uppercase mb-1">Avg Heart Rate</div>
          <div className="text-xl font-bold text-foreground">{todayTotals.avgHR}<span className="text-xs font-normal text-muted-foreground ml-1">bpm</span></div>
        </div>
        <div className="card-clinical">
          <div className="text-xs font-semibold text-muted-foreground uppercase mb-1">Readings Today</div>
          <div className="text-xl font-bold text-foreground">{todayTotals.readings}</div>
          <div className="text-xs text-muted-foreground">data points</div>
        </div>
      </div>

      {/* AI Insights */}
      {insights.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card-clinical">
          <button onClick={() => setShowAI(!showAI)} className="flex items-center gap-2 w-full text-left">
            <Brain className="h-5 w-5 text-violet-500" />
            <span className="font-semibold text-sm text-foreground flex-1">AI Wearable Insights</span>
            <span className="text-xs text-muted-foreground">{insights.length} insight{insights.length > 1 ? 's' : ''}</span>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${showAI ? 'rotate-180' : ''}`} />
          </button>
          <AnimatePresence>
            {showAI && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <div className="mt-4 space-y-3">
                  {insights.map((ins, i) => (
                    <div key={i} className={`flex items-start gap-3 p-3 rounded-xl text-sm ${
                      ins.severity === 'critical' ? 'bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800' :
                      ins.severity === 'warning' ? 'bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800' :
                      'bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800'
                    }`}>
                      {ins.severity === 'critical' ? <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" /> :
                       ins.severity === 'warning' ? <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" /> :
                       <Info className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />}
                      <div>
                        <div className="font-semibold text-foreground">{ins.title}</div>
                        <div className="text-muted-foreground mt-0.5">{ins.message}</div>
                      </div>
                    </div>
                  ))}
                  <p className="text-[11px] text-muted-foreground italic flex items-center gap-1">
                    <ShieldCheck className="h-3 w-3" /> AI decision support only — always consult your doctor
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}

      {/* Recent Readings Table */}
      <div className="card-clinical">
        <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" /> Recent Readings
        </h3>
        {readings.length === 0 ? (
          <div className="text-center py-8">
            <Watch className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No readings yet. Start the simulator to generate data.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3 font-semibold text-muted-foreground text-xs uppercase">Time</th>
                  <th className="text-left py-2 px-3 font-semibold text-muted-foreground text-xs uppercase">Type</th>
                  <th className="text-right py-2 px-3 font-semibold text-muted-foreground text-xs uppercase">Value</th>
                  <th className="text-left py-2 px-3 font-semibold text-muted-foreground text-xs uppercase">Device</th>
                </tr>
              </thead>
              <tbody>
                {readings.slice(0, 50).map(r => (
                  <tr key={r.id} className="border-b border-border/50 hover:bg-muted/50 transition">
                    <td className="py-2 px-3 text-muted-foreground"><Clock className="h-3 w-3 inline mr-1" />{fmtTime(r.recorded_at)}</td>
                    <td className="py-2 px-3 font-medium text-foreground capitalize">{r.reading_type.replace('_', ' ')}</td>
                    <td className="py-2 px-3 text-right font-mono font-semibold text-foreground">{r.reading_value} <span className="text-xs text-muted-foreground">{r.units}</span></td>
                    <td className="py-2 px-3 text-muted-foreground text-xs">{r.device_name || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {readings.length > 50 && (
              <p className="text-xs text-muted-foreground text-center mt-3">Showing latest 50 of {readings.length} readings</p>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
