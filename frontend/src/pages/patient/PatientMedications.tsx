import { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Pill, Plus, X, Clock, AlertTriangle, CheckCircle2,
  Sparkles, Calendar, Search, RotateCcw, Bell, ChevronDown,
  Info, ShieldCheck, Brain
} from 'lucide-react';
import { toast } from 'sonner';

/* ─── Types ─────────────────────────────────────────────────────────── */
interface PatientMed {
  id: string;
  patient_user_id: string;
  medication_name: string;
  dosage: string;
  frequency: string;
  route: string;
  start_date: string;
  end_date: string | null;
  prescribed_by: string | null;
  status: 'active' | 'completed' | 'discontinued';
  instructions: string | null;
  created_at: string;
}

interface AIInsight {
  type: 'interaction' | 'reminder' | 'tip';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
}

/* ─── AI Engine (client-side heuristic) ─────────────────────────────── */
function generateMedInsights(meds: PatientMed[]): AIInsight[] {
  const insights: AIInsight[] = [];
  const active = meds.filter(m => m.status === 'active');

  // Drug interaction checks (simulated knowledge base)
  const interactionPairs: [string, string, string][] = [
    ['aspirin', 'warfarin', 'Increased bleeding risk when Aspirin is taken with Warfarin. Monitor INR frequently.'],
    ['ibuprofen', 'aspirin', 'Ibuprofen may reduce the cardioprotective effects of Aspirin.'],
    ['metformin', 'contrast dye', 'Hold Metformin 48h before contrast imaging.'],
    ['lisinopril', 'potassium', 'ACE inhibitors + potassium supplements increase hyperkalemia risk.'],
    ['simvastatin', 'amlodipine', 'Simvastatin dose should not exceed 20mg with Amlodipine.'],
    ['clopidogrel', 'omeprazole', 'Omeprazole may reduce Clopidogrel efficacy — consider Pantoprazole.'],
  ];
  const names = active.map(m => m.medication_name.toLowerCase());
  for (const [a, b, msg] of interactionPairs) {
    if (names.some(n => n.includes(a)) && names.some(n => n.includes(b))) {
      insights.push({ type: 'interaction', severity: 'warning', title: `⚠ Interaction: ${a} + ${b}`, message: msg });
    }
  }

  // Missed dose reminder
  active.forEach(m => {
    if (m.frequency.includes('daily') && !m.instructions) {
      insights.push({
        type: 'reminder', severity: 'info',
        title: `💊 ${m.medication_name} Schedule`,
        message: `Take ${m.dosage} ${m.frequency}. Set a daily alarm for best adherence.`,
      });
    }
  });

  // Polypharmacy warning
  if (active.length >= 5) {
    insights.push({
      type: 'tip', severity: 'warning',
      title: '📋 Polypharmacy Alert',
      message: `You are on ${active.length} active medications. Discuss a medication review with your doctor to optimize your regimen.`,
    });
  }

  // Expiring medications
  active.forEach(m => {
    if (m.end_date) {
      const daysLeft = Math.ceil((new Date(m.end_date).getTime() - Date.now()) / 86400000);
      if (daysLeft > 0 && daysLeft <= 7) {
        insights.push({
          type: 'reminder', severity: 'info',
          title: `⏰ ${m.medication_name} ending soon`,
          message: `Prescription ends in ${daysLeft} day${daysLeft > 1 ? 's' : ''}. Contact your doctor for refill if needed.`,
        });
      }
    }
  });

  // Adherence tip
  if (active.length > 0) {
    insights.push({
      type: 'tip', severity: 'info',
      title: '✅ Adherence Tip',
      message: 'Use a pill organizer and set phone reminders. Taking medications at the same time every day improves outcomes by 30%.',
    });
  }

  return insights;
}

/* ─── Helpers ────────────────────────────────────────────────────────── */
const routeColors: Record<string, string> = {
  oral: '#3b82f6', IV: '#ef4444', IM: '#f97316',
  subcutaneous: '#8b5cf6', topical: '#10b981', inhaled: '#06b6d4',
};
const statusConfig: Record<string, { color: string; icon: typeof CheckCircle2; label: string }> = {
  active: { color: '#10b981', icon: CheckCircle2, label: 'Active' },
  completed: { color: '#6b7280', icon: Clock, label: 'Completed' },
  discontinued: { color: '#ef4444', icon: X, label: 'Discontinued' },
};

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

const frequencyOptions = ['once daily', 'twice daily', 'three times daily', 'every 6 hours', 'every 8 hours', 'as needed'];
const routeOptions = ['oral', 'IV', 'IM', 'subcutaneous', 'topical', 'inhaled'];

/* ─── Component ──────────────────────────────────────────────────────── */
export default function PatientMedications() {
  const { session } = useAuth();
  const uid = session?.user?.id ?? null;

  const [meds, setMeds] = useState<PatientMed[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showAdd, setShowAdd] = useState(false);
  const [showAI, setShowAI] = useState(true);

  // Add form
  const [form, setForm] = useState({
    medication_name: '', dosage: '', frequency: 'once daily', route: 'oral',
    start_date: new Date().toISOString().split('T')[0], end_date: '', instructions: '',
  });
  const [saving, setSaving] = useState(false);

  /* ─── Fetch ─────────────────────────────────────────────────────── */
  const fetchMeds = useCallback(async () => {
    if (!uid) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('patient_medications')
        .select('*')
        .eq('patient_user_id', uid)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setMeds(data ?? []);
    } catch (e: any) {
      console.error(e);
      toast.error('Failed to load medications');
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useEffect(() => { fetchMeds(); }, [fetchMeds]);

  // Realtime
  useEffect(() => {
    if (!uid) return;
    const sub = supabase
      .channel('patient-meds-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'patient_medications', filter: `patient_user_id=eq.${uid}` }, () => fetchMeds())
      .subscribe();
    return () => { sub.unsubscribe(); };
  }, [uid, fetchMeds]);

  /* ─── CRUD ──────────────────────────────────────────────────────── */
  const addMed = async () => {
    if (!uid || !form.medication_name || !form.dosage) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('patient_medications').insert({
        patient_user_id: uid,
        medication_name: form.medication_name,
        dosage: form.dosage,
        frequency: form.frequency,
        route: form.route,
        start_date: form.start_date,
        end_date: form.end_date || null,
        instructions: form.instructions || null,
        status: 'active',
      });
      if (error) throw error;
      toast.success('Medication added');
      setShowAdd(false);
      setForm({ medication_name: '', dosage: '', frequency: 'once daily', route: 'oral', start_date: new Date().toISOString().split('T')[0], end_date: '', instructions: '' });
    } catch (e: any) {
      toast.error(e.message || 'Failed to add');
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (id: string, status: string) => {
    try {
      const { error } = await supabase.from('patient_medications').update({ status }).eq('id', id);
      if (error) throw error;
      toast.success(`Marked as ${status}`);
    } catch (e: any) {
      toast.error(e.message || 'Update failed');
    }
  };

  const deleteMed = async (id: string) => {
    try {
      const { error } = await supabase.from('patient_medications').delete().eq('id', id);
      if (error) throw error;
      toast.success('Medication removed');
    } catch (e: any) {
      toast.error(e.message || 'Delete failed');
    }
  };

  /* ─── Derived ───────────────────────────────────────────────────── */
  const filtered = useMemo(() => {
    return meds.filter(m => {
      if (statusFilter !== 'all' && m.status !== statusFilter) return false;
      if (search && !m.medication_name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [meds, statusFilter, search]);

  const counts = useMemo(() => ({
    active: meds.filter(m => m.status === 'active').length,
    completed: meds.filter(m => m.status === 'completed').length,
    discontinued: meds.filter(m => m.status === 'discontinued').length,
  }), [meds]);

  const insights = useMemo(() => generateMedInsights(meds), [meds]);

  /* ─── Render ────────────────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-20 rounded-2xl skeleton-shimmer" />
        ))}
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">My Medications</h1>
          <p className="text-sm text-muted-foreground">{counts.active} active • {counts.completed} completed • {counts.discontinued} discontinued</p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition"
        >
          <Plus className="h-4 w-4" /> Add Medication
        </button>
      </div>

      {/* AI Insights */}
      {insights.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card-clinical">
          <button onClick={() => setShowAI(!showAI)} className="flex items-center gap-2 w-full text-left">
            <Brain className="h-5 w-5 text-violet-500" />
            <span className="font-semibold text-sm text-foreground flex-1">AI Health Insights</span>
            <span className="text-xs text-muted-foreground">{insights.length} insight{insights.length > 1 ? 's' : ''}</span>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${showAI ? 'rotate-180' : ''}`} />
          </button>
          <AnimatePresence>
            {showAI && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
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

      {/* Add Form */}
      <AnimatePresence>
        {showAdd && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="card-clinical space-y-4">
              <h3 className="font-semibold text-foreground">Add New Medication</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Medication Name *</label>
                  <input value={form.medication_name} onChange={e => setForm(p => ({ ...p, medication_name: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm" placeholder="e.g. Aspirin" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Dosage *</label>
                  <input value={form.dosage} onChange={e => setForm(p => ({ ...p, dosage: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm" placeholder="e.g. 75mg" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Frequency</label>
                  <select value={form.frequency} onChange={e => setForm(p => ({ ...p, frequency: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm">
                    {frequencyOptions.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Route</label>
                  <select value={form.route} onChange={e => setForm(p => ({ ...p, route: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm">
                    {routeOptions.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Start Date</label>
                  <input type="date" value={form.start_date} onChange={e => setForm(p => ({ ...p, start_date: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">End Date</label>
                  <input type="date" value={form.end_date} onChange={e => setForm(p => ({ ...p, end_date: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm" />
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Instructions</label>
                  <input value={form.instructions} onChange={e => setForm(p => ({ ...p, instructions: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm" placeholder="e.g. Take after meals" />
                </div>
              </div>
              <div className="flex gap-3 justify-end">
                <button onClick={() => setShowAdd(false)} className="px-4 py-2 rounded-xl border border-border text-sm text-muted-foreground hover:bg-muted transition">Cancel</button>
                <button onClick={addMed} disabled={saving || !form.medication_name || !form.dosage}
                  className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition">
                  {saving ? 'Saving...' : 'Save Medication'}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search medications..."
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-border bg-background text-sm" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2 rounded-xl border border-border bg-background text-sm">
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
          <option value="discontinued">Discontinued</option>
        </select>
        {(search || statusFilter !== 'all') && (
          <button onClick={() => { setSearch(''); setStatusFilter('all'); }}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <RotateCcw className="h-3 w-3" /> Reset
          </button>
        )}
      </div>

      {/* Medication List */}
      <div className="space-y-3">
        <AnimatePresence mode="popLayout">
          {filtered.length === 0 ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-16">
              <Pill className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-foreground">No medications found</h3>
              <p className="text-sm text-muted-foreground mt-1">Add your first medication to get started</p>
            </motion.div>
          ) : filtered.map(med => {
            const st = statusConfig[med.status] || statusConfig.active;
            const StIcon = st.icon;
            return (
              <motion.div
                key={med.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="card-clinical-hover"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1">
                    <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0"
                      style={{ backgroundColor: `${routeColors[med.route] || '#6b7280'}15` }}>
                      <Pill className="h-5 w-5" style={{ color: routeColors[med.route] || '#6b7280' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-foreground">{med.medication_name}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                          style={{ backgroundColor: `${st.color}15`, color: st.color }}>
                          <StIcon className="h-3 w-3 inline mr-1" />
                          {st.label}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                          style={{ backgroundColor: `${routeColors[med.route] || '#6b7280'}15`, color: routeColors[med.route] || '#6b7280' }}>
                          {med.route.toUpperCase()}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{med.dosage} • {med.frequency}</p>
                      {med.instructions && <p className="text-xs text-muted-foreground mt-1 italic">📋 {med.instructions}</p>}
                      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {fmtDate(med.start_date)}</span>
                        {med.end_date && <span>→ {fmtDate(med.end_date)}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {med.status === 'active' && (
                      <>
                        <button onClick={() => updateStatus(med.id, 'completed')}
                          className="p-2 rounded-lg text-green-600 hover:bg-green-50 transition" title="Mark completed">
                          <CheckCircle2 className="h-4 w-4" />
                        </button>
                        <button onClick={() => updateStatus(med.id, 'discontinued')}
                          className="p-2 rounded-lg text-amber-600 hover:bg-amber-50 transition" title="Discontinue">
                          <X className="h-4 w-4" />
                        </button>
                      </>
                    )}
                    <button onClick={() => deleteMed(med.id)}
                      className="p-2 rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 transition" title="Delete">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
