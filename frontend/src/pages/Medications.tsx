import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useDebounce } from '@/hooks/useDebounce';
import RiskBadge from '@/components/RiskBadge';
import AnimatedNumber from '@/components/AnimatedNumber';
import SkeletonCard from '@/components/SkeletonCard';
import { Medication, PatientSummary, AppUser } from '@/types/database';
import { Search, Filter, RotateCcw, Pill, Plus, X, Calendar, User, Edit2, Trash2 } from 'lucide-react';
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
  DialogTrigger,
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

interface MedicationsFilters {
  patientSearch: string;
  status: 'all' | 'active' | 'discontinued' | 'completed';
  route: string | 'all';
}

interface PatientMedications {
  patient: PatientSummary;
  medications: Medication[];
  activeCount: number;
}

interface PrescribeFormData {
  patient_id: string;
  name: string;
  dosage: string;
  frequency: string;
  route: string;
  start_date: string;
  end_date: string;
  notes: string;
}

const routeColors = {
  oral: '#3b82f6',
  IV: '#ef4444',
  IM: '#f97316',
  subcutaneous: '#8b5cf6',
  topical: '#10b981',
  inhaled: '#06b6d4'
};

const statusColors = {
  active: '#10b981',
  discontinued: '#ef4444',
  completed: '#6b7280'
};

const frequencyOptions = [
  'once daily',
  'twice daily',
  'three times daily',
  'four times daily',
  'every 6 hours',
  'every 8 hours',
  'as needed',
  'continuous infusion'
];

const routeOptions = [
  'oral',
  'IV',
  'IM',
  'subcutaneous',
  'topical',
  'inhaled'
];

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const day = date.getDate().toString().padStart(2, '0');
  const month = date.toLocaleString('en-US', { month: 'short' });
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;
}

export default function Medications() {
  const { user, hasRole } = useAuth();
  const [loading, setLoading] = useState(true);
  const [patientMedications, setPatientMedications] = useState<PatientMedications[]>([]);
  const [filters, setFilters] = useState<MedicationsFilters>({
    patientSearch: '',
    status: 'all',
    route: 'all'
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedPatients, setExpandedPatients] = useState<Set<string>>(new Set());
  const [prescribeModalOpen, setPrescribeModalOpen] = useState(false);
  const [discontinueModalOpen, setDiscontinueModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [selectedMedication, setSelectedMedication] = useState<Medication | null>(null);
  const [patients, setPatients] = useState<PatientSummary[]>([]);
  const [prescribers, setPrescribers] = useState<AppUser[]>([]);
  const [prescribeForm, setPrescribeForm] = useState<PrescribeFormData>({
    patient_id: '',
    name: '',
    dosage: '',
    frequency: '',
    route: '',
    start_date: new Date().toISOString().split('T')[0],
    end_date: '',
    notes: ''
  });
  const itemsPerPage = 30;

  const debouncedPatientSearch = useDebounce(filters.patientSearch, 300);

  // Fetch initial data
  useEffect(() => {
    fetchMedications();
    fetchPatients();
    fetchPrescribers();
  }, []);

  // Realtime subscription
  useEffect(() => {
    const subscription = supabase
      .channel('medications-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'medications' }, () => {
        fetchMedications();
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const fetchMedications = async () => {
    try {
      setLoading(true);
      
      // Fetch medications
      const { data: medications, error: medsError } = await supabase
        .from('medications')
        .select('*')
        .order('start_date', { ascending: false });

      if (medsError) throw medsError;

      // Get unique patient IDs
      const patientIds = [...new Set(medications?.map(med => med.patient_id) || [])];

      // Fetch patient details
      const { data: patients, error: patientsError } = await supabase
        .from('patient_summary')
        .select('*')
        .in('id', patientIds);

      if (patientsError) throw patientsError;

      // Group medications by patient
      const patientMap = new Map<string, PatientMedications>();
      
      patients?.forEach(patient => {
        patientMap.set(patient.id, {
          patient,
          medications: [],
          activeCount: 0
        });
      });

      medications?.forEach(medication => {
        const patientData = patientMap.get(medication.patient_id);
        if (patientData) {
          patientData.medications.push(medication);
          if (medication.status === 'active') {
            patientData.activeCount++;
          }
        }
      });

      const groupedResults = Array.from(patientMap.values());
      
      // Auto-expand patients with active medications
      const activePatients = new Set<string>();
      groupedResults.forEach(group => {
        if (group.activeCount > 0) {
          activePatients.add(group.patient.id);
        }
      });
      setExpandedPatients(activePatients);

      setPatientMedications(groupedResults);
    } catch (error) {
      console.error('Error fetching medications:', error);
      toast.error('Failed to fetch medications');
    } finally {
      setLoading(false);
    }
  };

  const fetchPatients = async () => {
    try {
      const { data, error } = await supabase
        .from('patient_summary')
        .select('*')
        .in('patient_status', ['admitted', 'registered'])
        .order('full_name');

      if (error) throw error;
      setPatients(data || []);
    } catch (error) {
      console.error('Error fetching patients:', error);
    }
  };

  const fetchPrescribers = async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .in('role', ['doctor', 'admin'])
        .order('name');

      if (error) throw error;
      setPrescribers(data || []);
    } catch (error) {
      console.error('Error fetching prescribers:', error);
    }
  };

  const prescribeMedication = async () => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('medications')
        .insert({
          ...prescribeForm,
          status: 'active',
          prescribed_by: user.id
        });

      if (error) throw error;
      toast.success('Medication prescribed successfully');
      setPrescribeModalOpen(false);
      resetPrescribeForm();
    } catch (error) {
      console.error('Error prescribing medication:', error);
      toast.error('Failed to prescribe medication');
    }
  };

  const discontinueMedication = async () => {
    if (!selectedMedication || !user) return;

    try {
      const { error } = await supabase
        .from('medications')
        .update({ status: 'discontinued' })
        .eq('id', selectedMedication.id);

      if (error) throw error;
      toast.success('Medication discontinued');
      setDiscontinueModalOpen(false);
      setSelectedMedication(null);
    } catch (error) {
      console.error('Error discontinuing medication:', error);
      toast.error('Failed to discontinue medication');
    }
  };

  const handleEditClick = (medication: Medication) => {
    setSelectedMedication(medication);
    setPrescribeForm({
      patient_id: medication.patient_id,
      name: medication.name,
      dosage: medication.dosage,
      frequency: medication.frequency,
      route: medication.route,
      start_date: medication.start_date,
      end_date: medication.end_date || '',
      notes: '' // notes are not present in Medication type directly
    });
    setEditModalOpen(true);
  };

  const editMedication = async () => {
    if (!selectedMedication || !user) return;

    try {
      const { error } = await supabase
        .from('medications')
        .update({
          name: prescribeForm.name,
          dosage: prescribeForm.dosage,
          frequency: prescribeForm.frequency,
          route: prescribeForm.route,
          start_date: prescribeForm.start_date,
          end_date: prescribeForm.end_date || null
        } as any)
        .eq('id', selectedMedication.id);

      if (error) throw error;
      toast.success('Medication updated successfully');
      setEditModalOpen(false);
      setSelectedMedication(null);
      resetPrescribeForm();
      fetchMedications();
    } catch (error) {
      console.error('Error updating medication:', error);
      toast.error('Failed to update medication');
    }
  };

  const deleteMedication = async () => {
    if (!selectedMedication || !user) return;

    try {
      const { error } = await supabase
        .from('medications')
        .delete()
        .eq('id', selectedMedication.id);

      if (error) throw error;
      toast.success('Medication deleted');
      setDeleteModalOpen(false);
      setSelectedMedication(null);
      fetchMedications();
    } catch (error) {
      console.error('Error deleting medication:', error);
      toast.error('Failed to delete medication');
    }
  };

  const resetPrescribeForm = () => {
    setPrescribeForm({
      patient_id: '',
      name: '',
      dosage: '',
      frequency: '',
      route: '',
      start_date: new Date().toISOString().split('T')[0],
      end_date: '',
      notes: ''
    });
  };

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
      route: 'all'
    });
    setCurrentPage(1);
  };

  const filteredResults = useMemo(() => {
    return patientMedications.filter(group => {
      // Patient search filter
      if (debouncedPatientSearch) {
        const searchLower = debouncedPatientSearch.toLowerCase();
        const matchesName = group.patient.full_name?.toLowerCase().includes(searchLower);
        const matchesMRN = group.patient.mrn?.toLowerCase().includes(searchLower);
        if (!matchesName && !matchesMRN) return false;
      }

      // Status filter
      if (filters.status !== 'all') {
        const hasMatchingStatus = group.medications.some(med => med.status === filters.status);
        if (!hasMatchingStatus) return false;
      }

      // Route filter
      if (filters.route !== 'all') {
        const hasMatchingRoute = group.medications.some(med => med.route === filters.route);
        if (!hasMatchingRoute) return false;
      }

      return true;
    });
  }, [patientMedications, debouncedPatientSearch, filters]);

  const paginatedResults = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredResults.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredResults, currentPage]);

  const totalPages = Math.ceil(filteredResults.length / itemsPerPage);

  const summaryCounts = useMemo(() => {
    const allMeds = patientMedications.flatMap(group => group.medications);
    return {
      active: allMeds.filter(med => med.status === 'active').length,
      discontinued: allMeds.filter(med => med.status === 'discontinued').length,
      completed: allMeds.filter(med => med.status === 'completed').length
    };
  }, [patientMedications]);

  const getPrescriberName = (prescribedById: string) => {
    const prescriber = prescribers.find(p => p.id === prescribedById);
    return prescriber?.name || 'Unknown';
  };

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <SkeletonCard className="h-8 w-32" />
          <SkeletonCard className="h-8 w-24" />
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
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
          <h1 className="text-2xl font-semibold text-gray-900">Medications</h1>
          <p className="text-sm text-gray-600 mt-1">
            <AnimatedNumber value={summaryCounts.active} /> active medications
          </p>
        </div>
        
        {hasRole('doctor', 'admin') && (
          <Dialog open={prescribeModalOpen} onOpenChange={setPrescribeModalOpen}>
            <DialogTrigger asChild>
              <Button className="flex items-center gap-2">
                <Plus className="w-4 h-4" />
                Prescribe Medication
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Prescribe Medication</DialogTitle>
                <DialogDescription>
                  Fill in the medication details for the patient.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="patient" className="text-right">
                    Patient
                  </Label>
                  <Select
                    value={prescribeForm.patient_id}
                    onValueChange={(value) => setPrescribeForm(prev => ({ ...prev, patient_id: value }))}
                  >
                    <SelectTrigger className="col-span-3">
                      <SelectValue placeholder="Select patient" />
                    </SelectTrigger>
                    <SelectContent>
                      {patients.map(patient => (
                        <SelectItem key={patient.id} value={patient.id}>
                          {patient.full_name} ({patient.mrn})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="name" className="text-right">
                    Medication Name
                  </Label>
                  <Input
                    id="name"
                    value={prescribeForm.name}
                    onChange={(e) => setPrescribeForm(prev => ({ ...prev, name: e.target.value }))}
                    className="col-span-3"
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="dosage" className="text-right">
                    Dosage
                  </Label>
                  <Input
                    id="dosage"
                    value={prescribeForm.dosage}
                    onChange={(e) => setPrescribeForm(prev => ({ ...prev, dosage: e.target.value }))}
                    className="col-span-3"
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="frequency" className="text-right">
                    Frequency
                  </Label>
                  <Select
                    value={prescribeForm.frequency}
                    onValueChange={(value) => setPrescribeForm(prev => ({ ...prev, frequency: value }))}
                  >
                    <SelectTrigger className="col-span-3">
                      <SelectValue placeholder="Select frequency" />
                    </SelectTrigger>
                    <SelectContent>
                      {frequencyOptions.map(freq => (
                        <SelectItem key={freq} value={freq}>
                          {freq}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="route" className="text-right">
                    Route
                  </Label>
                  <Select
                    value={prescribeForm.route}
                    onValueChange={(value) => setPrescribeForm(prev => ({ ...prev, route: value }))}
                  >
                    <SelectTrigger className="col-span-3">
                      <SelectValue placeholder="Select route" />
                    </SelectTrigger>
                    <SelectContent>
                      {routeOptions.map(route => (
                        <SelectItem key={route} value={route}>
                          {route}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="start_date" className="text-right">
                    Start Date
                  </Label>
                  <Input
                    id="start_date"
                    type="date"
                    value={prescribeForm.start_date}
                    onChange={(e) => setPrescribeForm(prev => ({ ...prev, start_date: e.target.value }))}
                    className="col-span-3"
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="end_date" className="text-right">
                    End Date
                  </Label>
                  <Input
                    id="end_date"
                    type="date"
                    value={prescribeForm.end_date}
                    onChange={(e) => setPrescribeForm(prev => ({ ...prev, end_date: e.target.value }))}
                    className="col-span-3"
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="notes" className="text-right">
                    Diagnosis
                  </Label>
                  <Input
                    id="notes"
                    value={prescribeForm.notes}
                    onChange={(e) => setPrescribeForm(prev => ({ ...prev, notes: e.target.value }))}
                    className="col-span-3"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={prescribeMedication}
                  disabled={!prescribeForm.patient_id || !prescribeForm.name || !prescribeForm.dosage || !prescribeForm.frequency || !prescribeForm.route}
                >
                  Prescribe
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Summary Pills */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid grid-cols-3 gap-4"
      >
        <div className="p-4 rounded-lg border-l-4 bg-blue-50" style={{ borderLeftColor: statusColors.active }}>
          <div className="text-sm font-medium text-gray-600">Active</div>
          <div className="text-2xl font-bold text-gray-900">
            <AnimatedNumber value={summaryCounts.active} />
          </div>
        </div>
        <div className="p-4 rounded-lg border-l-4 bg-red-50" style={{ borderLeftColor: statusColors.discontinued }}>
          <div className="text-sm font-medium text-gray-600">Discontinued</div>
          <div className="text-2xl font-bold text-gray-900">
            <AnimatedNumber value={summaryCounts.discontinued} />
          </div>
        </div>
        <div className="p-4 rounded-lg border-l-4 bg-gray-50" style={{ borderLeftColor: statusColors.completed }}>
          <div className="text-sm font-medium text-gray-600">Completed</div>
          <div className="text-2xl font-bold text-gray-900">
            <AnimatedNumber value={summaryCounts.completed} />
          </div>
        </div>
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
            <option value="active">Active</option>
            <option value="discontinued">Discontinued</option>
            <option value="completed">Completed</option>
          </select>

          <select
            value={filters.route}
            onChange={(e) => setFilters(prev => ({ ...prev, route: e.target.value }))}
            className="px-3 py-1 border rounded-md text-sm"
          >
            <option value="all">All Routes</option>
            {routeOptions.map(route => (
              <option key={route} value={route}>{route}</option>
            ))}
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

      {/* Medications Feed */}
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
              <Pill className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900">No medications found</h3>
              <p className="text-gray-600">No medications match your current filters</p>
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
                              {group.patient.mrn} • {group.patient.ward_name} {group.patient.bed_number && `Bed ${group.patient.bed_number}`}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-gray-600">{group.medications.length} medications</span>
                          {group.activeCount > 0 && (
                            <RiskBadge level="medium" label={`${group.activeCount} active`} />
                          )}
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
                          {group.medications.map((medication) => (
                            <motion.div
                              key={medication.id}
                              variants={{
                                hidden: { opacity: 0, x: -10 },
                                visible: { opacity: 1, x: 0 }
                              }}
                              className="flex items-center justify-between p-3 hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                            >
                              <div className="flex items-center gap-4 flex-1">
                                <div className="flex-1">
                                  <div className="font-medium text-gray-900">{medication.name}</div>
                                  <div className="text-sm text-gray-600">
                                    {medication.dosage} • {medication.frequency}
                                  </div>
                                  <div className="text-xs text-gray-500 mt-1">
                                    <Calendar className="w-3 h-3 inline mr-1" />
                                    {formatDate(medication.start_date)} - {medication.end_date ? formatDate(medication.end_date) : 'Ongoing'}
                                    <User className="w-3 h-3 inline ml-2 mr-1" />
                                    {getPrescriberName(medication.prescribed_by)}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <span
                                  className="px-2 py-1 rounded text-xs font-medium"
                                  style={{
                                    backgroundColor: `${routeColors[medication.route as keyof typeof routeColors]}20`,
                                    color: routeColors[medication.route as keyof typeof routeColors]
                                  }}
                                >
                                  {medication.route.toUpperCase()}
                                </span>
                                <span
                                  className="px-2 py-1 rounded text-xs font-medium"
                                  style={{
                                    backgroundColor: `${statusColors[medication.status as keyof typeof statusColors]}20`,
                                    color: statusColors[medication.status as keyof typeof statusColors]
                                  }}
                                >
                                  {medication.status.toUpperCase()}
                                </span>
                                {hasRole('doctor', 'admin') && (
                                  <div className="flex items-center gap-2">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleEditClick(medication)}
                                      className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-2"
                                      title="Edit Medication"
                                    >
                                      <Edit2 className="w-4 h-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        setSelectedMedication(medication);
                                        setDeleteModalOpen(true);
                                      }}
                                      className="text-red-600 hover:text-red-700 hover:bg-red-50 px-2"
                                      title="Delete Medication"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                    {medication.status === 'active' && (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => {
                                          setSelectedMedication(medication);
                                          setDiscontinueModalOpen(true);
                                        }}
                                        className="text-red-600 hover:text-red-700"
                                      >
                                        <X className="w-3 h-3 mr-1" />
                                        Discontinue
                                      </Button>
                                    )}
                                  </div>
                                )}
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

      {/* Discontinue Modal */}
      <Dialog open={discontinueModalOpen} onOpenChange={setDiscontinueModalOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Discontinue Medication</DialogTitle>
            <DialogDescription>
              Are you sure you want to discontinue this medication?
            </DialogDescription>
          </DialogHeader>
          {selectedMedication && (
            <div className="py-4 space-y-2">
              <div className="text-sm">
                <span className="font-medium">Medication:</span> {selectedMedication.name}
              </div>
              <div className="text-sm">
                <span className="font-medium">Patient:</span> {patientMedications.find(g => g.medications.some(m => m.id === selectedMedication.id))?.patient.full_name}
              </div>
              <div className="text-sm">
                <span className="font-medium">Dosage:</span> {selectedMedication.dosage}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDiscontinueModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={discontinueMedication}>
              Discontinue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Edit Medication Modal */}
      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit Medication</DialogTitle>
            <DialogDescription>
              Update the medication details for the patient.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-name" className="text-right">
                Medication Name
              </Label>
              <Input
                id="edit-name"
                value={prescribeForm.name}
                onChange={(e) => setPrescribeForm(prev => ({ ...prev, name: e.target.value }))}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-dosage" className="text-right">
                Dosage
              </Label>
              <Input
                id="edit-dosage"
                value={prescribeForm.dosage}
                onChange={(e) => setPrescribeForm(prev => ({ ...prev, dosage: e.target.value }))}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-frequency" className="text-right">
                Frequency
              </Label>
              <Select
                value={prescribeForm.frequency}
                onValueChange={(value) => setPrescribeForm(prev => ({ ...prev, frequency: value }))}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Select frequency" />
                </SelectTrigger>
                <SelectContent>
                  {frequencyOptions.map(freq => (
                    <SelectItem key={freq} value={freq}>
                      {freq}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-route" className="text-right">
                Route
              </Label>
              <Select
                value={prescribeForm.route}
                onValueChange={(value) => setPrescribeForm(prev => ({ ...prev, route: value }))}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Select route" />
                </SelectTrigger>
                <SelectContent>
                  {routeOptions.map(route => (
                    <SelectItem key={route} value={route}>
                      {route}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-start_date" className="text-right">
                Start Date
              </Label>
              <Input
                id="edit-start_date"
                type="date"
                value={prescribeForm.start_date}
                onChange={(e) => setPrescribeForm(prev => ({ ...prev, start_date: e.target.value }))}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-end_date" className="text-right">
                End Date
              </Label>
              <Input
                id="edit-end_date"
                type="date"
                value={prescribeForm.end_date}
                onChange={(e) => setPrescribeForm(prev => ({ ...prev, end_date: e.target.value }))}
                className="col-span-3"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={editMedication}>
              Update
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Modal */}
      <Dialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Delete Medication</DialogTitle>
            <DialogDescription>
              Are you sure you want to permanently delete this medication record? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setDeleteModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={deleteMedication}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}