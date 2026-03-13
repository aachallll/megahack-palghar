import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useDebounce } from '@/hooks/useDebounce';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import type { PatientSummary, Ward, Bed, AppUser } from '@/types/database';
import type { PatientStatus, RiskLevel } from '@/types/database';

import RiskBadge from '@/components/RiskBadge';
import SkeletonCard from '@/components/SkeletonCard';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
  RotateCcw,
  ArrowUpDown,
} from 'lucide-react';

interface Filters {
  search: string;
  status: PatientStatus | 'all';
  risk: RiskLevel | 'all';
  ward: string;
}

interface SortConfig {
  key: keyof PatientSummary;
  direction: 'asc' | 'desc';
}

export default function Patients() {
  const navigate = useNavigate();
  const { user, hasRole } = useAuth();
  
  const [patients, setPatients] = useState<PatientSummary[]>([]);
  const [wards, setWards] = useState<Ward[]>([]);
  const [beds, setBeds] = useState<Bed[]>([]);
  const [doctors, setDoctors] = useState<AppUser[]>([]);
  const [nurses, setNurses] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(20);
  
  const [filters, setFilters] = useState<Filters>({
    search: '',
    status: 'all',
    risk: 'all',
    ward: 'all',
  });
  
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    key: 'full_name',
    direction: 'asc',
  });
  
  const [isAdmitModalOpen, setIsAdmitModalOpen] = useState(false);
  const [isDischargeModalOpen, setIsDischargeModalOpen] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<PatientSummary | null>(null);
  
  const debouncedSearch = useDebounce(filters.search, 300);
  
  // Admit form state
  const [admitForm, setAdmitForm] = useState({
    firstName: '',
    lastName: '',
    dateOfBirth: '',
    gender: '',
    bloodType: '',
    wardId: '',
    bedId: '',
    doctorId: '',
    nurseId: '',
    diagnosis: '',
  });

  // Fetch initial data
  useEffect(() => {
    fetchPatients();
    fetchWards();
    fetchDoctors();
    fetchNurses();
    
    // Subscribe to realtime changes
    const subscription = supabase
      .channel('patients-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'patients' }, () => {
        fetchPatients();
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const fetchPatients = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('patient_summary')
        .select('*')
        .order('full_name', { ascending: true });

      if (error) throw error;
      setPatients(data || []);
    } catch (error) {
      console.error('Error fetching patients:', error);
      toast.error('Failed to fetch patients');
    } finally {
      setLoading(false);
    }
  };

  const fetchWards = async () => {
    try {
      const { data, error } = await supabase
        .from('wards')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;
      setWards(data || []);
    } catch (error) {
      console.error('Error fetching wards:', error);
    }
  };

  const fetchBedsByWard = async (wardId: string) => {
    try {
      const { data, error } = await supabase
        .from('beds')
        .select('*')
        .eq('ward_id', wardId)
        .eq('status', 'available')
        .order('bed_number', { ascending: true });

      if (error) throw error;
      setBeds(data || []);
    } catch (error) {
      console.error('Error fetching beds:', error);
    }
  };

  const fetchDoctors = async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('role', 'doctor')
        .order('full_name', { ascending: true });

      if (error) throw error;
      setDoctors(data || []);
    } catch (error) {
      console.error('Error fetching doctors:', error);
    }
  };

  const fetchNurses = async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('role', 'nurse')
        .order('full_name', { ascending: true });

      if (error) throw error;
      setNurses(data || []);
    } catch (error) {
      console.error('Error fetching nurses:', error);
    }
  };

  // Filter and sort patients
  const filteredAndSortedPatients = useMemo(() => {
    const filtered = patients.filter(patient => {
      const matchesSearch = debouncedSearch === '' || 
        patient.full_name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        patient.mrn.toLowerCase().includes(debouncedSearch.toLowerCase());
      
      const matchesStatus = filters.status === 'all' || patient.patient_status === filters.status;
      const matchesRisk = filters.risk === 'all' || patient.risk_level === filters.risk;
      const matchesWard = filters.ward === 'all' || patient.ward_name === filters.ward;

      return matchesSearch && matchesStatus && matchesRisk && matchesWard;
    });

    // Sort patients
    filtered.sort((a, b) => {
      const aValue = a[sortConfig.key];
      const bValue = b[sortConfig.key];
      
      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [patients, debouncedSearch, filters, sortConfig]);

  // Pagination
  const totalPages = Math.ceil(filteredAndSortedPatients.length / itemsPerPage);
  const paginatedPatients = filteredAndSortedPatients.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const admittedCount = patients.filter(p => p.patient_status === 'admitted').length;

  const handleSort = (key: keyof PatientSummary) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const resetFilters = () => {
    setFilters({
      search: '',
      status: 'all',
      risk: 'all',
      ward: 'all',
    });
    setCurrentPage(1);
  };

  const handleAdmitPatient = async () => {
    try {
      const mrn = `MRN-${Date.now()}`;
      const fullName = `${admitForm.firstName} ${admitForm.lastName}`;
      
      // Insert patient
      const { data: patientData, error: patientError } = await supabase
        .from('patients')
        .insert({
          mrn,
          first_name: admitForm.firstName,
          last_name: admitForm.lastName,
          full_name: fullName,
          date_of_birth: admitForm.dateOfBirth,
          gender: admitForm.gender,
          blood_type: admitForm.bloodType,
          ward_id: admitForm.wardId,
          bed_id: admitForm.bedId,
          attending_physician_id: admitForm.doctorId,
          primary_nurse_id: admitForm.nurseId,
          diagnosis: admitForm.diagnosis,
          patient_status: 'admitted',
          admission_date: new Date().toISOString(),
        })
        .select()
        .single();

      if (patientError) throw patientError;

      // Update bed status
      const { error: bedError } = await supabase
        .from('beds')
        .update({ status: 'occupied' })
        .eq('id', admitForm.bedId);

      if (bedError) throw bedError;

      toast.success('Patient admitted successfully');
      setIsAdmitModalOpen(false);
      resetAdmitForm();
      fetchPatients();
    } catch (error) {
      console.error('Error admitting patient:', error);
      toast.error('Failed to admit patient');
    }
  };

  const handleDischargePatient = async () => {
    if (!selectedPatient) return;

    try {
      // First, get the patient's bed_id from the patients table
      const { data: patientData, error: fetchError } = await supabase
        .from('patients')
        .select('bed_id')
        .eq('id', selectedPatient.id)
        .single();

      if (fetchError) throw fetchError;

      // Update patient status
      const { error: patientError } = await supabase
        .from('patients')
        .update({ patient_status: 'discharged' })
        .eq('id', selectedPatient.id);

      if (patientError) throw patientError;

      // Update bed status
      const { error: bedError } = await supabase
        .from('beds')
        .update({ status: 'available' })
        .eq('id', patientData?.bed_id);

      if (bedError) throw bedError;

      toast.success('Patient discharged successfully');
      setIsDischargeModalOpen(false);
      setSelectedPatient(null);
      fetchPatients();
    } catch (error) {
      console.error('Error discharging patient:', error);
      toast.error('Failed to discharge patient');
    }
  };

  const resetAdmitForm = () => {
    setAdmitForm({
      firstName: '',
      lastName: '',
      dateOfBirth: '',
      gender: '',
      bloodType: '',
      wardId: '',
      bedId: '',
      doctorId: '',
      nurseId: '',
      diagnosis: '',
    });
    setBeds([]);
  };

  const canAdmit = hasRole('admin', 'doctor', 'nurse');
  const canDischarge = hasRole('admin', 'doctor');

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6"
    >
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Patients</h1>
          <p className="text-sm text-muted-foreground">
            {admittedCount} patients currently admitted
          </p>
        </div>
        {canAdmit && (
          <Button onClick={() => setIsAdmitModalOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Patient
          </Button>
        )}
      </div>

      {/* Search and Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or MRN..."
            value={filters.search}
            onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
            className="pl-10"
          />
        </div>
        
        <Select
          value={filters.status}
          onValueChange={(value) => setFilters(prev => ({ ...prev, status: value as PatientStatus | 'all' }))}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="admitted">Admitted</SelectItem>
            <SelectItem value="discharged">Discharged</SelectItem>
            <SelectItem value="transferred">Transferred</SelectItem>
            <SelectItem value="deceased">Deceased</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={filters.risk}
          onValueChange={(value) => setFilters(prev => ({ ...prev, risk: value as RiskLevel | 'all' }))}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Risk" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Risk</SelectItem>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={filters.ward}
          onValueChange={(value) => setFilters(prev => ({ ...prev, ward: value }))}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Wards" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Wards</SelectItem>
            {wards.map(ward => (
              <SelectItem key={ward.id} value={ward.name}>{ward.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button variant="outline" onClick={resetFilters}>
          <RotateCcw className="h-4 w-4 mr-2" />
          Reset
        </Button>
      </div>

      {/* Patient List */}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden md:block">
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="cursor-pointer" onClick={() => handleSort('full_name')}>
                      <div className="flex items-center">
                        Name
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                      </div>
                    </TableHead>
                    <TableHead className="cursor-pointer" onClick={() => handleSort('mrn')}>
                      <div className="flex items-center">
                        MRN
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                      </div>
                    </TableHead>
                    <TableHead className="cursor-pointer" onClick={() => handleSort('age')}>
                      <div className="flex items-center">
                        Age
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                      </div>
                    </TableHead>
                    <TableHead className="cursor-pointer" onClick={() => handleSort('ward_name')}>
                      <div className="flex items-center">
                        Ward
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                      </div>
                    </TableHead>
                    <TableHead className="cursor-pointer" onClick={() => handleSort('bed_number')}>
                      <div className="flex items-center">
                        Bed
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                      </div>
                    </TableHead>
                    <TableHead className="cursor-pointer" onClick={() => handleSort('risk_level')}>
                      <div className="flex items-center">
                        Risk
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                      </div>
                    </TableHead>
                    <TableHead className="cursor-pointer" onClick={() => handleSort('patient_status')}>
                      <div className="flex items-center">
                        Status
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                      </div>
                    </TableHead>

                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <AnimatePresence>
                    {paginatedPatients.map((patient) => (
                      <motion.tr
                        key={patient.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => navigate(`/dashboard/telemetry/${patient.id}`)}
                      >
                        <TableCell className="font-medium">{patient.full_name}</TableCell>
                        <TableCell>{patient.mrn}</TableCell>
                        <TableCell>{patient.age}</TableCell>
                        <TableCell>{patient.ward_name}</TableCell>
                        <TableCell>{patient.bed_number}</TableCell>
                        <TableCell>
                          <RiskBadge level={patient.risk_level} />
                        </TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            patient.patient_status === 'admitted' ? 'bg-green-100 text-green-800' :
                            patient.patient_status === 'discharged' ? 'bg-gray-100 text-gray-800' :
                            patient.patient_status === 'transferred' ? 'bg-blue-100 text-blue-800' :
                            'bg-red-100 text-red-800'
                          }`}>
                            {patient.patient_status}
                          </span>
                        </TableCell>

                        <TableCell>
                          <div className="flex gap-2">
                            {canDischarge && patient.patient_status === 'admitted' && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedPatient(patient);
                                  setIsDischargeModalOpen(true);
                                }}
                              >
                                Discharge
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden">
            <motion.div
              className="grid gap-4"
              initial="hidden"
              animate="visible"
              variants={{
                hidden: { opacity: 0 },
                visible: {
                  opacity: 1,
                  transition: {
                    staggerChildren: 0.1,
                  },
                },
              }}
            >
              {paginatedPatients.map((patient) => (
                <motion.div
                  key={patient.id}
                  variants={{
                    hidden: { opacity: 0, y: 20 },
                    visible: { opacity: 1, y: 0 },
                  }}
                  className="card-clinical card-clinical-hover cursor-pointer"
                  onClick={() => navigate(`/dashboard/telemetry/${patient.id}`)}
                >
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h3 className="font-semibold text-foreground">{patient.full_name}</h3>
                      <p className="text-sm text-muted-foreground">{patient.mrn}</p>
                    </div>
                    <RiskBadge level={patient.risk_level} />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-muted-foreground">Age:</span>
                      <span className="ml-2 font-medium">{patient.age}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Ward:</span>
                      <span className="ml-2 font-medium">{patient.ward_name}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Bed:</span>
                      <span className="ml-2 font-medium">{patient.bed_number}</span>
                    </div>

                  </div>
                  
                  <div className="mt-3 flex justify-between items-center">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      patient.patient_status === 'admitted' ? 'bg-green-100 text-green-800' :
                      patient.patient_status === 'discharged' ? 'bg-gray-100 text-gray-800' :
                      patient.patient_status === 'transferred' ? 'bg-blue-100 text-blue-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {patient.patient_status}
                    </span>
                    
                    {canDischarge && patient.patient_status === 'admitted' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedPatient(patient);
                          setIsDischargeModalOpen(true);
                        }}
                      >
                        Discharge
                      </Button>
                    )}
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </div>

          {/* Empty State */}
          {paginatedPatients.length === 0 && (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-4">No patients found</p>
              {canAdmit && (
                <Button onClick={() => setIsAdmitModalOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add First Patient
                </Button>
              )}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                Page {currentPage} of {totalPages}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Admit Patient Modal */}
      <Dialog open={isAdmitModalOpen} onOpenChange={setIsAdmitModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Patient</DialogTitle>
            <DialogDescription>
              Fill in the patient details to add and admit a new patient.
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="firstName">First Name</Label>
                <Input
                  id="firstName"
                  value={admitForm.firstName}
                  onChange={(e) => setAdmitForm(prev => ({ ...prev, firstName: e.target.value }))}
                  placeholder="Enter first name"
                />
              </div>
              <div>
                <Label htmlFor="lastName">Last Name</Label>
                <Input
                  id="lastName"
                  value={admitForm.lastName}
                  onChange={(e) => setAdmitForm(prev => ({ ...prev, lastName: e.target.value }))}
                  placeholder="Enter last name"
                />
              </div>
            </div>
            
            <div>
              <Label htmlFor="dateOfBirth">Date of Birth</Label>
              <Input
                id="dateOfBirth"
                type="date"
                value={admitForm.dateOfBirth}
                onChange={(e) => setAdmitForm(prev => ({ ...prev, dateOfBirth: e.target.value }))}
              />
            </div>
            
            <div>
              <Label htmlFor="gender">Gender</Label>
              <Select
                value={admitForm.gender}
                onValueChange={(value) => setAdmitForm(prev => ({ ...prev, gender: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select gender" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label htmlFor="bloodType">Blood Type</Label>
              <Select
                value={admitForm.bloodType}
                onValueChange={(value) => setAdmitForm(prev => ({ ...prev, bloodType: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select blood type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="A+">A+</SelectItem>
                  <SelectItem value="A-">A-</SelectItem>
                  <SelectItem value="B+">B+</SelectItem>
                  <SelectItem value="B-">B-</SelectItem>
                  <SelectItem value="AB+">AB+</SelectItem>
                  <SelectItem value="AB-">AB-</SelectItem>
                  <SelectItem value="O+">O+</SelectItem>
                  <SelectItem value="O-">O-</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label htmlFor="ward">Ward</Label>
              <Select
                value={admitForm.wardId}
                onValueChange={(value) => {
                  setAdmitForm(prev => ({ ...prev, wardId: value, bedId: '' }));
                  fetchBedsByWard(value);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select ward" />
                </SelectTrigger>
                <SelectContent>
                  {wards.map(ward => (
                    <SelectItem key={ward.id} value={ward.id}>{ward.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label htmlFor="bed">Bed</Label>
              <Select
                value={admitForm.bedId}
                onValueChange={(value) => setAdmitForm(prev => ({ ...prev, bedId: value }))}
                disabled={!admitForm.wardId}
              >
                <SelectTrigger>
                  <SelectValue placeholder={admitForm.wardId ? "Select bed" : "Select ward first"} />
                </SelectTrigger>
                <SelectContent>
                  {beds.map(bed => (
                    <SelectItem key={bed.id} value={bed.id}>Bed {bed.bed_number}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label htmlFor="doctor">Attending Physician</Label>
              <Select
                value={admitForm.doctorId}
                onValueChange={(value) => setAdmitForm(prev => ({ ...prev, doctorId: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select doctor" />
                </SelectTrigger>
                <SelectContent>
                  {doctors.map(doctor => (
                    <SelectItem key={doctor.id} value={doctor.id}>{doctor.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label htmlFor="nurse">Primary Nurse</Label>
              <Select
                value={admitForm.nurseId}
                onValueChange={(value) => setAdmitForm(prev => ({ ...prev, nurseId: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select nurse" />
                </SelectTrigger>
                <SelectContent>
                  {nurses.map(nurse => (
                    <SelectItem key={nurse.id} value={nurse.id}>{nurse.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label htmlFor="diagnosis">Diagnosis</Label>
              <Textarea
                id="diagnosis"
                value={admitForm.diagnosis}
                onChange={(e) => setAdmitForm(prev => ({ ...prev, diagnosis: e.target.value }))}
                placeholder="Enter diagnosis"
                rows={3}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAdmitModalOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleAdmitPatient}
              disabled={!admitForm.firstName || !admitForm.lastName || !admitForm.dateOfBirth || 
                       !admitForm.gender || !admitForm.bloodType || !admitForm.wardId || 
                       !admitForm.bedId || !admitForm.doctorId || !admitForm.nurseId}
            >
              Add Patient
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Discharge Modal */}
      <Dialog open={isDischargeModalOpen} onOpenChange={setIsDischargeModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Discharge Patient</DialogTitle>
            <DialogDescription>
              Are you sure you want to discharge this patient?
            </DialogDescription>
          </DialogHeader>
          
          {selectedPatient && (
            <div className="py-4">
              <p className="font-medium">{selectedPatient.full_name}</p>
              <p className="text-sm text-muted-foreground">MRN: {selectedPatient.mrn}</p>
              <p className="text-sm text-muted-foreground">Ward: {selectedPatient.ward_name} - Bed {selectedPatient.bed_number}</p>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDischargeModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDischargePatient}>
              Discharge Patient
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}