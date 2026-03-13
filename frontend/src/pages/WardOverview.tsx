import { useMemo, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useWards, useWardBeds, useWardOccupancy, useHospital } from '@/hooks/useWardData';
import { useAlertCounts } from '@/hooks/useAlerts';
import { useICUStore, selectPrediction } from '@/store/useICUStore';
import { usePrediction } from '@/hooks/usePrediction';
import RiskBadge from '@/components/RiskBadge';
import PredictiveRiskRing from '@/components/PredictiveRiskRing';
import SkeletonCard from '@/components/SkeletonCard';
import AnimatedNumber from '@/components/AnimatedNumber';
import {
  Heart, Droplets, Activity,
  Monitor as MonitorIcon, Brain,
  ChevronLeft, History, User, Clock, ArrowRight, ShieldAlert, Users
} from 'lucide-react';
import Sparkline from '@/components/Sparkline';

export default function WardOverview() {
  const navigate = useNavigate();
  const { wardId } = useParams<{ wardId: string }>();
  const { setCurrentWard } = useICUStore();

  // ── Data hooks ────────────────────────────────────────────────────────────
  const { data: wards = [] } = useWards();
  const currentWard = wards.find(w => w.id === wardId);
  const { data: hospital } = useHospital();

  // Update store
  useEffect(() => {
    if (wardId && wardId !== useICUStore.getState().currentWardId) {
      setCurrentWard(wardId);
    }
  }, [wardId, setCurrentWard]);

  const { data: beds = [], isLoading: bedsLoading } = useWardBeds(wardId || null);
  const { data: occupancy } = useWardOccupancy(wardId || null);

  // Current focal patient
  const currentBed = useMemo(() => {
    return beds.find(b => b.patient && b.patient.patient_status === 'admitted');
  }, [beds]);

  const currentPatient = currentBed?.patient;

  // ─── Real-time Subscriptions ───
  // Subscribes to 1s WebSocket updates for the hero patient
  const { prediction: wsPrediction } = usePrediction(currentPatient?.id || null);
  const realTimeVitals = useICUStore((s) => s.latestVitals[currentPatient?.id || ''] || null);

  const otherPatients = useMemo(() => {
    return beds
      .filter(b => b.patient && b.patient.id !== currentPatient?.id)
      .map(b => b.patient!);
  }, [beds, currentPatient]);

  const aiPredictions = useICUStore((s) => s.aiPredictions);
  const currentAiData = currentPatient ? aiPredictions[currentPatient.id] : undefined;

  // Smoothing for 1s risk score updates
  const [displayScore, setDisplayScore] = useState(0);
  useEffect(() => {
    if (currentAiData?.predictive_score) {
      setDisplayScore(currentAiData.predictive_score);
    }
  }, [currentAiData?.predictive_score]);

  if (bedsLoading || !currentWard) {
    return (
      <div className="p-6 space-y-6">
        <SkeletonCard className="h-12 w-48" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <SkeletonCard className="lg:col-span-2 h-[400px]" />
          <SkeletonCard className="h-[400px]" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back Button & Title */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/dashboard')}
            className="p-2 hover:bg-white rounded-xl border border-transparent hover:border-gray-100 transition-all text-gray-400 hover:text-gray-900"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{currentWard.name}</h1>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">{hospital?.name}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <AnimatePresence mode="wait">
            <div className="px-4 py-2 bg-white rounded-2xl border border-gray-100 shadow-sm flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Live Sync</span>
              </div>
              <div className="w-[1px] h-3 bg-gray-100" />
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" />
                <span className="text-xs font-bold text-gray-600">Occupancy: {occupancy?.occupancy_rate || 0}%</span>
              </div>
            </div>
          </AnimatePresence>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Current Patient Hero */}
        <div className="lg:col-span-8 space-y-6">
          {currentPatient ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-[2rem] border border-gray-100 shadow-xl overflow-hidden relative"
            >
              <div className="h-32 bg-gradient-to-r from-primary to-indigo-600 relative overflow-hidden">
                <div className="absolute inset-0 opacity-10">
                  <Activity className="w-64 h-64 -rotate-12 absolute -right-12 -top-12" />
                </div>
                <div className="absolute bottom-4 left-8 text-white">
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-80">Primary Focus</span>
                  <h2 className="text-2xl font-bold capitalize">Bed {currentBed.bed_number}: {currentPatient.first_name} {currentPatient.last_name}</h2>
                </div>
              </div>

              <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                      <Heart className="w-4 h-4 text-red-500" />
                      Live Status
                    </h3>
                    <RiskBadge level={currentPatient.risk_level} />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <LiveVitalCard label="HR" value={realTimeVitals?.heart_rate || currentBed.latestVitals?.heart_rate} unit="bpm" icon={Heart} color="red" sparkline={currentBed.latestVitals ? [currentBed.latestVitals.heart_rate || 0, realTimeVitals?.heart_rate || 0] : []} />
                    <LiveVitalCard label="SpO2" value={realTimeVitals?.oxygen_saturation || currentBed.latestVitals?.oxygen_saturation} unit="%" icon={Droplets} color="blue" sparkline={currentBed.latestVitals ? [currentBed.latestVitals.oxygen_saturation || 0, realTimeVitals?.oxygen_saturation || 0] : []} />
                    <LiveVitalCard label="BP" value={realTimeVitals?.blood_pressure_systolic || currentBed.latestVitals?.blood_pressure_systolic} value2={realTimeVitals?.blood_pressure_diastolic || currentBed.latestVitals?.blood_pressure_diastolic} unit="mmHg" icon={Activity} color="green" />
                    <LiveVitalCard label="NEWS2" value={currentAiData?.news2 ?? (currentPatient as any).news2_score} unit="pts" icon={ShieldAlert} color="orange" />
                  </div>

                  <button
                    onClick={() => navigate(`/dashboard/telemetry/${currentPatient.id}`)}
                    className="w-full mt-4 py-4 bg-gray-900 text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-primary transition-all shadow-lg group"
                  >
                    Open Comprehensive Telemetry
                    <MonitorIcon className="w-5 h-5 group-hover:scale-110 transition-transform" />
                  </button>
                </div>

                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                      <Brain className="w-4 h-4 text-primary" />
                      AI Predictive Score
                    </h3>
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping" />
                      <span className="text-[10px] font-bold text-blue-500 uppercase">1s Update</span>
                    </div>
                  </div>

                  <div className="flex flex-col items-center justify-center p-6 bg-gray-50 rounded-3xl border border-gray-100 relative">
                    <PredictiveRiskRing score={displayScore} size={140} strokeWidth={12} />
                    <div className="mt-4 text-center">
                      <div className="text-3xl font-black text-gray-900 tabular-nums">
                        <AnimatedNumber value={Math.round(displayScore)} />
                      </div>
                      <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">
                        Confidence {currentAiData?.confidence || 98}%
                      </div>
                    </div>
                  </div>

                  <div className="p-4 bg-blue-50/50 rounded-2xl border border-blue-100/50 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2 text-blue-700 mb-0.5">
                        <Clock className="w-3 h-3" />
                        <span className="text-[9px] font-bold uppercase tracking-tighter">Time to Next Event</span>
                      </div>
                      <div className="text-lg font-bold text-blue-900">
                        {currentAiData?.time_to_alert ? `~ ${currentAiData.time_to_alert} minutes` : 'Monitoring...'}
                      </div>
                    </div>
                    <div className="w-10 h-10 rounded-full border-2 border-primary/20 flex items-center justify-center text-[10px] font-black text-primary">
                      {Math.floor(displayScore / 10)}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          ) : (
            <div className="bg-white p-12 rounded-[2rem] border border-dashed border-gray-200 text-center">
              <User className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 font-medium">No active patient in this ward.</p>
            </div>
          )}
        </div>

        <div className="lg:col-span-4 space-y-6">
          <div className="flex items-center justify-between px-2">
            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
              <History className="w-4 h-4" />
              Earlier Patients
            </h3>
            <span className="text-[10px] font-bold bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{otherPatients.length}</span>
          </div>

          <div className="space-y-4">
            {otherPatients.length === 0 ? (
              <div className="p-8 text-center bg-gray-50 rounded-2xl border border-gray-100 italic text-gray-400 text-xs">
                No patient history found for this ward.
              </div>
            ) : (
              otherPatients.map((patient, idx) => (
                <motion.div
                  key={patient.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  onClick={() => navigate(`/dashboard/telemetry/${patient.id}`)}
                  className="p-4 bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all cursor-pointer group"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center text-xs font-bold text-gray-400 group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                        {patient.first_name[0]}{patient.last_name[0]}
                      </div>
                      <div>
                        <div className="text-sm font-bold text-gray-900 group-hover:text-primary transition-colors">{patient.first_name} {patient.last_name}</div>
                        <div className="text-[10px] text-gray-400 font-bold uppercase tracking-tight">{patient.mrn}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {aiPredictions[patient.id] && (
                        <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-lg bg-blue-50 border border-blue-100">
                          <Brain className="w-2.5 h-2.5 text-blue-500" />
                          <span className="text-[10px] font-bold text-blue-600">
                            <AnimatedNumber value={Math.round(aiPredictions[patient.id].predictive_score)} />
                          </span>
                        </div>
                      )}
                      <RiskBadge level={patient.risk_level} />
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-4 pl-10 border-t border-gray-50 pt-2">
                    <div className="text-[9px] font-bold text-gray-400 flex items-center gap-1 uppercase">
                      <Clock className="w-3 h-3" />
                      Status: {patient.patient_status}
                    </div>
                    <ArrowRight className="w-3 h-3 text-gray-300 group-hover:translate-x-1 transition-transform group-hover:text-primary" />
                  </div>
                </motion.div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const VITAL_THRESHOLDS: Record<string, string> = {
  'HR': '60-100',
  'SpO2': '95-100',
  'BP': '90/60-140/90',
  'NEWS2': '< 5',
  'Temp': '36.1-37.9',
  'Resp': '12-20'
};

function LiveVitalCard({ label, value, value2, unit, icon: Icon, color, sparkline }: any) {
  const colors: any = {
    red: 'text-red-600 bg-red-50',
    blue: 'text-blue-600 bg-blue-50',
    green: 'text-green-600 bg-green-50',
    orange: 'text-amber-600 bg-amber-50'
  };

  const threshold = VITAL_THRESHOLDS[label];

  return (
    <div className="p-4 rounded-2xl bg-gray-50 border border-gray-100 shadow-inner group transition-all hover:bg-white hover:shadow-sm relative overflow-hidden">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <div className={`p-1.5 rounded-lg ${colors[color]}`}>
            <Icon className="w-3 h-3" />
          </div>
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{label}</span>
        </div>
        {threshold && (
          <span className="text-[8px] font-black text-gray-300 uppercase tracking-tighter">
            Ref: {threshold}
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-xl font-bold text-gray-900 tabular-nums leading-none">
          {value != null ? <AnimatedNumber value={value} /> : '—'}
          {value2 != null && <><span className="text-sm text-gray-400">/</span><AnimatedNumber value={value2} /></>}
        </span>
        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">{unit}</span>
      </div>
      {sparkline && sparkline.length > 1 && (
        <div className="mt-2 h-6 w-full opacity-50 group-hover:opacity-100 transition-opacity">
          <Sparkline data={sparkline} color={color === 'red' ? '#ef4444' : color === 'blue' ? '#3b82f6' : color === 'green' ? '#10b981' : '#f59e0b'} width={120} height={20} />
        </div>
      )}
    </div>
  );
}
