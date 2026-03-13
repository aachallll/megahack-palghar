import { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { PatientSummary } from '@/types/database';
import { toast } from 'sonner';
import { Plus, Utensils, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface DietOrder {
  id: string;
  patient_id: string;
  order_text: string;
  calories: number | null;
  restrictions: string | null;
  start_date: string;
  end_date: string | null;
  status: 'active' | 'completed' | 'cancelled';
}

interface DietWithPatient {
  patient: PatientSummary;
  diets: DietOrder[];
}

export default function DietManagement() {
  const { hasRole } = useAuth();
  const [loading, setLoading] = useState(true);
  const [patients, setPatients] = useState<PatientSummary[]>([]);
  const [rows, setRows] = useState<DietWithPatient[]>([]);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [form, setForm] = useState({
    patientId: '',
    orderText: '',
    calories: '',
    restrictions: '',
    startDate: new Date().toISOString().split('T')[0],
  });
  const [isAiOpen, setIsAiOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiText, setAiText] = useState('');
  const [aiPatient, setAiPatient] = useState<PatientSummary | null>(null);
  const canEdit = hasRole('admin', 'doctor', 'nurse');

  useEffect(() => {
    fetchPatients();
    fetchDiets();
  }, []);

  const fetchPatients = async () => {
    try {
      const { data, error } = await supabase
        .from('patient_summary')
        .select('*')
        .in('patient_status', ['admitted', 'registered'])
        .order('full_name');
      if (error) throw error;
      setPatients(data || []);
    } catch (e) {
      console.error('Error fetching patients for diet:', e);
    }
  };

  const fetchDiets = async () => {
    try {
      setLoading(true);
      const { data: diets, error: dietError } = await supabase
        .from('diet_orders')
        .select('*')
        .order('start_date', { ascending: false });
      if (dietError) throw dietError;

      const ids = [...new Set((diets || []).map(d => d.patient_id))];
      const { data: pats, error: pErr } = await supabase
        .from('patient_summary')
        .select('*')
        .in('id', ids);
      if (pErr) throw pErr;

      const byId = new Map<string, PatientSummary>();
      (pats || []).forEach(p => byId.set(p.id, p));
      const grouped = new Map<string, DietWithPatient>();
      (diets || []).forEach(d => {
        const p = byId.get(d.patient_id);
        if (!p) return;
        const key = p.id;
        if (!grouped.has(key)) {
          grouped.set(key, { patient: p, diets: [] });
        }
        grouped.get(key)!.diets.push(d as DietOrder);
      });
      setRows(Array.from(grouped.values()));
    } catch (e) {
      console.error('Error fetching diets:', e);
      toast.error('Failed to fetch diet orders');
    } finally {
      setLoading(false);
    }
  };

  const handleAddDiet = async () => {
    try {
      if (!form.patientId || !form.orderText) {
        toast.error('Select patient and diet order');
        return;
      }
      const { error } = await supabase.from('diet_orders').insert({
        patient_id: form.patientId,
        order_text: form.orderText,
        calories: form.calories ? Number(form.calories) : null,
        restrictions: form.restrictions || null,
        start_date: form.startDate,
      });
      if (error) throw error;
      toast.success('Diet order added');
      setIsAddOpen(false);
      setForm({
        patientId: '',
        orderText: '',
        calories: '',
        restrictions: '',
        startDate: new Date().toISOString().split('T')[0],
      });
      fetchDiets();
    } catch (e) {
      console.error('Error adding diet:', e);
      toast.error('Failed to add diet order');
    }
  };

  const activeCounts = useMemo(() => {
    const all = rows.flatMap(r => r.diets);
    return {
      active: all.filter(d => d.status === 'active').length,
      completed: all.filter(d => d.status === 'completed').length,
      cancelled: all.filter(d => d.status === 'cancelled').length,
    };
  }, [rows]);

  const suggestDietWithAI = async (patient: PatientSummary) => {
    setAiPatient(patient);
    setIsAiOpen(true);
    setAiLoading(true);
    setAiText('');
    try {
      const key = import.meta.env.VITE_GROQ_API_KEY as string | undefined;
      if (!key) {
        setAiText('Missing Groq API key (VITE_GROQ_API_KEY).');
        return;
      }

      const content = [
        `Patient: ${patient.full_name} (${patient.mrn}), age ${patient.age}, gender ${patient.gender}, blood type ${patient.blood_type}.`,
        `Status: ${patient.patient_status}, risk level ${patient.risk_level}.`,
        `Location: ${patient.ward_name}, bed ${patient.bed_number}, hospital ${patient.hospital_name}.`,
        `You are a hospital clinical nutrition assistant. Suggest an appropriate ICU diet plan for the next 24–48 hours,`,
        `including calorie range, macro focus (protein/carbs/fats), fluid considerations, and simple food examples.`,
        `Assume common comorbidities for this risk level but do not invent specific diagnoses.`,
        `Do NOT give drug or insulin doses. Emphasise that final decisions belong to the treating team.`,
        `End with: "Decision support only — refer to clinical dietitian and treating physician."`
      ].join(' ');

      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          max_tokens: 220,
          messages: [
            { role: 'system', content: 'You are a clinical dietetics decision support assistant.' },
            { role: 'user', content },
          ],
        }),
      });
      const data = await res.json();
      const text = data?.choices?.[0]?.message?.content ?? '';
      if (!res.ok) throw new Error(text || data?.error?.message || 'Groq error');
      setAiText(text);
    } catch (e) {
      console.error('AI diet suggestion error:', e);
      setAiText('AI diet suggestion failed. Please try again.');
    } finally {
      setAiLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 w-40 bg-muted rounded" />
        <div className="h-32 bg-muted rounded" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="p-6 space-y-6"
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
            <Utensils className="h-5 w-5 text-green-600" />
            Diet Management
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            {activeCounts.active} active diet orders across {rows.length} patients.
          </p>
        </div>
        <Button onClick={() => setIsAddOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Diet Order
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="p-4 rounded-lg border-l-4 bg-green-50 border-green-500">
          <div className="text-sm text-gray-600">Active</div>
          <div className="text-2xl font-bold text-gray-900">{activeCounts.active}</div>
        </div>
        <div className="p-4 rounded-lg border-l-4 bg-blue-50 border-blue-500">
          <div className="text-sm text-gray-600">Completed</div>
          <div className="text-2xl font-bold text-gray-900">{activeCounts.completed}</div>
        </div>
        <div className="p-4 rounded-lg border-l-4 bg-gray-50 border-gray-500">
          <div className="text-sm text-gray-600">Cancelled</div>
          <div className="text-2xl font-bold text-gray-900">{activeCounts.cancelled}</div>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-4"
      >
        <AnimatePresence>
          {rows.length === 0 ? (
            <div className="card-clinical text-center py-12">
              <Utensils className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No diet orders found.</p>
            </div>
          ) : (
            rows.map(row => (
              <motion.div
                key={row.patient.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="card-clinical"
              >
                <div className="flex items-center justify-between p-4 border-b border-border/60">
                  <div>
                    <div className="font-semibold text-foreground">{row.patient.full_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {row.patient.mrn} • {row.patient.ward_name} – Bed {row.patient.bed_number}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>
                      {row.diets.filter(d => d.status === 'active').length} active diets
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => suggestDietWithAI(row.patient)}
                    >
                      AI Suggest Diet
                    </Button>
                  </div>
                </div>
                <div className="divide-y divide-border/60">
                  {row.diets.map(d => (
                    <div key={d.id} className="p-3 flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="font-medium text-foreground">{d.order_text}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-2">
                          <Calendar className="h-3 w-3" />
                          {d.start_date} {d.end_date ? `→ ${d.end_date}` : '(ongoing)'}
                          {d.calories && (
                            <span className="ml-2">{d.calories} kcal/day</span>
                          )}
                        </div>
                        {d.restrictions && (
                          <div className="text-xs text-orange-700 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded">
                            Restrictions: {d.restrictions}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <span
                          className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                          style={{
                            backgroundColor:
                              d.status === 'active'
                                ? 'rgba(34,197,94,0.12)'
                                : d.status === 'completed'
                                ? 'rgba(59,130,246,0.12)'
                                : 'rgba(107,114,128,0.12)',
                            color:
                              d.status === 'active'
                                ? '#16a34a'
                                : d.status === 'completed'
                                ? '#2563eb'
                                : '#6b7280',
                          }}
                        >
                          {d.status.toUpperCase()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </motion.div>

      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Diet Order</DialogTitle>
            <DialogDescription>
              Configure a diet plan for an admitted patient.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Patient</Label>
              <select
                className="mt-1 w-full border rounded px-3 py-2 text-sm bg-background"
                value={form.patientId}
                onChange={(e) => setForm(prev => ({ ...prev, patientId: e.target.value }))}
              >
                <option value="">Select patient</option>
                {patients.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.full_name} ({p.mrn})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Diet order</Label>
              <Input
                value={form.orderText}
                onChange={(e) => setForm(prev => ({ ...prev, orderText: e.target.value }))}
                placeholder="e.g. Cardiac diet, low sodium, fluid restriction 1.5L/day"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Calories (kcal/day)</Label>
                <Input
                  value={form.calories}
                  onChange={(e) => setForm(prev => ({ ...prev, calories: e.target.value }))}
                  placeholder="e.g. 1800"
                />
              </div>
              <div>
                <Label>Start date</Label>
                <Input
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm(prev => ({ ...prev, startDate: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <Label>Restrictions (optional)</Label>
              <Input
                value={form.restrictions}
                onChange={(e) => setForm(prev => ({ ...prev, restrictions: e.target.value }))}
                placeholder="e.g. No dairy, diabetic friendly"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddDiet}
              disabled={!form.patientId || !form.orderText}
            >
              Save Diet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI Diet Suggestion Modal */}
      <Dialog open={isAiOpen} onOpenChange={(open) => { setIsAiOpen(open); if (!open) { setAiPatient(null); setAiText(''); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>AI Diet Suggestion</DialogTitle>
            <DialogDescription>
              {aiPatient ? `Suggested plan for ${aiPatient.full_name} (${aiPatient.mrn})` : 'AI-generated diet support.'}
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            {aiLoading ? (
              <p className="text-sm text-muted-foreground">Generating diet suggestion…</p>
            ) : (
              <div className="whitespace-pre-wrap text-sm leading-relaxed">
                {aiText || 'No suggestion yet.'}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAiOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}

