export type UserRole = 'admin' | 'doctor' | 'nurse' | 'technician' | 'receptionist' | 'patient';
export type PatientStatus = 'admitted' | 'discharged' | 'transferred' | 'deceased';
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical';
export type AlertStatus = 'active' | 'acknowledged' | 'resolved';
export type BedStatus = 'available' | 'occupied' | 'maintenance' | 'reserved';

export interface AppUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  department: string;
  specialization: string | null;
  is_active: boolean;
}

export interface Hospital {
  id: string;
  name: string;
  code: string;
  city: string;
  bed_capacity: number;
  icu_capacity: number;
  operational_status: string;
}

export interface Ward {
  id: string;
  hospital_id: string;
  name: string;
  code: string;
  type: string;
  floor_number: number;
  bed_capacity: number;
  current_occupancy: number;
  status: string;
  description?: string;
}

export interface Bed {
  id: string;
  ward_id: string;
  bed_number: string;
  room_number: string;
  bed_type: string;
  status: BedStatus;
  equipment_level: string;
  has_monitor: boolean;
  has_ventilator: boolean;
  has_infusion_pump: boolean;
}

export interface Patient {
  id: string;
  mrn: string;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  gender: string;
  blood_type: string;
  ward_id: string;
  bed_id: string;
  attending_physician_id: string;
  primary_nurse_id: string;
  diagnosis: string;
  patient_status: PatientStatus;
  risk_level: RiskLevel;
  admission_date: string;
}

export interface Vital {
  id: string;
  patient_id: string;
  recorded_by: string;
  timestamp: string;
  heart_rate: number | null;
  blood_pressure_systolic: number | null;
  blood_pressure_diastolic: number | null;
  temperature: number | null;
  respiratory_rate: number | null;
  oxygen_saturation: number | null;
  pain_level: number | null;
  blood_glucose: number | null;
  etco2: number | null;
  map: number | null;
  pulse: number | null;
  aw_rr: number | null;
  notes: string | null;
  measurement_method: string | null;
}

export interface Alert {
  id: string;
  patient_id: string;
  type: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  vital_id: string | null;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  status: AlertStatus;
  escalation_level: number;
  auto_generated: boolean;
  source: string;
  created_at: string;
}

export interface Medication {
  id: string;
  patient_id: string;
  name: string;
  dosage: string;
  frequency: string;
  route: string;
  start_date: string;
  end_date: string | null;
  prescribed_by: string;
  status: string;
}

export interface LabResult {
  id: string;
  patient_id: string;
  test_name: string;
  result_value: string;
  reference_range: string;
  units: string;
  status: string;
  priority: string;
  resulted_at: string;
}

export interface DeviceReading {
  id: string;
  device_id: string;
  device_type: string;
  patient_id: string;
  bed_id: string;
  reading_type: string;
  reading_value: number;
  units: string;
  timestamp: string;
  battery_level: number;
  signal_strength: number;
}

export interface PatientSummary {
  id: string;
  mrn: string;
  full_name: string;
  age: number;
  gender: string;
  blood_type: string;
  patient_status: PatientStatus;
  risk_level: RiskLevel;
  ward_name: string;
  bed_number: string;
  hospital_name: string;
}

export interface WardOccupancy {
  id: string;
  name: string;
  type: string;
  bed_capacity: number;
  occupied_beds: number;
  available_beds: number;
  occupancy_rate: number;
  hospital_name: string;
}

export interface ActiveAlert {
  id: string;
  patient_id: string;
  type: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  status: AlertStatus;
  created_at: string;
  escalation_level: number;
  source: string;
  patient_name: string;
  mrn: string;
  acknowledged_by_name: string | null;
  acknowledged_at: string | null;
}

export interface AuditLog {
  id: string;
  user_id: string;
  action: string;
  resource_type: string;
  resource_id: string;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  timestamp: string;
}
