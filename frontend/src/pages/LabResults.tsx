import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useDebounce } from '@/hooks/useDebounce';
import RiskBadge from '@/components/RiskBadge';
import AnimatedNumber from '@/components/AnimatedNumber';
import SkeletonCard from '@/components/SkeletonCard';
import { LabResult, PatientSummary } from '@/types/database';
import { Search, Filter, RotateCcw, TestTube, AlertTriangle, Plus, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronRight } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface LabResultsFilters {
  patientSearch: string;
  status: 'all' | 'normal' | 'abnormal' | 'critical' | 'pending';
  priority: 'all' | 'routine' | 'urgent' | 'stat';
  dateRange: 'today' | '7days' | '30days' | 'all';
}

interface PatientLabResults {
  patient: PatientSummary;
  results: LabResult[];
  worstStatus: 'normal' | 'abnormal' | 'critical' | 'pending';
}

const statusColors = {
  normal: '#10b981',
  abnormal: '#f97316',
  critical: '#ef4444',
  pending: '#6b7280'
};

const statusBgColors = {
  normal: 'bg-green-50',
  abnormal: 'bg-orange-50',
  critical: 'bg-red-50',
  pending: 'bg-gray-50'
};

const priorityColors = {
  routine: '#3b82f6',
  urgent: '#f97316',
  stat: '#ef4444'
};

function formatDateTime(dateString: string): string {
  const date = new Date(dateString);
  const day = date.getDate().toString().padStart(2, '0');
  const month = date.toLocaleString('en-US', { month: 'short' });
  const year = date.getFullYear();
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${day} ${month} ${year} ${hours}:${minutes}`;
}

function isToday(dateString: string): boolean {
  const date = new Date(dateString);
  const today = new Date();
  return date.toDateString() === today.toDateString();
}

export default function LabResults() {
  const { hasRole } = useAuth();
  const [loading, setLoading] = useState(true);
  const [patientLabResults, setPatientLabResults] = useState<PatientLabResults[]>([]);
  const [patients, setPatients] = useState<PatientSummary[]>([]);
  const [filters, setFilters] = useState<LabResultsFilters>({
    patientSearch: '',
    status: 'all',
    priority: 'all',
    dateRange: 'today'
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedPatients, setExpandedPatients] = useState<Set<string>>(new Set());
  const itemsPerPage = 30;
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    patientId: '',
    testName: '',
    resultValue: '',
    referenceRange: '',
    units: '',
    status: 'normal' as LabResult['status'],
    priority: 'routine' as LabResult['priority'],
  });
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiText, setAiText] = useState('');
  const [aiTarget, setAiTarget] = useState<{ patient: PatientSummary; result: LabResult } | null>(null);

  const debouncedPatientSearch = useDebounce(filters.patientSearch, 300);

  // Fetch initial data
  useEffect(() => {
    fetchLabResults();
    fetchPatients();
  }, []);

  // Realtime subscription
  useEffect(() => {
    const subscription = supabase
      .channel('lab-results-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lab_results' }, () => {
        fetchLabResults();
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const fetchPatients = async () => {
    try {
      const { data, error } = await supabase
        .from('patient_summary')
        .select('*')
        .in('patient_status', ['admitted', 'registered'])
        .order('full_name', { ascending: true });

      if (error) throw error;
      setPatients(data || []);
    } catch (error) {
      console.error('Error fetching patients for lab entry:', error);
    }
  };

  const fetchLabResults = async () => {
    try {
      setLoading(true);
      
      // Fetch lab results
      const { data: labResults, error: labError } = await supabase
        .from('lab_results')
        .select('*')
        .order('resulted_at', { ascending: false });

      if (labError) throw labError;

      // Get unique patient IDs
      const patientIds = [...new Set(labResults?.map(result => result.patient_id) || [])];

      // Fetch patient details
      const { data: patients, error: patientsError } = await supabase
        .from('patient_summary')
        .select('*')
        .in('id', patientIds);

      if (patientsError) throw patientsError;

      // Group results by patient
      const patientMap = new Map<string, PatientLabResults>();
      
      patients?.forEach(patient => {
        patientMap.set(patient.id, {
          patient,
          results: [],
          worstStatus: 'normal'
        });
      });

      labResults?.forEach(result => {
        const patientData = patientMap.get(result.patient_id);
        if (patientData) {
          patientData.results.push(result);
          // Update worst status
          if (result.status === 'critical' || (result.status === 'abnormal' && patientData.worstStatus === 'normal')) {
            patientData.worstStatus = result.status as 'normal' | 'abnormal' | 'critical' | 'pending';
          } else if (result.status === 'abnormal' && patientData.worstStatus === 'normal') {
            patientData.worstStatus = 'abnormal';
          } else if (result.status === 'pending' && patientData.worstStatus === 'normal') {
            patientData.worstStatus = 'pending';
          }
        }
      });

      const groupedResults = Array.from(patientMap.values());
      
      // Auto-expand patients with critical results
      const criticalPatients = new Set<string>();
      groupedResults.forEach(group => {
        if (group.worstStatus === 'critical') {
          criticalPatients.add(group.patient.id);
        }
      });
      setExpandedPatients(criticalPatients);

      setPatientLabResults(groupedResults);
    } catch (error) {
      console.error('Error fetching lab results:', error);
      toast.error('Failed to fetch lab results');
    } finally {
      setLoading(false);
    }
  };

  const filteredResults = useMemo(() => {
    return patientLabResults.filter(group => {
      // Patient search filter
      if (debouncedPatientSearch) {
        const searchLower = debouncedPatientSearch.toLowerCase();
        const matchesName = group.patient.full_name?.toLowerCase().includes(searchLower);
        const matchesMRN = group.patient.mrn?.toLowerCase().includes(searchLower);
        if (!matchesName && !matchesMRN) return false;
      }

      // Status filter
      if (filters.status !== 'all') {
        const hasMatchingStatus = group.results.some(result => result.status === filters.status);
        if (!hasMatchingStatus) return false;
      }

      // Priority filter
      if (filters.priority !== 'all') {
        const hasMatchingPriority = group.results.some(result => result.priority === filters.priority);
        if (!hasMatchingPriority) return false;
      }

      // Date range filter
      const now = new Date();
      const cutoffDate = new Date();
      
      switch (filters.dateRange) {
        case 'today':
          // Already handled by isToday check below
          break;
        case '7days':
          cutoffDate.setDate(now.getDate() - 7);
          break;
        case '30days':
          cutoffDate.setDate(now.getDate() - 30);
          break;
        case 'all':
          return true; // No date filtering needed
      }

      if (filters.dateRange !== 'all') {
        const hasRecentResults = group.results.some(result => {
          const resultDate = new Date(result.resulted_at);
          if (filters.dateRange === 'today') {
            return isToday(result.resulted_at);
          }
          return resultDate >= cutoffDate;
        });
        if (!hasRecentResults) return false;
      }

      return true;
    });
  }, [patientLabResults, debouncedPatientSearch, filters]);

  const paginatedResults = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredResults.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredResults, currentPage]);

  const totalPages = Math.ceil(filteredResults.length / itemsPerPage);

  const summaryCounts = useMemo(() => {
    const todayResults = patientLabResults.flatMap(group => 
      group.results.filter(result => isToday(result.resulted_at))
    );

    return {
      critical: todayResults.filter(r => r.status === 'critical').length,
      abnormal: todayResults.filter(r => r.status === 'abnormal').length,
      normal: todayResults.filter(r => r.status === 'normal').length,
      pending: todayResults.filter(r => r.status === 'pending').length
    };
  }, [patientLabResults]);

  const togglePatientExpansion = (patientId: string) => {
    setExpandedPatients(prev => {
      const newSet = new Set(prev);
      if (newSet.has(patientId)) {
        newSet.delete(patientId);
      } else {
        newSet.add(patientId);
      }
      return newSet;
    });
  };

  const resetFilters = () => {
    setFilters({
      patientSearch: '',
      status: 'all',
      priority: 'all',
      dateRange: 'today'
    });
    setCurrentPage(1);
  };

  const canAddLab = hasRole('admin', 'doctor', 'nurse');
  const canAnalyze = hasRole('admin', 'doctor', 'nurse', 'technician');

  const handleAddLabResult = async () => {
    try {
      if (!addForm.patientId || !addForm.testName || !addForm.resultValue || !addForm.units || !addForm.referenceRange) {
        toast.error('Please fill all required fields');
        return;
      }

      const { error } = await supabase
        .from('lab_results')
        .insert({
          patient_id: addForm.patientId,
          test_name: addForm.testName,
          result_value: addForm.resultValue,
          reference_range: addForm.referenceRange,
          units: addForm.units,
          status: addForm.status,
          priority: addForm.priority,
        });

      if (error) throw error;

      toast.success('Lab result added');
      setIsAddModalOpen(false);
      setAddForm({
        patientId: '',
        testName: '',
        resultValue: '',
        referenceRange: '',
        units: '',
        status: 'normal',
        priority: 'routine',
      });
      fetchLabResults();
    } catch (error) {
      console.error('Error adding lab result:', error);
      toast.error('Failed to add lab result');
    }
  };

  const analyzeWithAI = async (patient: PatientSummary, result: LabResult) => {
    setAiTarget({ patient, result });
    setIsAiModalOpen(true);
    setAiLoading(true);
    setAiText('');
    try {
      const key = import.meta.env.VITE_GROQ_API_KEY as string | undefined;
      if (!key) {
        toast.error('Missing Groq API key (VITE_GROQ_API_KEY)');
        return;
      }

      const prompt = [
        `Patient: ${patient.full_name} (${patient.mrn}), ${patient.gender}, blood ${patient.blood_type}, risk=${patient.risk_level}, status=${patient.patient_status}.`,
        `Location: ${patient.ward_name} bed ${patient.bed_number}, hospital=${patient.hospital_name}.`,
        `Lab: ${result.test_name} = ${result.result_value} ${result.units}. Reference: ${result.reference_range}.`,
        `Lab status=${result.status}, priority=${result.priority}, resulted_at=${result.resulted_at}.`,
      ].join('\n');

      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          max_tokens: 180,
          messages: [
            {
              role: 'system',
              content:
                'You are a clinical decision support assistant. Provide a concise interpretation of the lab result, ' +
                'a likely risk level (low/medium/high/critical) based only on the given info, and 2–3 next-step suggestions ' +
                'for clinician review (no treatment orders). End with: "Decision support only — recommend clinical assessment."'
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
      toast.error('Failed to analyze with AI');
      setAiText('AI analysis failed. Please try again.');
    } finally {
      setAiLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <SkeletonCard className="h-8 w-32" />
          <SkeletonCard className="h-8 w-24" />
        </div>
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <SkeletonCard key={i} className="h-20" />
          ))}
        </div>
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <SkeletonCard key={i} className="h-24" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="p-6 space-y-6"
    >
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Lab Results</h1>
          <p className="text-sm text-gray-600 mt-1">
            <AnimatedNumber value={summaryCounts.critical + summaryCounts.abnormal} /> abnormal results today
          </p>
        </div>
        <Button onClick={() => setIsAddModalOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Lab Result
        </Button>
      </div>

      {/* Summary Pills */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid grid-cols-4 gap-4"
      >
        {Object.entries(summaryCounts).map(([status, count]) => (
          <div
            key={status}
            className={`p-4 rounded-lg border-l-4 ${statusBgColors[status as keyof typeof statusBgColors]}`}
            style={{ borderLeftColor: statusColors[status as keyof typeof statusColors] }}
          >
            <div className="text-sm font-medium text-gray-600 capitalize">{status}</div>
            <div className="text-2xl font-bold text-gray-900">
              <AnimatedNumber value={count} />
            </div>
          </div>
        ))}
      </motion.div>

      {/* Filter Bar */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-white p-4 rounded-lg shadow-sm border space-y-4"
      >
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-700">Filters:</span>
          </div>
          
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search patient name or MRN..."
              value={filters.patientSearch}
              onChange={(e) => setFilters(prev => ({ ...prev, patientSearch: e.target.value }))}
              className="pl-9 pr-3 py-1 border rounded-md text-sm w-64"
            />
          </div>

          <select
            value={filters.status}
            onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value as any }))}
            className="px-3 py-1 border rounded-md text-sm"
          >
            <option value="all">All Status</option>
            <option value="normal">Normal</option>
            <option value="abnormal">Abnormal</option>
            <option value="critical">Critical</option>
            <option value="pending">Pending</option>
          </select>

          <select
            value={filters.priority}
            onChange={(e) => setFilters(prev => ({ ...prev, priority: e.target.value as any }))}
            className="px-3 py-1 border rounded-md text-sm"
          >
            <option value="all">All Priority</option>
            <option value="routine">Routine</option>
            <option value="urgent">Urgent</option>
            <option value="stat">STAT</option>
          </select>

          <select
            value={filters.dateRange}
            onChange={(e) => setFilters(prev => ({ ...prev, dateRange: e.target.value as any }))}
            className="px-3 py-1 border rounded-md text-sm"
          >
            <option value="today">Today</option>
            <option value="7days">Last 7 days</option>
            <option value="30days">Last 30 days</option>
            <option value="all">All time</option>
          </select>

          <button
            onClick={resetFilters}
            className="flex items-center gap-1 px-3 py-1 text-sm text-gray-600 hover:text-gray-800 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Reset
          </button>
        </div>
      </motion.div>

      {/* Lab Results Feed */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="space-y-4"
      >
        <AnimatePresence mode="popLayout">
          {paginatedResults.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center py-12"
            >
              <TestTube className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900">No lab results found</h3>
              <p className="text-gray-600">No results match your current filters</p>
            </motion.div>
          ) : (
            <motion.div
              layout
              initial="hidden"
              animate="visible"
              variants={{
                hidden: { opacity: 0 },
                visible: {
                  opacity: 1,
                  transition: {
                    staggerChildren: 0.05
                  }
                }
              }}
            >
              {paginatedResults.map((group) => (
                <motion.div
                  key={group.patient.id}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="card-clinical"
                >
                  <Collapsible
                    open={expandedPatients.has(group.patient.id)}
                    onOpenChange={() => togglePatientExpansion(group.patient.id)}
                  >
                    <CollapsibleTrigger className="w-full">
                      <div className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors">
                        <div className="flex items-center gap-3">
                          {expandedPatients.has(group.patient.id) ? (
                            <ChevronDown className="w-4 h-4 text-gray-500" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-gray-500" />
                          )}
                          <div>
                            <div className="font-medium text-gray-900">{group.patient.full_name}</div>
                            <div className="text-sm text-gray-600">
                              {group.patient.mrn} • {group.patient.ward} {group.patient.bed && `Bed ${group.patient.bed}`}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-gray-600">{group.results.length} results</span>
                          <RiskBadge level={group.worstStatus} />
                        </div>
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="border-t border-gray-200">
                        <motion.div
                          initial="hidden"
                          animate="visible"
                          variants={{
                            hidden: { opacity: 0 },
                            visible: {
                              opacity: 1,
                              transition: {
                                staggerChildren: 0.02
                              }
                            }
                          }}
                        >
                          {group.results.map((result) => (
                            <motion.div
                              key={result.id}
                              variants={{
                                hidden: { opacity: 0, x: -10 },
                                visible: { opacity: 1, x: 0 }
                              }}
                              className="flex items-center justify-between p-3 hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                            >
                              <div className="flex items-center gap-4 flex-1">
                                <div className="flex-1">
                                  <div className="font-medium text-gray-900">{result.test_name}</div>
                                  <div className="text-sm text-gray-600">
                                    {result.result_value} {result.units} • Ref: {result.reference_range}
                                  </div>
                                </div>
                                <div className="text-sm text-gray-500">
                                  {formatDateTime(result.resulted_at)}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                {canAnalyze && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => analyzeWithAI(group.patient, result)}
                                  >
                                    <Sparkles className="h-3.5 w-3.5 mr-2" />
                                    Analyze
                                  </Button>
                                )}
                                <span
                                  className={`px-2 py-1 rounded text-xs font-medium ${
                                    result.status === 'critical' ? 'bg-red-100 text-red-800 pulse-critical' :
                                    result.status === 'abnormal' ? 'bg-orange-100 text-orange-800' :
                                    result.status === 'normal' ? 'bg-green-100 text-green-800' :
                                    'bg-gray-100 text-gray-800'
                                  }`}
                                >
                                  {result.status.toUpperCase()}
                                </span>
                                <span
                                  className={`px-2 py-1 rounded text-xs font-medium ${
                                    result.priority === 'stat' ? 'bg-red-100 text-red-800' :
                                    result.priority === 'urgent' ? 'bg-orange-100 text-orange-800' :
                                    'bg-blue-100 text-blue-800'
                                  }`}
                                >
                                  {result.priority.toUpperCase()}
                                </span>
                              </div>
                            </motion.div>
                          ))}
                        </motion.div>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Pagination */}
      {totalPages > 1 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="flex items-center justify-between mt-6"
        >
          <button
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            disabled={currentPage === 1}
            className="px-4 py-2 text-sm border rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Previous
          </button>
          
          <span className="text-sm text-gray-600">
            Page {currentPage} of {totalPages}
          </span>
          
          <button
            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
            disabled={currentPage === totalPages}
            className="px-4 py-2 text-sm border rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Next
          </button>
        </motion.div>
      )}

      {/* Add Lab Result Modal */}
      <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Lab Result</DialogTitle>
            <DialogDescription>
              Record a new lab result for a patient.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div>
              <Label htmlFor="patient">Patient</Label>
              <Select
                value={addForm.patientId}
                onValueChange={(value) => setAddForm(prev => ({ ...prev, patientId: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select patient" />
                </SelectTrigger>
                <SelectContent>
                  {patients.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.full_name} ({p.mrn})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="testName">Test Name</Label>
              <Input
                id="testName"
                value={addForm.testName}
                onChange={(e) => setAddForm(prev => ({ ...prev, testName: e.target.value }))}
                placeholder="e.g. Hemoglobin, WBC, Creatinine"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-1">
                <Label htmlFor="resultValue">Result</Label>
                <Input
                  id="resultValue"
                  value={addForm.resultValue}
                  onChange={(e) => setAddForm(prev => ({ ...prev, resultValue: e.target.value }))}
                  placeholder="e.g. 13.2"
                />
              </div>
              <div className="col-span-1">
                <Label htmlFor="units">Units</Label>
                <Input
                  id="units"
                  value={addForm.units}
                  onChange={(e) => setAddForm(prev => ({ ...prev, units: e.target.value }))}
                  placeholder="e.g. g/dL"
                />
              </div>
              <div className="col-span-1">
                <Label htmlFor="status">Status</Label>
                <Select
                  value={addForm.status}
                  onValueChange={(value) => setAddForm(prev => ({ ...prev, status: value as LabResult['status'] }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="abnormal">Abnormal</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="referenceRange">Reference Range</Label>
              <Input
                id="referenceRange"
                value={addForm.referenceRange}
                onChange={(e) => setAddForm(prev => ({ ...prev, referenceRange: e.target.value }))}
                placeholder="e.g. 12–16 g/dL"
              />
            </div>

            <div>
              <Label htmlFor="priority">Priority</Label>
              <Select
                value={addForm.priority}
                onValueChange={(value) => setAddForm(prev => ({ ...prev, priority: value as LabResult['priority'] }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="routine">Routine</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                  <SelectItem value="stat">STAT</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddLabResult}
              disabled={
                !addForm.patientId ||
                !addForm.testName ||
                !addForm.resultValue ||
                !addForm.units ||
                !addForm.referenceRange
              }
            >
              Save Lab Result
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI Analysis Modal */}
      <Dialog open={isAiModalOpen} onOpenChange={(open) => { setIsAiModalOpen(open); if (!open) setAiTarget(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>AI Lab Analysis</DialogTitle>
            <DialogDescription>
              {aiTarget ? `${aiTarget.patient.full_name} • ${aiTarget.result.test_name}` : 'Lab interpretation and risk prediction.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {aiLoading ? (
              <div className="text-sm text-muted-foreground">Analyzing…</div>
            ) : (
              <div className="whitespace-pre-wrap text-sm text-foreground leading-relaxed">
                {aiText || 'No analysis available.'}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAiModalOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}