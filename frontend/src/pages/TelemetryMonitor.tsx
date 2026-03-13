import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import type { Vital, Alert, DeviceReading } from '@/types/database';
import { useAllPatients, useVitalsHistory, usePatientAlerts, usePatientMeds, useLabResults } from '@/hooks/usePatientData';
import { usePrediction } from '@/hooks/usePrediction';
import { useICUStore } from '@/store/useICUStore';
import { useAcknowledgeAlert } from '@/hooks/useAlerts';
import { supabase } from '@/lib/supabase';
import AnimatedNumber from '@/components/AnimatedNumber';
import RiskBadge from '@/components/RiskBadge';
import PredictiveRiskRing from '@/components/PredictiveRiskRing';
import TimeToAlertCountdown from '@/components/TimeToAlertCountdown';
import Sparkline from '@/components/Sparkline';
import { SkeletonVitalCard } from '@/components/SkeletonCard';
import { Button } from '@/components/ui/button';
import {
  Heart, Droplets, Wind, Thermometer, Activity, AlertTriangle, Check,
  Pill, FlaskConical, Cpu, ChevronDown, Brain, ChevronRight, ShieldCheck,
  TrendingUp, TrendingDown, Minus, Wifi, WifiOff, Zap, Coffee, Gauge
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, Area, AreaChart, ComposedChart, Bar
} from 'recharts';
import { Tooltip as UiTooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

// ─── Types ───────────────────────────────────────────────────────────────────

interface VitalTrend {
  vital: string;
  label: string;
  slope: number;
  direction: 'rising' | 'falling' | 'stable';
  change_percent: number;
  alarming: boolean;
  current_value?: number;
}
interface CorrelationAlert {
  pattern: string;
  severity: 'warning' | 'urgent' | 'critical';
  explanation: string;
  vitals_involved: string[];
  confidence: number;
}

// ─── Real-time fluctuation hook ──────────────────────────────────────────────
// Adds ±small noise to each vital value every 1.5s for live-icu feel

const FLUCTUATION_SIGMA: Record<string, number> = {
  heart_rate: 1.2,
  blood_pressure_systolic: 1.5,
  blood_pressure_diastolic: 1.2,
  respiratory_rate: 0.6,
  temperature: 0.02,
  oxygen_saturation: 0.3,
  pain_level: 0,
  blood_glucose: 0.8,
  etco2: 0.4,
  map: 0.8,
  pulse: 1.2,
  aw_rr: 0.6,
};

function useFluctuatingVitals(base: Vital | null): Vital | null {
  const [vitals, setVitals] = useState<Vital | null>(base);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const baseRef = useRef<Vital | null>(base);

  // When base changes (new Supabase reading), reset immediately
  useEffect(() => {
    baseRef.current = base;
    setVitals(base);
  }, [base?.id, base?.timestamp]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      const b = baseRef.current;
      if (!b) return;
      const gauss = (sigma: number) => {
        // Box-Muller
        const u = Math.random(), v = Math.random();
        return sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
      };
      setVitals({
        ...b,
        heart_rate: b.heart_rate != null ? Math.max(30, Math.min(220, Math.round(b.heart_rate + gauss(FLUCTUATION_SIGMA.heart_rate)))) : null,
        blood_pressure_systolic: b.blood_pressure_systolic != null ? Math.max(60, Math.min(230, Math.round(b.blood_pressure_systolic + gauss(FLUCTUATION_SIGMA.blood_pressure_systolic)))) : null,
        blood_pressure_diastolic: b.blood_pressure_diastolic != null ? Math.max(40, Math.min(140, Math.round(b.blood_pressure_diastolic + gauss(FLUCTUATION_SIGMA.blood_pressure_diastolic)))) : null,
        respiratory_rate: b.respiratory_rate != null ? Math.max(8, Math.min(50, Math.round(b.respiratory_rate + gauss(FLUCTUATION_SIGMA.respiratory_rate)))) : null,
        temperature: b.temperature != null ? parseFloat((b.temperature + gauss(FLUCTUATION_SIGMA.temperature)).toFixed(1)) : null,
        oxygen_saturation: b.oxygen_saturation != null ? Math.max(70, Math.min(100, Math.round(b.oxygen_saturation + gauss(FLUCTUATION_SIGMA.oxygen_saturation)))) : null,
        blood_glucose: b.blood_glucose != null ? Math.max(50, Math.min(500, Math.round(b.blood_glucose + gauss(FLUCTUATION_SIGMA.blood_glucose)))) : null,
        etco2: b.etco2 != null ? Math.max(10, Math.min(60, Math.round(b.etco2 + gauss(FLUCTUATION_SIGMA.etco2)))) : null,
        map: b.map != null ? Math.max(40, Math.min(150, Math.round(b.map + gauss(FLUCTUATION_SIGMA.map)))) : null,
        pulse: b.pulse != null ? Math.max(30, Math.min(220, Math.round(b.pulse + gauss(FLUCTUATION_SIGMA.pulse)))) : null,
        aw_rr: b.aw_rr != null ? Math.max(8, Math.min(50, Math.round(b.aw_rr + gauss(FLUCTUATION_SIGMA.aw_rr)))) : null,
      } as Vital);
    }, 1500);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  return vitals;
}

// ─── Normal ranges for all vitals ────────────────────────────────────────────

const NORMAL: Record<string, [number, number]> = {
  heart_rate: [60, 100],
  blood_pressure_systolic: [100, 140],
  blood_pressure_diastolic: [60, 90],
  respiratory_rate: [12, 20],
  temperature: [36.1, 37.9],
  oxygen_saturation: [94, 100],
  pain_level: [0, 3],
  blood_glucose: [70, 140],
  etco2: [35, 45],
  map: [70, 105],
  pulse: [60, 100],
  aw_rr: [12, 20],
  news2: [0, 4],
};

function isAbnormal(key: string, val: number | null | undefined): boolean {
  if (val == null) return false;
  const r = NORMAL[key];
  if (!r) return false;
  return val < r[0] || val > r[1];
}

function getSeverity(key: string, val: number | null | undefined): 'critical' | 'warning' | 'normal' {
  if (val == null) return 'normal';
  const r = NORMAL[key];
  if (!r) return 'normal';
  const deviation = Math.max(r[0] - val, val - r[1], 0);
  const range = r[1] - r[0];
  const pct = deviation / range;
  if (pct > 0.4) return 'critical';
  if (pct > 0) return 'warning';
  return 'normal';
}

function formatRef(key: string) {
  const r = NORMAL[key];
  if (!r) return null;
  return `${r[0]}–${r[1]}`;
}

function buildReason(key: string | undefined, val: number | null | undefined, unit: string) {
  if (!key) return null;
  const r = NORMAL[key];
  if (!r) return null;
  if (val == null) return `No reading yet. Reference: ${r[0]}–${r[1]} ${unit}.`;
  if (val < r[0]) {
    const diff = (r[0] - val);
    return `Abnormal (low): ${val}${unit} is below ${r[0]}${unit} by ${diff.toFixed(1)}. Reference: ${r[0]}–${r[1]}${unit}.`;
  }
  if (val > r[1]) {
    const diff = (val - r[1]);
    return `Abnormal (high): ${val}${unit} is above ${r[1]}${unit} by ${diff.toFixed(1)}. Reference: ${r[0]}–${r[1]}${unit}.`;
  }
  return `Normal: ${val}${unit} is within ${r[0]}–${r[1]}${unit}.`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TrendArrow({ direction, alarming }: { direction?: string; alarming?: boolean }) {
  if (!direction) return <Minus className="h-3 w-3 text-muted-foreground" />;
  const Icon = direction === 'rising' ? TrendingUp : direction === 'falling' ? TrendingDown : Minus;
  const clr = alarming ? (direction === 'rising' ? 'text-red-500' : 'text-orange-500') : 'text-muted-foreground';
  return <Icon className={`h-3 w-3 ${clr}`} />;
}

function VitalCard({
  icon: Icon, label, value, value2, unit, color, sparkline,
  precision = 0, trend, vitalKey,
}: {
  icon: React.ElementType;
  label: string;
  value: number | null | undefined;
  value2?: number | null;
  unit: string;
  color: string;
  sparkline?: number[];
  precision?: number;
  trend?: VitalTrend;
  vitalKey?: string;
}) {
  const alarming = trend?.alarming ?? (vitalKey ? isAbnormal(vitalKey, value) : false);
  const severity = vitalKey ? getSeverity(vitalKey, value) : 'normal';
  const borderColor = severity === 'critical' ? '#ef4444' : severity === 'warning' ? '#f59e0b' : color;
  const reason = buildReason(vitalKey, value, unit);
  const ref = vitalKey ? formatRef(vitalKey) : null;

  const card = (
    <motion.div
      className="card-clinical flex flex-col items-center text-center relative overflow-hidden"
      animate={alarming ? {
        boxShadow: [`0 0 0 0px ${borderColor}30`, `0 0 0 4px ${borderColor}30`, `0 0 0 0px ${borderColor}30`]
      } : {}}
      transition={alarming ? { duration: 1.8, repeat: Infinity } : {}}
    >
      <div
        className="absolute top-0 left-0 right-0 h-1 rounded-t-2xl transition-colors duration-300"
        style={{ backgroundColor: borderColor, opacity: alarming ? 0.9 : 0.3 }}
      />

      <div className="flex items-center justify-between w-full px-4 mb-1 mt-2">
        <Icon className="h-4 w-4" style={{ color: borderColor }} />
        {vitalKey && NORMAL[vitalKey] && (
          <span className="text-[8px] font-bold text-muted-foreground/60 border border-border/40 px-1 rounded bg-muted/30">
            REF: {NORMAL[vitalKey][0]}-{NORMAL[vitalKey][1]}
          </span>
        )}
      </div>
      <span className="text-xs text-muted-foreground mb-1">{label}</span>

      <div className="text-2xl font-bold tabular-nums leading-none" style={{ color: borderColor }}>
        <motion.span
          key={String(value)}
          initial={{ opacity: 0.5, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.15 }}
        >
          {value != null ? (
            <>
              <AnimatedNumber value={value} precision={precision} />
              {value2 != null && <>/<AnimatedNumber value={value2} precision={0} /></>}
            </>
          ) : '—'}
        </motion.span>
      </div>
      <span className="text-[10px] text-muted-foreground mt-0.5">{unit}</span>

      {trend && (
        <motion.div
          key={trend.direction + String(alarming)}
          initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
          className={`flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium border ${alarming
            ? trend.direction === 'rising' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-orange-50 border-orange-200 text-orange-700'
            : 'bg-muted border-border text-muted-foreground'
            }`}
        >
          <TrendArrow direction={trend.direction} alarming={alarming} />
          <span>{alarming ? `${Math.abs(trend.change_percent).toFixed(1)}%` : trend.direction}</span>
        </motion.div>
      )}

      {sparkline && sparkline.length > 1 && (
        <div className="mt-2 w-full">
          <Sparkline data={sparkline} color={borderColor} width={64} height={20} />
        </div>
      )}
    </motion.div>
  );

  if (!reason) return card;

  return (
    <UiTooltip>
      <TooltipTrigger asChild>
        <div className="cursor-help">{card}</div>
      </TooltipTrigger>
      <TooltipContent className="max-w-[320px]">
        <div className="text-xs space-y-1">
          <div className="font-semibold">{label}</div>
          {ref && <div className="text-muted-foreground">Reference: {ref}{unit}</div>}
          <div>{reason}</div>
        </div>
      </TooltipContent>
    </UiTooltip>
  );
}

// Colored ECG-style big stat card for critical vitals
function BigVitalCard({
  label, value, value2, unit, color, icon: Icon, trend, vitalKey, subtitle,
}: {
  label: string; value: number | null | undefined; value2?: number | null;
  unit: string; color: string; icon: React.ElementType;
  trend?: VitalTrend; vitalKey?: string; subtitle?: string;
}) {
  const severity = vitalKey ? getSeverity(vitalKey, value) : 'normal';
  const c = severity === 'critical' ? '#ef4444' : severity === 'warning' ? '#f59e0b' : color;

  return (
    <div className="relative rounded-2xl border border-border bg-card p-4 overflow-hidden" style={{ borderColor: `${c}30` }}>
      <div className="absolute inset-0 opacity-5" style={{ background: `radial-gradient(circle at 70% 50%, ${c}, transparent 70%)` }} />
      <div className="relative">
        <div className="flex items-center gap-2 mb-2">
          <Icon className="h-3.5 w-3.5" style={{ color: c }} />
          <span className="text-xs text-muted-foreground font-medium">{label}</span>
          {vitalKey && NORMAL[vitalKey] && (
            <span className="text-[9px] text-muted-foreground/40 font-mono ml-auto">
              [{NORMAL[vitalKey][0]}-{NORMAL[vitalKey][1]}]
            </span>
          )}
          {severity !== 'normal' && (
            <span className={`ml-2 text-[9px] px-1.5 py-0.5 rounded-full font-bold ${severity === 'critical' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
              }`}>{severity.toUpperCase()}</span>
          )}
        </div>
        <div className="flex items-end gap-1">
          <AnimatedNumber
            value={value ?? 0}
            className="text-3xl font-black tabular-nums leading-none"
            style={{ color: c }}
          />
          {value2 != null && (
            <div className="flex items-baseline">
              <span className="text-xl font-bold tabular-nums" style={{ color: c }}>/</span>
              <AnimatedNumber value={value2} className="text-xl font-bold tabular-nums" style={{ color: c }} />
            </div>
          )}
          <span className="text-xs text-muted-foreground mb-0.5 ml-1">{unit}</span>
        </div>
        {subtitle && <p className="text-[10px] text-muted-foreground mt-1">{subtitle}</p>}
        {trend && (
          <div className={`inline-flex items-center gap-1 mt-1.5 text-[10px] font-medium ${trend.alarming ? 'text-red-500' : 'text-muted-foreground'
            }`}>
            <TrendArrow direction={trend.direction} alarming={trend.alarming} />
            <span>{trend.direction} {Math.abs(trend.change_percent).toFixed(1)}%/hr</span>
          </div>
        )}
      </div>
    </div>
  );
}

function CorrelationCard({ corr }: { corr: CorrelationAlert }) {
  const [expanded, setExpanded] = useState(false);
  const sev = corr.severity;
  const bg = sev === 'critical' ? 'bg-destructive/10 border-destructive/30' :
    sev === 'urgent' ? 'bg-amber-50 border-amber-300' : 'bg-primary/5 border-primary/20';
  const emoji = sev === 'critical' ? '🔴' : sev === 'urgent' ? '🟡' : '🔵';

  return (
    <div className={`rounded-xl border ${bg} overflow-hidden`}>
      <button className="w-full flex items-start gap-3 p-3 text-left" onClick={() => setExpanded(e => !e)}>
        <span className="text-base mt-0.5 flex-shrink-0">{emoji}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <span className="text-sm font-semibold text-foreground">{corr.pattern}</span>
            <span className="text-xs text-muted-foreground">{Math.round(corr.confidence * 100)}% confidence</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {corr.vitals_involved.map(v => (
              <span key={v} className="text-[10px] bg-background border border-border rounded px-1.5 py-0.5 text-muted-foreground">{v}</span>
            ))}
          </div>
        </div>
        <ChevronRight className={`h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5 transition-transform ${expanded ? 'rotate-90' : ''}`} />
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-3 pt-0 border-t border-border/40">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 mt-2">Why this alert?</p>
              <p className="text-sm text-foreground leading-relaxed">{corr.explanation}</p>
              <p className="text-[10px] text-muted-foreground/60 mt-2 italic">AI decision support only — verify clinically before acting.</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function LabStatusBadge({ status }: { status: string }) {
  const s: Record<string, string> = {
    normal: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    completed: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    abnormal: 'bg-amber-50 text-amber-700 border border-amber-200',
    critical: 'bg-red-50 text-red-700 border border-red-200',
  };
  return <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${s[status] || 'bg-muted text-muted-foreground border border-border'}`}>{status}</span>;
}

// Bedside Monitor Row Component
function ClinicalMonitorRow({
  label, value, value2, unit, color, data, trend, precision = 0
}: {
  label: string; value: number | null | undefined; value2?: number | null;
  unit: string; color: string; data: number[];
  trend?: VitalTrend; precision?: number;
}) {
  const chartData = useMemo(() => data.map((v, i) => ({ t: i, v })), [data]);
  const isAlarming = trend?.alarming;

  return (
    <div className={`flex bg-[#0a0a0a] border-b border-white/5 last:border-b-0 h-[100px] overflow-hidden group transition-colors hover:bg-[#111] ${isAlarming ? 'bg-red-950/20' : ''}`}>
      <div className="flex-1 relative py-1">
        <div className="absolute top-2 left-3 text-[10px] uppercase font-black tracking-[0.2em] z-10 drop-shadow-md" style={{ color }}>
          {label}
        </div>
        <div className="absolute top-2 right-3 z-10 opacity-30 group-hover:opacity-60 transition-opacity">
          <Activity className="h-3 w-3" style={{ color }} />
        </div>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 25, right: 10, left: 10, bottom: 5 }}>
            <defs>
              <linearGradient id={`g-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.4} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="v"
              stroke={color}
              strokeWidth={2.5}
              fill={`url(#g-${color.replace('#', '')})`}
              dot={false}
              isAnimationActive={false}
              baseLine={Math.min(...data) * 0.9}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="w-[160px] border-l border-white/10 flex flex-col justify-center px-6" style={{ color }}>
        <div className="flex items-baseline gap-1">
          <span className="text-5xl font-black font-mono tracking-tighter tabular-nums leading-none">
            {value != null ? <AnimatedNumber value={value} precision={precision} /> : '--'}
          </span>
          {value2 != null && (
            <span className="text-2xl font-bold opacity-60 tabular-nums">
              /<AnimatedNumber value={value2} />
            </span>
          )}
        </div>
        <div className="flex items-center justify-between mt-2">
          <div className="flex flex-col">
            <span className="text-[10px] font-bold opacity-40 uppercase tracking-widest">{unit}</span>
            {trend && (
              <div className="flex items-center gap-1 mt-0.5">
                <TrendArrow direction={trend.direction} alarming={trend.alarming} />
                <span className={`text-[0.6rem] font-bold ${trend.alarming ? 'text-red-500' : 'opacity-40'}`}>
                  {trend.change_percent >= 0 ? '+' : ''}{trend.change_percent.toFixed(1)}%
                </span>
              </div>
            )}
          </div>
          {isAlarming && (
            <motion.div
              animate={{ opacity: [1, 0.4, 1] }}
              transition={{ duration: 1, repeat: Infinity }}
              className="bg-red-500 text-black text-[9px] font-black px-1.5 py-0.5 rounded leading-none"
            >
              ALARM
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TelemetryMonitor() {
  const navigate = useNavigate();
  const { patientId: routePatientId } = useParams<{ patientId: string }>();
  const { user, hasRole } = useAuth();

  const setCurrentPatient = useICUStore((s) => s.setCurrentPatient);

  // Single source of truth is the URL
  const selectedPatientId = routePatientId || null;

  const [showSelector, setShowSelector] = useState(false);
  const [showSimPanel, setShowSimPanel] = useState(false);
  const [simLoading, setSimLoading] = useState(false);

  const handleSimulateTrend = async (mode: string) => {
    if (!selectedPatientId) return;
    setSimLoading(true);
    try {
      const resp = await fetch(`http://localhost:8000/api/vitals/simulate/mode?patient_id=${selectedPatientId}&mode=${mode}`, {
        method: 'POST'
      });
      const data = await resp.json();
      console.log('Simulation set:', data);
      setShowSimPanel(false);
    } catch (err) {
      console.error('Simulation error:', err);
    } finally {
      setSimLoading(false);
    }
  };
  const [narrativeSummary, setNarrativeSummary] = useState('');
  const [isGeneratingNarrative, setIsGeneratingNarrative] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'trends' | 'clinicals'>('overview');
  const lastNarrativeKey = useRef('');
  const [tempExplanation, setTempExplanation] = useState('');
  const [isExplainingTemp, setIsExplainingTemp] = useState(false);

  // Sync route patient to ICUStore whenever it changes
  useEffect(() => {
    if (selectedPatientId) {
      setCurrentPatient(selectedPatientId);
    }
  }, [selectedPatientId, setCurrentPatient]);

  // ── Data hooks ────────────────────────────────────────────────────────────
  const { data: patients = [], isLoading: patientsLoading } = useAllPatients();
  const { data: vitalsHistory = [], isLoading: vitalsLoading } = useVitalsHistory(selectedPatientId, 80);
  const { data: alertsData = [] } = usePatientAlerts(selectedPatientId);
  const { data: medications = [] } = usePatientMeds(selectedPatientId);
  const { data: labResults = [] } = useLabResults(selectedPatientId);

  // ── Device readings (own local state with realtime) ───────────────────────
  const [devices, setDevices] = useState<DeviceReading[]>([]);
  useEffect(() => {
    if (!selectedPatientId) return;
    supabase.from('device_readings').select('*')
      .eq('patient_id', selectedPatientId)
      .order('timestamp', { ascending: false }).limit(10)
      .then(({ data }) => setDevices((data ?? []) as DeviceReading[]));

    const ch = supabase.channel(`devs-rt-${selectedPatientId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'table_devices', filter: `patient_id=eq.${selectedPatientId}` },
        (payload) => setDevices(prev => [payload.new as DeviceReading, ...prev.slice(0, 9)]))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [selectedPatientId]);

  // ── AI predictions ────────────────────────────────────────────────────────
  const { prediction, wsStatus } = usePrediction(selectedPatientId);

  const loading = vitalsLoading && vitalsHistory.length === 0;

  // Auto-start a stable simulation profile for any newly selected patient
  useEffect(() => {
    if (!selectedPatientId) return;
    if (!vitalsLoading && vitalsHistory.length === 0) {
      // Fire-and-forget; backend will create a stable PATIENT_PROFILES entry
      handleSimulateTrend('stable');
    }
  }, [selectedPatientId, vitalsLoading, vitalsHistory.length]);

  const selectPatient = useCallback((id: string) => {
    if (id === selectedPatientId) return;
    navigate(`/dashboard/telemetry/${id}`);
    setShowSelector(false);
    setNarrativeSummary('');
    lastNarrativeKey.current = '';
  }, [navigate, selectedPatientId]);

  useEffect(() => {
    if (!selectedPatientId && patients.length > 0) {
      // If no patient in URL, go to first patient
      selectPatient(patients[0].id);
    }
  }, [patients, selectedPatientId, selectPatient]);

  const patientRecord = patients.find((p) => p.id === selectedPatientId) ?? null;

  // ── Real-time fluctuating vitals display ──────────────────────────────────
  const baseLatest = useMemo(() => {
    // Prefer WS fresher reading merged over Supabase latest
    const supabaseLatest = vitalsHistory[vitalsHistory.length - 1] ?? null;
    const wsLatest = prediction?.latest_vital;
    if (wsLatest?.heart_rate && supabaseLatest) {
      return { ...supabaseLatest, ...wsLatest } as Vital;
    }
    return supabaseLatest;
  }, [vitalsHistory, prediction?.latest_vital]);

  const displayVital = useFluctuatingVitals(baseLatest);

  // ── AI derived values ─────────────────────────────────────────────────────
  const trends = prediction?.trends ?? [];
  const correlations = prediction?.correlations ?? [];
  const predictiveScore = prediction?.predictive_score ?? 0;
  const timeToAlert = prediction?.time_to_alert ?? null;
  const news2 = prediction?.news2 ?? null;
  const trendMap = Object.fromEntries(trends.map((t) => [t.vital, t]));

  const alerts = alertsData as Alert[];
  const criticalActive = alerts.filter((a) => a.severity === 'critical' && a.status === 'active');

  // ── Groq narrative ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!prediction || prediction.type !== 'prediction') return;
    if (!prediction.correlations?.length || (prediction.predictive_score ?? 0) < 20) return;
    const key = (prediction.correlations ?? []).map((c) => c.pattern).join('|');
    if (key === lastNarrativeKey.current) return;
    lastNarrativeKey.current = key;
    const v = prediction.latest_vital;
    const trendDesc = (prediction.trends ?? []).filter((t) => t.alarming)
      .map((t) => `${t.label}: ${t.direction} ${Math.abs(t.change_percent).toFixed(1)}%`).join(', ');
    const patternDesc = (prediction.correlations ?? []).map((c) => c.pattern).join(', ');
    setIsGeneratingNarrative(true);
    (async () => {
      try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${import.meta.env.VITE_GROQ_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile', max_tokens: 100,
            messages: [
              { role: 'system', content: 'You are a clinical decision support assistant. Write ONE short paragraph (max 2 sentences, 60 words) explaining vital trends. Be specific. End with "Recommend clinical assessment." Never give treatment orders. State this is decision support only.' },
              { role: 'user', content: `HR: ${v?.heart_rate}bpm, SpO2: ${v?.oxygen_saturation}%, BP: ${v?.blood_pressure_systolic}/${v?.blood_pressure_diastolic}mmHg, RR: ${v?.respiratory_rate}/min, Temp: ${v?.temperature}°C, Glucose: ${v?.blood_glucose}mg/dL. Trends: ${trendDesc}. Patterns: ${patternDesc}. Score: ${prediction.predictive_score}/100. NEWS2: ${prediction.news2}.` }
            ]
          })
        });
        const data = await res.json();
        setNarrativeSummary(data.choices?.[0]?.message?.content ?? '');
      } catch {
        setNarrativeSummary((prediction.correlations ?? [])[0]?.explanation ?? '');
      } finally { setIsGeneratingNarrative(false); }
    })();
  }, [prediction]);

  const explainTemperature = async () => {
    if (!displayVital) return;
    setIsExplainingTemp(true);
    setTempExplanation('');
    try {
      const key = import.meta.env.VITE_GROQ_API_KEY as string | undefined;
      if (!key) {
        setTempExplanation('Missing Groq API key (VITE_GROQ_API_KEY).');
        return;
      }
      const v = displayVital;
      const content = [
        `Current vitals: Temp=${v.temperature}°C, HR=${v.heart_rate} bpm, RR=${v.respiratory_rate}/min, SpO2=${v.oxygen_saturation}%, SBP/DBP=${v.blood_pressure_systolic}/${v.blood_pressure_diastolic} mmHg, MAP=${v.map}, glucose=${v.blood_glucose} mg/dL, etCO2=${v.etco2}.`,
        `Explain, in simple clinical language, the most likely reasons why this patient's temperature is at the current level (high, normal, or low), considering the other vitals.`,
        `Do NOT give treatment orders. End with: "Decision support only — recommend clinical assessment."`
      ].join(' ');

      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          max_tokens: 160,
          messages: [
            { role: 'system', content: 'You are a clinical decision support assistant focused on explaining abnormal temperature in context of other vitals.' },
            { role: 'user', content }
          ]
        })
      });
      const data = await res.json();
      const text = data?.choices?.[0]?.message?.content ?? '';
      if (!res.ok) throw new Error(text || data?.error?.message || 'Groq error');
      setTempExplanation(text);
    } catch (e) {
      console.error('Explain temperature error:', e);
      setTempExplanation('AI explanation failed. Please try again.');
    } finally {
      setIsExplainingTemp(false);
    }
  };

  // ── Alert acknowledgement ─────────────────────────────────────────────────
  const ackMutation = useAcknowledgeAlert();
  const acknowledgeAlert = (alertId: string) => {
    if (!user || !selectedPatientId) return;
    ackMutation.mutate({ alertId, userId: user.id, patientId: selectedPatientId });
  };

  // ─── Chart data & Dynamic Trending ──────────────────────────────────────────

  // Ref to track last processed vital to avoid double-appending in dev-mode or re-renders
  const lastVitalId = useRef<string | null>(null);
  const [liveHistory, setLiveHistory] = useState<any[]>([]);

  // Initialize liveHistory from vitalsHistory (initial load)
  useEffect(() => {
    if (vitalsHistory.length > 0) {
      const initial = vitalsHistory.map((v) => ({
        time: new Date(v.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        rawTime: v.timestamp,
        hr: v.heart_rate,
        spo2: v.oxygen_saturation,
        sbp: v.blood_pressure_systolic,
        rr: v.respiratory_rate,
        temp: v.temperature != null ? v.temperature * 10 : null,
        glucose: v.blood_glucose,
        etco2: v.etco2,
        map: v.map,
        pulse: v.pulse,
        aw_rr: v.aw_rr,
      }));
      setLiveHistory(initial);
    }
  }, [vitalsHistory]);

  // Append real-time updates to chart data
  useEffect(() => {
    if (!displayVital || !displayVital.timestamp) return;

    // Check if this is a truly new vital push (not just a fluctuation from the hook)
    // We check against the baseLatest ID because displayVital is baseLatest + noise
    const currentId = baseLatest?.id || baseLatest?.timestamp;
    if (currentId && currentId !== lastVitalId.current) {
      lastVitalId.current = currentId;

      const newPoint = {
        time: new Date(displayVital.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        rawTime: displayVital.timestamp,
        hr: displayVital.heart_rate,
        spo2: displayVital.oxygen_saturation,
        sbp: displayVital.blood_pressure_systolic,
        rr: displayVital.respiratory_rate,
        temp: displayVital.temperature != null ? displayVital.temperature * 10 : null,
        glucose: displayVital.blood_glucose,
        etco2: displayVital.etco2,
        map: displayVital.map,
        pulse: displayVital.pulse,
        aw_rr: displayVital.aw_rr,
      };

      setLiveHistory(prev => {
        // Keep last 100 points
        const updated = [...prev, newPoint];
        return updated.length > 100 ? updated.slice(updated.length - 100) : updated;
      });
    }
  }, [displayVital, baseLatest]);

  // ── Sparklines (using live history for real-time update) ───────────────
  const last12Live = liveHistory.slice(-12);
  const sparkHR = last12Live.map(v => v.hr ?? 0);
  const sparkSPO2 = last12Live.map(v => v.spo2 ?? 0);
  const sparkRR = last12Live.map(v => v.rr ?? 0);
  const sparkSBP = last12Live.map(v => v.sbp ?? 0);
  const sparkGlucose = last12Live.map(v => v.glucose ?? 0);
  const sparkEtCO2 = last12Live.map(v => v.etco2 ?? 0);
  const sparkMAP = last12Live.map(v => v.map ?? 0);

  if (!selectedPatientId && !patientsLoading && patients.length === 0) {
    return (
      <div className="card-clinical text-center py-12">
        <Activity className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
        <p className="text-muted-foreground">No admitted patients found.</p>
      </div>
    );
  }

  // ── Waveform data for live display ────────────────────────────────────────
  const waveSize = 30; // More points for smoother waveforms
  const waveHR = liveHistory.slice(-waveSize).map(v => v.hr ?? 0);
  const waveSPO2 = liveHistory.slice(-waveSize).map(v => v.spo2 ?? 0);
  const waveBP = liveHistory.slice(-waveSize).map(v => v.sbp ?? 0);
  const waveEtCO2 = liveHistory.slice(-waveSize).map(v => v.etco2 ?? 0);
  const wavePulse = liveHistory.slice(-waveSize).map(v => v.pulse ?? 0);
  const waveAwRR = liveHistory.slice(-waveSize).map(v => v.aw_rr ?? 0);

  // If no latest vitals yet, show a safe loading/empty state before using displayVital.*
  if (!loading && !displayVital) {
    return (
      <div className="card-clinical text-center py-12">
        <Activity className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
        <p className="text-muted-foreground">
          Awaiting first ventilator and vital readings…
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Critical Alert Banner ── */}
      <AnimatePresence>
        {criticalActive.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            className="rounded-2xl bg-risk-critical-bg border border-clinical-critical/30 p-4 pulse-critical sticky top-0 z-20"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-clinical-critical" />
                <span className="text-sm font-semibold text-risk-critical-text">
                  {criticalActive.length} Critical Alert{criticalActive.length > 1 ? 's' : ''} — {criticalActive[0].title}
                </span>
              </div>
              {hasRole('nurse', 'doctor', 'admin') && (
                <button onClick={() => criticalActive.forEach(a => acknowledgeAlert(a.id))}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card text-sm font-medium hover:bg-muted transition-colors">
                  <Check className="h-3.5 w-3.5" /> Acknowledge All
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="space-y-4"
      >
        <div className="flex-1">
          <div className="relative">
            <button onClick={() => setShowSelector(!showSelector)}
              className="card-clinical !p-3 flex items-center gap-2 text-sm font-medium text-foreground w-full max-w-sm">
              {patientRecord ? `${patientRecord.first_name} ${patientRecord.last_name} (${patientRecord.mrn})` : 'Select Patient'}
              <ChevronDown className="h-4 w-4 text-muted-foreground ml-auto" />
            </button>
            <AnimatePresence>
              {showSelector && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                  className="absolute top-full mt-1 w-full max-w-sm bg-card rounded-xl border border-border shadow-xl z-30 max-h-64 overflow-y-auto"
                >
                  {patients.map((p) => (
                    <button key={p.id} onClick={() => selectPatient(p.id)}
                      className={`w-full text-left px-4 py-2.5 text-sm hover:bg-muted transition-colors first:rounded-t-xl last:rounded-b-xl ${p.id === selectedPatientId ? 'bg-sidebar-accent text-primary font-medium' : 'text-foreground'}`}>
                      {p.first_name} {p.last_name} <span className="text-muted-foreground">({p.mrn})</span>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          {patientRecord && (
            <div className="flex flex-wrap items-center gap-2 mt-2 text-sm text-muted-foreground">
              <span>MRN: <span className="text-foreground font-medium">{patientRecord.mrn}</span></span>
              <span className="text-border">•</span>
              <span>{patientRecord.gender}, {patientRecord.blood_type}</span>
              <span className="text-border">•</span>
              <RiskBadge level={patientRecord.risk_level} />
              {patientRecord.diagnosis && <span className="text-foreground">{patientRecord.diagnosis}</span>}
            </div>
          )}
        </div>

        {/* Status badges */}
        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
          {prediction?.mode && (
            <span className={`text-xs px-2.5 py-1 rounded-full font-semibold border ${prediction.mode === 'deteriorating' ? 'bg-red-50 text-red-700 border-red-200' :
              prediction.mode === 'improving' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                'bg-muted text-muted-foreground border-border'
              }`}>{prediction.mode}</span>
          )}
          <div className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border ${wsStatus === 'connected' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
            wsStatus === 'connecting' ? 'bg-amber-50 border-amber-200 text-amber-700' :
              'bg-muted border-border text-muted-foreground'
            }`}>
            {wsStatus === 'connected' ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            <span>AI {wsStatus}</span>
          </div>

          <button
            onClick={() => setShowSimPanel(!showSimPanel)}
            className={`flex items-center gap-1.5 text-xs px-3 py-1 rounded-full border transition-all ${showSimPanel ? 'bg-indigo-600 border-indigo-400 text-white shadow-lg' : 'bg-white border-border text-foreground hover:bg-muted'}`}
          >
            <Cpu className={`h-3 w-3 ${showSimPanel ? 'animate-spin' : ''}`} />
            <span>Simulate Deterioration</span>
          </button>
        </div>

        {/* ── Simulation Control Panel ── */}
        <AnimatePresence>
          {showSimPanel && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="card-clinical !bg-gradient-to-br from-indigo-50 to-white border-indigo-200 !p-4">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-semibold text-indigo-900 flex items-center gap-2">
                      <Brain className="h-4 w-4" /> Deterioration Simulation Engine
                    </h3>
                    <p className="text-xs text-indigo-700 mt-0.5">Stress-test AI predictive detection with clinical templates.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">Simulation Active</span>
                    <div className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-pulse" />
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
                  {[
                    { id: 'sepsis', label: 'Septic Shock', color: 'bg-red-500', desc: '↑Temp, ↑HR, ↓MAP' },
                    { id: 'resp_failure', label: 'Resp Failure', color: 'bg-orange-600', desc: '↓SpO2, ↑EtCO2' },
                    { id: 'resp_distress', label: 'Resp Distress', color: 'bg-orange-500', desc: '↑RR, ↑HR, ↓SpO2' },
                    { id: 'hemodynamic', label: 'Circulatory', color: 'bg-rose-600', desc: '↑HR, ↓↓BP' },
                    { id: 'stable', label: 'Normal Base', color: 'bg-blue-500', desc: 'Zero drift' },
                    { id: 'improving', label: 'Recovering', color: 'bg-emerald-500', desc: 'Normalizing values' },
                  ].map((trend) => (
                    <button
                      key={trend.id}
                      disabled={simLoading}
                      onClick={() => handleSimulateTrend(trend.id)}
                      className={`group relative p-2 rounded-xl border text-left transition-all hover:shadow-md ${simLoading ? 'opacity-50' : 'hover:border-indigo-400 hover:bg-white'}`}
                    >
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <div className={`h-1.5 w-1.5 rounded-full ${trend.color}`} />
                        <span className="text-[11px] font-bold text-gray-800">{trend.label}</span>
                      </div>
                      <p className="text-[9px] text-gray-500 leading-tight">{trend.desc}</p>
                      {simLoading && <div className="absolute inset-0 flex items-center justify-center bg-white/50 rounded-xl"><Activity className="h-4 w-4 animate-spin text-indigo-600" /></div>}
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* ── Clinical Bedside Monitor Layout (Waveform Focus) ── */}
      {!loading && displayVital && (
        <div className="rounded-2xl border border-white/10 bg-[#050505] overflow-hidden shadow-2xl">
          <div className="bg-[#111] px-4 py-2 border-b border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-4">
      <div className="flex flex-col">
                <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Patient Monitor</span>
                <span className="text-xs font-bold text-white tracking-tight">Active Surveillance Mode</span>
              </div>
              <div className="h-8 w-px bg-white/10" />
              <div className="flex items-center gap-3">
                <div className="flex flex-col">
                  <span className="text-[9px] text-gray-500 font-bold uppercase">Sweep Speed</span>
                  <span className="text-[10px] text-emerald-400 font-mono">25 mm/s</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[9px] text-gray-500 font-bold uppercase">Source</span>
                  <span className="text-[10px] text-blue-400 font-mono">Telemetry Node B4</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="px-2 py-1 rounded bg-white/5 border border-white/10 text-[10px] font-mono text-white/60">
                {new Date().toLocaleTimeString()}
              </div>
              <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
            </div>
          </div>

          <div className="flex flex-col">
            <ClinicalMonitorRow
              label="HR / Heart Rate"
              value={displayVital?.heart_rate ?? null}
              unit="bpm"
              color="#10b981"
              data={waveHR}
              trend={trendMap['hr']}
            />
            <ClinicalMonitorRow
              label="SpO2 / Oxygen Sat"
              value={displayVital?.oxygen_saturation ?? null}
              unit="%"
              color="#facc15"
              data={waveSPO2}
              trend={trendMap['spo2']}
            />
            <ClinicalMonitorRow
              label="Pulse / Pleth"
              value={displayVital?.pulse ?? displayVital?.heart_rate ?? null}
              unit="bpm"
              color="#facc15"
              data={wavePulse}
              trend={trendMap['pulse']}
            />
            <ClinicalMonitorRow
              label="ABP / Blood Pressure"
              value={displayVital?.blood_pressure_systolic ?? null}
              value2={displayVital?.blood_pressure_diastolic ?? null}
              unit="mmHg"
              color="#ef4444"
              data={waveBP}
              trend={trendMap['bp']}
            />
            <ClinicalMonitorRow
              label="etCO2 / Capnography"
              value={displayVital?.etco2 ?? null}
              unit="mmHg"
              color="#ffffff"
              data={waveEtCO2}
              trend={trendMap['etco2']}
            />
            <ClinicalMonitorRow
              label="awRR / Respiratory"
              value={displayVital?.aw_rr ?? displayVital?.respiratory_rate ?? null}
              unit="/min"
              color="#ffffff"
              data={waveAwRR}
              trend={trendMap['aw_rr']}
            />
          </div>
        </div>
      )}

      {/* ── Primary Vital Grid — All 8 ICU Vitals ── */}
      {
        loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => <SkeletonVitalCard key={i} />)}
          </div>
        ) : displayVital ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Row 1 */}
            <VitalCard icon={Heart} label="Heart Rate" value={displayVital?.heart_rate ?? null}
              unit="bpm" color="#ef4444" sparkline={sparkHR} trend={trendMap['hr']} vitalKey="heart_rate" />
            <VitalCard icon={Droplets} label="SpO₂" value={displayVital?.oxygen_saturation ?? null}
              unit="%" color="#3b82f6" sparkline={sparkSPO2} trend={trendMap['spo2']} vitalKey="oxygen_saturation" />
            <VitalCard icon={Activity} label="Blood Pressure"
              value={displayVital?.blood_pressure_systolic ?? null} value2={displayVital?.blood_pressure_diastolic ?? null}
              unit="mmHg" color="#10b981" sparkline={sparkSBP} trend={trendMap['bp']} vitalKey="blood_pressure_systolic" />
            <VitalCard icon={Wind} label="Resp. Rate" value={displayVital?.respiratory_rate ?? null}
              unit="/min" color="#8b5cf6" sparkline={sparkRR} trend={trendMap['rr']} vitalKey="respiratory_rate" />
            {/* Row 2 */}
            <VitalCard icon={Thermometer} label="Temperature" value={displayVital?.temperature ?? null}
              unit="°C" color="#f97316" precision={1} trend={trendMap['temp']} vitalKey="temperature" />
            <VitalCard icon={Coffee} label="Blood Glucose" value={displayVital?.blood_glucose ?? null}
              unit="mg/dL" color="#eab308" sparkline={sparkGlucose} trend={trendMap['glucose']} vitalKey="blood_glucose" />
            <VitalCard icon={Gauge} label="Pain Level" value={displayVital?.pain_level ?? null}
              unit="/10" color="#ec4899" trend={trendMap['pain']} vitalKey="pain_level" />
            <VitalCard icon={Activity} label="MAP" value={displayVital?.map ?? null}
              unit="mmHg" color="#10b981" sparkline={sparkMAP} trend={trendMap['map']} vitalKey="map" />
            <VitalCard icon={Wind} label="etCO₂" value={displayVital?.etco2 ?? null}
              unit="mmHg" color="#8b5cf6" sparkline={sparkEtCO2} trend={trendMap['etco2']} vitalKey="etco2" />
            <VitalCard icon={Brain} label="NEWS2 Score" value={news2 ?? 0}
              unit="pts" color={news2 != null && news2 >= 7 ? '#ef4444' : news2 != null && news2 >= 5 ? '#f59e0b' : '#6b7280'}
              vitalKey="news2" />
          </div>
        ) : (
          <div className="card-clinical text-center py-8">
            <p className="text-muted-foreground text-sm">Awaiting first vitals reading…</p>
          </div>
        )
      }

      {/* ── Tab navigation ── */}
      <div className="flex gap-1 bg-muted rounded-xl p-1 w-fit">
        {(['overview', 'trends', 'clinicals'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all capitalize ${activeTab === tab ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}>
            {tab}
          </button>
        ))}
      </div>

      {/* ── Tabs Content ── */}
      <div className="flex-1">
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            {/* ── Focus on AI & Alerts ── */}
            <div className="lg:col-span-1 space-y-4">
              {/* Risk ring */}
              <div className="card-clinical text-center !bg-[#0a0a0a] border-white/5">
                <div className="flex items-center gap-2 mb-3 justify-center text-white/40">
                  <Brain className="h-4 w-4" />
                  <span className="text-[10px] font-bold uppercase tracking-widest">AI Clinical Vigilance</span>
                </div>
                <PredictiveRiskRing score={predictiveScore} size={140} />
                {timeToAlert != null && (
                  <div className="mt-4">
                    <TimeToAlertCountdown minutes={timeToAlert} />
                  </div>
                )}
                {news2 != null && (
                  <div className={`mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold ${news2 >= 7 ? 'bg-red-500/10 text-red-500 border border-red-500/20' :
                    news2 >= 5 ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' :
                      'bg-white/5 text-white/40 border border-white/10'
                    }`}>
                    <ShieldCheck className="h-3 w-3" /> NEWS2: {news2}
                  </div>
                )}
              </div>

              {/* Correlations (Summary) */}
              {correlations.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-[10px] font-bold text-white/30 uppercase tracking-widest px-1">Detected Patterns</h4>
                  {correlations.slice(0, 2).map((c, i) => <CorrelationCard key={i} corr={c} />)}
                </div>
              )}
            </div>

            {/* ── AI Narrative Summary ── */}
            <div className="lg:col-span-3 space-y-4">
              {(narrativeSummary || isGeneratingNarrative || tempExplanation) && (
                <div className="card-clinical !bg-[#0a0a0a] border-primary/20 p-5">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-1.5 rounded-lg bg-primary/10 border border-primary/20">
                      <Zap className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white uppercase tracking-wider">AI Clinical Assessment</h4>
                      <p className="text-[10px] text-white/40 font-medium">Real-time narrative & temperature explanation</p>
                    </div>
                    <div className="ml-auto flex items-center gap-2 text-[10px] text-primary/60 font-mono">
                      {isGeneratingNarrative && <><Activity className="h-3 w-3 animate-spin" /> Narrative…</>}
                      {isExplainingTemp && <><Activity className="h-3 w-3 animate-spin" /> Temp…</>}
                    </div>
                  </div>
                  <div className="relative">
                    <div className="absolute -left-3 top-0 bottom-0 w-0.5 bg-gradient-to-b from-primary/50 to-transparent rounded-full" />
                    {narrativeSummary && (
                      <p className="text-sm text-white/80 leading-relaxed font-medium pl-2 italic">"{narrativeSummary}"</p>
                    )}
                    {tempExplanation && (
                      <p className="text-xs text-white/70 leading-relaxed font-normal pl-2 mt-3">
                        {tempExplanation}
                      </p>
                    )}
                  </div>
                  <div className="mt-4 flex justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={explainTemperature}
                      disabled={!displayVital || isExplainingTemp}
                    >
                      Explain Temperature
                    </Button>
                  </div>
                </div>
              )}

              {/* Primary Vital Grid (Condensed) */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <VitalCard icon={Heart} label="HR" value={displayVital?.heart_rate ?? null}
                  unit="bpm" color="#10b981" sparkline={sparkHR} trend={trendMap['hr']} vitalKey="heart_rate" />
                <VitalCard icon={Droplets} label="SpO₂" value={displayVital?.oxygen_saturation ?? null}
                  unit="%" color="#facc15" sparkline={sparkSPO2} trend={trendMap['spo2']} vitalKey="oxygen_saturation" />
                <VitalCard icon={Activity} label="MAP" value={displayVital?.map ?? null}
                  unit="mmHg" color="#10b981" sparkline={sparkMAP} trend={trendMap['map']} vitalKey="map" />
                <VitalCard icon={Wind} label="etCO₂" value={displayVital?.etco2 ?? null}
                  unit="mmHg" color="#ffffff" sparkline={sparkEtCO2} trend={trendMap['etco2']} vitalKey="etco2" />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'trends' && (
          <div className="space-y-4">
            {/* Multi-parameter trend chart - MOVED HERE */}
            <div className="card-clinical">
              <h3 className="text-sm font-semibold text-foreground mb-4 font-mono tracking-tight flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary animate-pulse" />
                Live Multi-Parametric Trend ({liveHistory.length} samples)
              </h3>
              {liveHistory.length > 1 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={liveHistory}>
                    <CartesianGrid strokeDasharray="2 2" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="time" tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" minTickGap={30} />
                    <YAxis yAxisId="l" tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" domain={[0, 220]} />
                    <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" domain={[60, 100]} />
                    <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid hsl(var(--border))', fontSize: '12px' }} />
                    <ReferenceLine yAxisId="l" y={100} label={{ position: 'right', value: 'High HR', fontSize: 8, fill: '#ef4444' }} stroke="#ef4444" strokeDasharray="4 2" strokeOpacity={0.3} />
                    <ReferenceLine yAxisId="r" y={90} label={{ position: 'right', value: 'Low SpO2', fontSize: 8, fill: '#3b82f6' }} stroke="#3b82f6" strokeDasharray="4 2" strokeOpacity={0.3} />

                    <Line yAxisId="l" type="monotone" dataKey="hr" stroke="#ef4444" dot={false} strokeWidth={2.5} name="HR" isAnimationActive={false} />
                    <Line yAxisId="r" type="monotone" dataKey="spo2" stroke="#3b82f6" dot={false} strokeWidth={2.5} name="SpO₂" isAnimationActive={false} />
                    <Line yAxisId="l" type="monotone" dataKey="sbp" stroke="#10b981" dot={false} strokeWidth={2} name="SBP" isAnimationActive={false} />
                    <Line yAxisId="l" type="monotone" dataKey="rr" stroke="#8b5cf6" dot={false} strokeWidth={2} name="RR" isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
                  Waiting for trend data…
                </div>
              )}
            </div>

            {/* Glucose chart */}
            <div className="card-clinical">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Coffee className="h-4 w-4 text-yellow-500" /> Blood Glucose Trend (mg/dL)
              </h3>
              <ResponsiveContainer width="100%" height={200}>
                <ComposedChart data={liveHistory}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="time" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" minTickGap={40} />
                  <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip />
                  <ReferenceLine y={70} stroke="#ef4444" strokeDasharray="3 2" />
                  <ReferenceLine y={140} stroke="#f59e0b" strokeDasharray="3 2" />
                  <Bar dataKey="glucose" fill="#eab308" opacity={0.4} radius={[2, 2, 0, 0]} isAnimationActive={false} />
                  <Line type="monotone" dataKey="glucose" stroke="#ca8a04" strokeWidth={2} dot={false} name="Glucose" isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* Temperature + RR chart */}
            <div className="card-clinical">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Thermometer className="h-4 w-4 text-orange-500" /> Temperature × Resp. Rate
              </h3>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={liveHistory}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="time" tick={{ fontSize: 10 }} minTickGap={40} />
                  <YAxis yAxisId="l" tick={{ fontSize: 10 }} />
                  <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Line yAxisId="l" type="monotone" dataKey="temp" stroke="#f97316" strokeWidth={2} dot={false} name="Temp×10" isAnimationActive={false} />
                  <Line yAxisId="r" type="monotone" dataKey="rr" stroke="#8b5cf6" strokeWidth={2} dot={false} name="RR" isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* AI trend tags */}
            {trends.length > 0 && (
              <div className="card-clinical">
                <h3 className="text-sm font-semibold mb-3">AI Trend Analysis</h3>
                <div className="grid grid-cols-2 gap-2">
                  {trends.map((t) => (
                    <div key={t.vital} className={`flex items-center gap-2 p-2 rounded-lg text-xs ${t.alarming ? 'bg-red-50 border border-red-200' : 'bg-muted'
                      }`}>
                      <TrendArrow direction={t.direction} alarming={t.alarming} />
                      <span className="font-medium text-foreground">{t.label}</span>
                      <span className="ml-auto text-muted-foreground">{t.change_percent > 0 ? '+' : ''}{t.change_percent.toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'clinicals' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Alerts */}
            <div className="card-clinical">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" /> Active Alerts
              </h3>
              {alerts.length === 0 ? (
                <p className="text-sm text-muted-foreground">No active alerts.</p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  <AnimatePresence>
                    {alerts.map(alert => (
                      <motion.div
                        key={alert.id}
                        layout initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}
                        className={`flex items-start gap-3 p-3 rounded-xl border ${alert.status === 'acknowledged' ? 'bg-muted border-border opacity-60' :
                          alert.severity === 'critical' ? 'bg-red-50 border-red-200' :
                            alert.severity === 'high' ? 'bg-amber-50 border-amber-200' : 'bg-card border-border'
                          }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${alert.severity === 'critical' ? 'bg-red-200 text-red-800' :
                              alert.severity === 'high' ? 'bg-amber-200 text-amber-800' : 'bg-muted text-muted-foreground'
                              }`}>{alert.severity}</span>
                            {alert.status === 'acknowledged' && <span className="text-[10px] text-muted-foreground">✓ acked</span>}
                          </div>
                          <p className="text-sm text-foreground font-medium">{alert.title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{alert.message}</p>
                        </div>
                        {alert.status === 'active' && hasRole('nurse', 'doctor', 'admin') && (
                          <button onClick={() => acknowledgeAlert(alert.id)}
                            className="flex-shrink-0 p-1.5 rounded-lg hover:bg-muted transition-colors">
                            <Check className="h-4 w-4 text-muted-foreground" />
                          </button>
                        )}
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>

            {/* Medications */}
            <div className="card-clinical">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Pill className="h-4 w-4" /> Active Medications
              </h3>
              {medications.length === 0 ? (
                <p className="text-sm text-muted-foreground">No active medications.</p>
              ) : (
                <div className="space-y-2">
                  {medications.map(med => (
                    <div key={med.id} className="p-2.5 rounded-xl bg-muted/50 border border-border text-sm">
                      <div className="font-medium text-foreground">{med.name}</div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        <span>{med.dosage}</span>
                        <span className="text-border">•</span>
                        <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">{med.route}</span>
                        <span className="text-border">•</span>
                        <span>{med.frequency}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Lab Results + Devices */}
            <div className="space-y-4">
              <div className="card-clinical">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <FlaskConical className="h-4 w-4" /> Recent Labs
                </h3>
                {labResults.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No lab results.</p>
                ) : (
                  <div className="space-y-1.5">
                    {labResults.slice(0, 6).map(lab => (
                      <div key={lab.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50 text-xs">
                        <div>
                          <span className="font-medium text-foreground">{lab.test_name}</span>
                          {lab.result_value && <span className="text-muted-foreground ml-2">{lab.result_value} {lab.units}</span>}
                        </div>
                        <div className="flex items-center gap-1.5">
                          {lab.reference_range && <span className="text-muted-foreground">{lab.reference_range}</span>}
                          <LabStatusBadge status={lab.status} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="card-clinical">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Cpu className="h-4 w-4" /> Device Readings
                </h3>
                {devices.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No device readings.</p>
                ) : (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {devices.map(d => (
                      <div key={d.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50 text-xs">
                        <div>
                          <span className="font-medium text-foreground">{d.device_type}</span>
                          <span className="text-muted-foreground ml-2">{d.reading_type}: {d.reading_value} {d.units}</span>
                        </div>
                        <span className="text-muted-foreground">{new Date(d.timestamp).toLocaleTimeString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
