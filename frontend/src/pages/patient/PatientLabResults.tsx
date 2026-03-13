import { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import {
  TestTube, Plus, Search, RotateCcw, ChevronDown,
  TrendingUp, TrendingDown, Minus, AlertTriangle,
  Info, Brain, ShieldCheck, ArrowUpRight, ArrowDownRight,
  FileText, X, CheckCircle2, Clock, Sparkles
} from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

/* ─── Types ─────────────────────────────────────────────────────────── */
interface LabResult {
  id: string;
  patient_user_id: string;
  test_name: string;
  result_value: string;
  reference_range: string | null;
  units: string | null;
  status: string;
  resulted_at: string;
  notes: string | null;
}

interface AILabInsight {
  type: 'abnormal' | 'trend' | 'recommendation';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
}

/* ─── AI Engine — lab result analysis ──────────────────────────────── */
const REFERENCE_RANGES: Record<string, { low: number; high: number; unit: string; critLow?: number; critHigh?: number }> = {
  'hemoglobin': { low: 12, high: 17, unit: 'g/dL', critLow: 7, critHigh: 20 },
  'hb': { low: 12, high: 17, unit: 'g/dL', critLow: 7, critHigh: 20 },
  'wbc': { low: 4000, high: 11000, unit: '/µL', critLow: 2000, critHigh: 30000 },
  'white blood cell': { low: 4000, high: 11000, unit: '/µL', critLow: 2000, critHigh: 30000 },
  'platelets': { low: 150000, high: 400000, unit: '/µL', critLow: 50000, critHigh: 1000000 },
  'creatinine': { low: 0.6, high: 1.2, unit: 'mg/dL', critHigh: 4 },
  'glucose': { low: 70, high: 100, unit: 'mg/dL', critLow: 40, critHigh: 400 },
  'fasting glucose': { low: 70, high: 100, unit: 'mg/dL', critLow: 40, critHigh: 400 },
  'hba1c': { low: 4, high: 5.7, unit: '%', critHigh: 10 },
  'cholesterol': { low: 0, high: 200, unit: 'mg/dL', critHigh: 300 },
  'total cholesterol': { low: 0, high: 200, unit: 'mg/dL', critHigh: 300 },
  'ldl': { low: 0, high: 100, unit: 'mg/dL', critHigh: 190 },
  'hdl': { low: 40, high: 60, unit: 'mg/dL' },
  'triglycerides': { low: 0, high: 150, unit: 'mg/dL', critHigh: 500 },
  'tsh': { low: 0.4, high: 4.0, unit: 'mIU/L', critHigh: 10 },
  'sodium': { low: 136, high: 145, unit: 'mEq/L', critLow: 120, critHigh: 160 },
  'potassium': { low: 3.5, high: 5.0, unit: 'mEq/L', critLow: 2.5, critHigh: 6.5 },
  'calcium': { low: 8.5, high: 10.5, unit: 'mg/dL', critLow: 6, critHigh: 13 },
  'alt': { low: 7, high: 56, unit: 'U/L', critHigh: 200 },
  'ast': { low: 10, high: 40, unit: 'U/L', critHigh: 200 },
  'bilirubin': { low: 0.1, high: 1.2, unit: 'mg/dL', critHigh: 5 },
  'urea': { low: 7, high: 20, unit: 'mg/dL', critHigh: 100 },
  'bun': { low: 7, high: 20, unit: 'mg/dL', critHigh: 100 },
  'esr': { low: 0, high: 20, unit: 'mm/hr', critHigh: 100 },
  'crp': { low: 0, high: 5, unit: 'mg/L', critHigh: 100 },
  'iron': { low: 60, high: 170, unit: 'µg/dL' },
  'ferritin': { low: 12, high: 300, unit: 'ng/mL' },
  'vitamin d': { low: 30, high: 100, unit: 'ng/mL' },
  'vitamin b12': { low: 200, high: 900, unit: 'pg/mL' },
};

function analyzeLabResult(result: LabResult): { status: 'normal' | 'low' | 'high' | 'critical'; direction: 'up' | 'down' | 'normal' } {
  const val = parseFloat(result.result_value);
  if (isNaN(val)) return { status: 'normal', direction: 'normal' };

  const testKey = result.test_name.toLowerCase();
  const ref = Object.entries(REFERENCE_RANGES).find(([k]) => testKey.includes(k));
  if (!ref) return { status: 'normal', direction: 'normal' };

  const range = ref[1];
  if (range.critLow && val <= range.critLow) return { status: 'critical', direction: 'down' };
  if (range.critHigh && val >= range.critHigh) return { status: 'critical', direction: 'up' };
  if (val < range.low) return { status: 'low', direction: 'down' };
  if (val > range.high) return { status: 'high', direction: 'up' };
  return { status: 'normal', direction: 'normal' };
}

function generateLabInsights(results: LabResult[]): AILabInsight[] {
  const insights: AILabInsight[] = [];
  if (results.length === 0) return insights;

  // Check each result for abnormalities
  const abnormals: { name: string; value: string; status: string }[] = [];
  results.forEach(r => {
    const analysis = analyzeLabResult(r);
    if (analysis.status === 'critical') {
      abnormals.push({ name: r.test_name, value: r.result_value, status: 'critical' });
    } else if (analysis.status === 'high' || analysis.status === 'low') {
      abnormals.push({ name: r.test_name, value: r.result_value, status: analysis.status });
    }
  });

  if (abnormals.some(a => a.status === 'critical')) {
    const criticals = abnormals.filter(a => a.status === 'critical');
    insights.push({
      type: 'abnormal', severity: 'critical',
      title: '🚨 Critical Values Detected',
      message: `${criticals.map(c => `${c.name}: ${c.value}`).join(', ')} — Contact your physician immediately.`,
    });
  }

  if (abnormals.filter(a => a.status !== 'critical').length > 0) {
    const nonCrit = abnormals.filter(a => a.status !== 'critical');
    insights.push({
      type: 'abnormal', severity: 'warning',
      title: '⚠ Abnormal Results',
      message: `${nonCrit.map(c => `${c.name} (${c.status}): ${c.value}`).join(', ')} — Discuss with your doctor at the next visit.`,
    });
  }

  // Trend analysis (if multiple results for same test)
  const testGroups = results.reduce<Record<string, LabResult[]>>((acc, r) => {
    const key = r.test_name.toLowerCase();
    (acc[key] = acc[key] || []).push(r);
    return acc;
  }, {});

  Object.entries(testGroups).forEach(([testName, group]) => {
    if (group.length >= 2) {
      const sorted = [...group].sort((a, b) => new Date(a.resulted_at).getTime() - new Date(b.resulted_at).getTime());
      const first = parseFloat(sorted[0].result_value);
      const last = parseFloat(sorted[sorted.length - 1].result_value);
      if (!isNaN(first) && !isNaN(last) && first !== 0) {
        const changePercent = ((last - first) / first) * 100;
        if (Math.abs(changePercent) > 10) {
          insights.push({
            type: 'trend', severity: Math.abs(changePercent) > 30 ? 'warning' : 'info',
            title: `📊 ${group[0].test_name} Trend`,
            message: `${changePercent > 0 ? 'Increased' : 'Decreased'} ${Math.abs(changePercent).toFixed(1)}% over ${group.length} readings (${first} → ${last}).`,
          });
        }
      }
    }
  });

  // General recommendations
  if (results.length > 0) {
    insights.push({
      type: 'recommendation', severity: 'info',
      title: '🧪 Lab Review Tip',
      message: 'Bring a printed copy of your lab results to your next doctor visit for comprehensive review.',
    });
  }

  return insights;
}

/* ─── Test name suggestions ──────────────────────────────────────────── */
const COMMON_TESTS = [
  'Complete Blood Count (CBC)', 'Hemoglobin', 'WBC', 'Platelets', 'Creatinine',
  'Fasting Glucose', 'HbA1c', 'Total Cholesterol', 'LDL', 'HDL', 'Triglycerides',
  'TSH', 'Sodium', 'Potassium', 'Calcium', 'ALT', 'AST', 'Bilirubin',
  'BUN', 'ESR', 'CRP', 'Iron', 'Ferritin', 'Vitamin D', 'Vitamin B12',
];

/* ─── Helpers ────────────────────────────────────────────────────────── */
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtDateTime(d: string) {
  return new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/* ─── Component ──────────────────────────────────────────────────────── */
export default function PatientLabResults() {
  const { session } = useAuth();
  const uid = session?.user?.id ?? null;

  const [results, setResults] = useState<LabResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [showAI, setShowAI] = useState(true);
  const [saving, setSaving] = useState(false);

  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiText, setAiText] = useState('');
  const [analyzingResult, setAnalyzingResult] = useState<LabResult | null>(null);

  const [form, setForm] = useState({
    test_name: '', result_value: '', reference_range: '', units: '', notes: '',
  });

  /* ─── Fetch ─────────────────────────────────────────────────────── */
  const fetchResults = useCallback(async () => {
    if (!uid) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('patient_lab_results')
        .select('*')
        .eq('patient_user_id', uid)
        .order('resulted_at', { ascending: false });
      if (error) throw error;
      setResults(data ?? []);
    } catch (e: any) {
      toast.error('Failed to load lab results');
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useEffect(() => { fetchResults(); }, [fetchResults]);

  useEffect(() => {
    if (!uid) return;
    const sub = supabase
      .channel('patient-labs-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'patient_lab_results', filter: `patient_user_id=eq.${uid}` }, () => fetchResults())
      .subscribe();
    return () => { sub.unsubscribe(); };
  }, [uid, fetchResults]);

  /* ─── CRUD ──────────────────────────────────────────────────────── */
  const addResult = async () => {
    if (!uid || !form.test_name || !form.result_value) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('patient_lab_results').insert({
        patient_user_id: uid,
        test_name: form.test_name,
        result_value: form.result_value,
        reference_range: form.reference_range || null,
        units: form.units || null,
        status: 'completed',
        notes: form.notes || null,
      });
      if (error) throw error;
      toast.success('Lab result added');
      setShowAdd(false);
      setForm({ test_name: '', result_value: '', reference_range: '', units: '', notes: '' });
    } catch (e: any) {
      toast.error(e.message || 'Failed to add');
    } finally {
      setSaving(false);
    }
  };

  const deleteResult = async (id: string) => {
    try {
      const { error } = await supabase.from('patient_lab_results').delete().eq('id', id);
      if (error) throw error;
      toast.success('Result removed');
    } catch (e: any) {
      toast.error(e.message || 'Delete failed');
    }
  };

  const analyzeWithAI = async (result: LabResult) => {
    setAnalyzingResult(result);
    setAiText('');
    setAiModalOpen(true);
    setAiLoading(true);

    try {
      const key = import.meta.env.VITE_GROQ_API_KEY as string | undefined;
      if (!key) {
        toast.error('Missing Groq API key (VITE_GROQ_API_KEY)');
        setAiModalOpen(false);
        return;
      }

      const prompt = `Lab Result: ${result.test_name} = ${result.result_value} ${result.units || ''}. 
      Reference Range: ${result.reference_range || 'Unknown'}. 
      Analyzed on: ${fmtDateTime(result.resulted_at)}. 
      Patient Notes: ${result.notes || 'None'}.`;

      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          max_tokens: 250,
          messages: [
            {
              role: 'system',
              content:
                'You are an AI health assistant explaining lab results to a patient. Provide a short, easy-to-understand explanation of what the test means, what their specific result indicates, and 1-2 generic lifestyle tips if relevant. Keep it encouraging and end with "Please discuss with your doctor for medical advice."'
            },
            { role: 'user', content: prompt }
          ],
        }),
      });

      const data = await res.json();
      const text = data?.choices?.[0]?.message?.content ?? '';
      if (!res.ok) {
        throw new Error(text || data?.error?.message || 'Groq request failed');
      }
      setAiText(text);
    } catch (e) {
      console.error('AI analysis error:', e);
      toast.error('Failed to get AI analysis');
      setAiText('Analysis failed. Please try again.');
    } finally {
      setAiLoading(false);
    }
  };

  /* ─── Derived ───────────────────────────────────────────────────── */
  const filtered = useMemo(() => {
    if (!search) return results;
    return results.filter(r => r.test_name.toLowerCase().includes(search.toLowerCase()));
  }, [results, search]);

  const insights = useMemo(() => generateLabInsights(results), [results]);

  /* ─── Render ────────────────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(4)].map((_, i) => <div key={i} className="h-20 rounded-2xl skeleton-shimmer" />)}
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">My Lab Reports</h1>
          <p className="text-sm text-muted-foreground">{results.length} result{results.length !== 1 ? 's' : ''} on file</p>
        </div>
        <button onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition">
          <Plus className="h-4 w-4" /> Add Result
        </button>
      </div>

      {/* AI Insights */}
      {insights.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card-clinical">
          <button onClick={() => setShowAI(!showAI)} className="flex items-center gap-2 w-full text-left">
            <Brain className="h-5 w-5 text-violet-500" />
            <span className="font-semibold text-sm text-foreground flex-1">AI Lab Analysis</span>
            <span className="text-xs text-muted-foreground">{insights.length} finding{insights.length > 1 ? 's' : ''}</span>
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

      {/* Add Form */}
      <AnimatePresence>
        {showAdd && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="card-clinical space-y-4">
              <h3 className="font-semibold text-foreground">Add Lab Result</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Test Name *</label>
                  <input value={form.test_name} onChange={e => setForm(p => ({ ...p, test_name: e.target.value }))} list="test-names"
                    className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm" placeholder="e.g. Hemoglobin" />
                  <datalist id="test-names">
                    {COMMON_TESTS.map(t => <option key={t} value={t} />)}
                  </datalist>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Result Value *</label>
                  <input value={form.result_value} onChange={e => setForm(p => ({ ...p, result_value: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm" placeholder="e.g. 14.5" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Reference Range</label>
                  <input value={form.reference_range} onChange={e => setForm(p => ({ ...p, reference_range: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm" placeholder="e.g. 12-17" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Units</label>
                  <input value={form.units} onChange={e => setForm(p => ({ ...p, units: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm" placeholder="e.g. g/dL" />
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Notes</label>
                  <input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm" placeholder="Optional notes" />
                </div>
              </div>
              <div className="flex gap-3 justify-end">
                <button onClick={() => setShowAdd(false)} className="px-4 py-2 rounded-xl border border-border text-sm text-muted-foreground hover:bg-muted transition">Cancel</button>
                <button onClick={addResult} disabled={saving || !form.test_name || !form.result_value}
                  className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition">
                  {saving ? 'Saving...' : 'Save Result'}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Search */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tests..."
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-border bg-background text-sm" />
        </div>
        {search && (
          <button onClick={() => setSearch('')} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <RotateCcw className="h-3 w-3" /> Clear
          </button>
        )}
      </div>

      {/* Results List */}
      <div className="space-y-3">
        <AnimatePresence mode="popLayout">
          {filtered.length === 0 ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-16">
              <TestTube className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-foreground">No lab results</h3>
              <p className="text-sm text-muted-foreground mt-1">Add your first lab result to get AI analysis</p>
            </motion.div>
          ) : filtered.map(result => {
            const analysis = analyzeLabResult(result);
            const isAbnormal = analysis.status !== 'normal';
            return (
              <motion.div key={result.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -20 }}
                className="card-clinical-hover">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1">
                    <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${
                      analysis.status === 'critical' ? 'bg-red-100' :
                      analysis.status === 'high' ? 'bg-amber-100' :
                      analysis.status === 'low' ? 'bg-blue-100' :
                      'bg-green-100'
                    }`}>
                      {analysis.direction === 'up' ? <ArrowUpRight className={`h-5 w-5 ${analysis.status === 'critical' ? 'text-red-600' : 'text-amber-600'}`} /> :
                       analysis.direction === 'down' ? <ArrowDownRight className={`h-5 w-5 ${analysis.status === 'critical' ? 'text-red-600' : 'text-blue-600'}`} /> :
                       <CheckCircle2 className="h-5 w-5 text-green-600" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-foreground">{result.test_name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          analysis.status === 'critical' ? 'bg-red-100 text-red-700' :
                          analysis.status === 'high' ? 'bg-amber-100 text-amber-700' :
                          analysis.status === 'low' ? 'bg-blue-100 text-blue-700' :
                          'bg-green-100 text-green-700'
                        }`}>
                          {analysis.status === 'normal' ? '✓ Normal' :
                           analysis.status === 'critical' ? '⚠ Critical' :
                           analysis.status === 'high' ? '↑ High' : '↓ Low'}
                        </span>
                      </div>
                      <div className="flex items-baseline gap-2 mt-1">
                        <span className={`text-xl font-bold ${isAbnormal ? (analysis.status === 'critical' ? 'text-red-600' : 'text-amber-600') : 'text-foreground'}`}>
                          {result.result_value}
                        </span>
                        {result.units && <span className="text-sm text-muted-foreground">{result.units}</span>}
                      </div>
                      {result.reference_range && (
                        <p className="text-xs text-muted-foreground mt-1">Ref: {result.reference_range} {result.units || ''}</p>
                      )}
                      {result.notes && <p className="text-xs text-muted-foreground mt-1 italic">📝 {result.notes}</p>}
                      <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" /> {fmtDateTime(result.resulted_at)}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <button onClick={() => deleteResult(result.id)}
                      className="p-2 rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 transition" title="Delete">
                      <X className="h-4 w-4" />
                    </button>
                    <button onClick={() => analyzeWithAI(result)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-violet-100 text-violet-700 hover:bg-violet-200 transition"
                      title="Analyze with AI">
                      <Sparkles className="h-3 w-3" /> Analyze
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* AI Modal */}
      <Dialog open={aiModalOpen} onOpenChange={setAiModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-violet-500" />
              AI Result Analysis
            </DialogTitle>
            <DialogDescription>
              Analysis for {analyzingResult?.test_name} ({analyzingResult?.result_value} {analyzingResult?.units})
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            {aiLoading ? (
              <div className="space-y-3">
                <div className="h-4 bg-gray-200 rounded animate-pulse w-3/4"></div>
                <div className="h-4 bg-gray-200 rounded animate-pulse w-full"></div>
                <div className="h-4 bg-gray-200 rounded animate-pulse w-5/6"></div>
                <div className="h-4 bg-gray-200 rounded animate-pulse w-full"></div>
                <div className="h-4 bg-gray-200 rounded animate-pulse w-2/3"></div>
              </div>
            ) : (
              <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed space-y-4">
                {aiText}
              </div>
            )}
          </div>
          
          <div className="flex justify-end pt-4 border-t border-gray-100">
            <Button variant="outline" onClick={() => setAiModalOpen(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
