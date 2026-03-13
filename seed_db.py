"""
Prahari ICU — Complete Database Seeder
======================================
Seeds ALL tables so the entire app is usable out of the box:
  hospitals → wards → beds → users → patients → vitals → alerts → medications → lab_results

Run:  python seed_db.py
"""

import os
import sys
import random
import requests
import uuid
from datetime import datetime, timedelta, timezone

# Fix Windows terminal encoding for emoji/unicode
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

# ─── Configuration ────────────────────────────────────────────────────────────
SUPABASE_URL = "https://myafqtraqsdqiepwhtzf.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15YWZxdHJhcXNkcWllcHdodHpmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzIzNjE4NCwiZXhwIjoyMDg4ODEyMTg0fQ.25j0uRDL8KcIIapoP07YISSql3kyNQPniy92x3W-vh8"

headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation"
}

# ─── Fixed IDs (must match backend simulation) ────────────────────────────────
PATIENT_1_ID = "aaaaaaaa-0000-0000-0000-000000000001"
PATIENT_2_ID = "aaaaaaaa-0000-0000-0000-000000000002"
SYSTEM_USER_ID = "98205de9-2fdf-4c84-9efc-1ba4dff923ae"

# ─── Helper ───────────────────────────────────────────────────────────────────
def post(table, data):
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    response = requests.post(url, headers=headers, json=data)
    if response.status_code not in (200, 201):
        print(f"  ⚠ Error inserting into {table}: {response.text[:200]}")
        return None
    return response.json()

def delete_all(table):
    """Delete all rows from a table (for re-seeding)."""
    url = f"{SUPABASE_URL}/rest/v1/{table}?id=neq.00000000-0000-0000-0000-000000000000"
    response = requests.delete(url, headers={
        **headers,
        "Prefer": "return=minimal"
    })
    return response.status_code in (200, 204)

def time_ago(minutes):
    return (datetime.now(timezone.utc) - timedelta(minutes=minutes)).isoformat()

def uid():
    return str(uuid.uuid4())


# ─── Seed Functions ───────────────────────────────────────────────────────────

def seed():
    print("=" * 60)
    print("  Prahari ICU — Complete Database Seeder")
    print("=" * 60)

    # ─── Step 0: Clean existing data (order matters for FK constraints) ─────
    print("\n🗑  Clearing existing data...")
    for table in ["lab_results", "medications", "alerts", "vitals", "patients", "beds", "wards", "hospitals"]:
        delete_all(table)
        print(f"   Cleared {table}")
    # Don't delete users to avoid breaking auth

    # ─── Step 1: Hospital ──────────────────────────────────────────────────
    print("\n🏥 Creating hospital...")
    hospital_id = uid()
    hospital = {
        "id": hospital_id,
        "name": "Prahari Medical Center",
        "code": "PMC-01",
        "city": "Palghar",
        "bed_capacity": 50,
        "icu_capacity": 10,
        "operational_status": "active"
    }
    h_data = post("hospitals", hospital)
    if not h_data:
        print("  ✖ Failed to create hospital. Aborting.")
        return
    hospital_id = h_data[0]["id"]
    print(f"   ✔ {hospital['name']}")

    # ─── Step 2: Wards ─────────────────────────────────────────────────────
    print("\n🏢 Creating wards...")
    ward_a_id = uid()
    ward_b_id = uid()
    wards = [
        {
            "id": ward_a_id,
            "hospital_id": hospital_id,
            "name": "ICU Ward A",
            "code": "ICU-A",
            "type": "icu",
            "floor_number": 2,
            "bed_capacity": 5,
            "current_occupancy": 2,
            "status": "operational"
        },
        {
            "id": ward_b_id,
            "hospital_id": hospital_id,
            "name": "ICU Ward B",
            "code": "ICU-B",
            "type": "icu",
            "floor_number": 2,
            "bed_capacity": 5,
            "current_occupancy": 2,
            "status": "operational"
        }
    ]
    w_data = post("wards", wards)
    if not w_data:
        print("  ✖ Failed to create wards.")
        return
    ward_a_id = w_data[0]["id"]
    ward_b_id = w_data[1]["id"]
    print(f"   ✔ ICU Ward A (id: {ward_a_id[:8]})")
    print(f"   ✔ ICU Ward B (id: {ward_b_id[:8]})")

    # ─── Step 3: Beds ──────────────────────────────────────────────────────
    print("\n🛏  Creating beds...")
    bed_ids = {}
    all_beds = []
    for ward_id, ward_code in [(ward_a_id, "ICU-A"), (ward_b_id, "ICU-B")]:
        for i in range(1, 6):
            bed_id = uid()
            bed_key = f"{ward_code}-{i:02d}"
            bed_ids[bed_key] = bed_id
            all_beds.append({
                "id": bed_id,
                "ward_id": ward_id,
                "bed_number": bed_key,
                "room_number": f"2{i:02d}",
                "bed_type": "standard" if i <= 3 else "isolation",
                "status": "available",
                "equipment_level": "advanced",
                "has_monitor": True,
                "has_ventilator": i % 2 == 0,
                "has_infusion_pump": True
            })
    post("beds", all_beds)
    print(f"   ✔ {len(all_beds)} beds created")

    # ─── Step 4: Users ─────────────────────────────────────────────────────
    # The users table has a FK to auth.users, so we can only use IDs that exist
    # in the auth system. Query existing users; fall back to SYSTEM_USER_ID.
    print("\n[Users] Querying existing users...")

    # Ensure System Admin row exists (this ID is known to exist in auth.users)
    url = f"{SUPABASE_URL}/rest/v1/users"
    resp = requests.post(url, headers={**headers, "Prefer": "return=representation,resolution=merge-duplicates"}, json={
        "id": SYSTEM_USER_ID,
        "name": "System Admin",
        "full_name": "System Admin",
        "email": "admin@prahari.com",
        "role": "admin",
        "department": "IT",
        "specialization": None,
        "is_active": True
    })
    if resp.status_code in (200, 201):
        print(f"   + System Admin (admin)")
    else:
        print(f"   ! System Admin: {resp.text[:120]}")

    # Query all existing users to find doctors/nurses
    resp_users = requests.get(f"{SUPABASE_URL}/rest/v1/users?select=id,name,role&is_active=eq.true", headers=headers)
    existing_users = resp_users.json() if resp_users.status_code == 200 else []
    print(f"   Found {len(existing_users)} existing users in database")

    # Find best doctor and nurse IDs, fallback to SYSTEM_USER_ID
    doctor_id = SYSTEM_USER_ID
    nurse_id = SYSTEM_USER_ID
    nurse2_id = SYSTEM_USER_ID
    for u in existing_users:
        if u.get("role") == "doctor" and doctor_id == SYSTEM_USER_ID:
            doctor_id = u["id"]
            print(f"   Using doctor: {u.get('name', 'unknown')} ({u['id'][:8]})")
        elif u.get("role") == "nurse":
            if nurse_id == SYSTEM_USER_ID:
                nurse_id = u["id"]
                print(f"   Using nurse: {u.get('name', 'unknown')} ({u['id'][:8]})")
            elif nurse2_id == SYSTEM_USER_ID:
                nurse2_id = u["id"]
                print(f"   Using nurse2: {u.get('name', 'unknown')} ({u['id'][:8]})")

    if doctor_id == SYSTEM_USER_ID:
        print("   (No doctor found — using System Admin as attending physician)")
    if nurse_id == SYSTEM_USER_ID:
        print("   (No nurse found — using System Admin as primary nurse)")

    # ─── Step 5: Patients (must match backend simulation IDs!) ─────────────
    print("\n🧑‍⚕️ Creating patients...")
    patients = [
        {
            "id": PATIENT_1_ID,
            "mrn": "PMC-2025-001",
            "first_name": "Rajesh",
            "last_name": "Sharma",
            "date_of_birth": "1968-03-15",
            "gender": "male",
            "blood_type": "B+",
            "ward_id": ward_a_id,
            "bed_id": bed_ids["ICU-A-01"],
            "attending_physician_id": doctor_id,
            "primary_nurse_id": nurse_id,
            "diagnosis": "Post-CABG recovery, stable hemodynamics",
            "patient_status": "admitted",
            "risk_level": "low",
            "admission_date": time_ago(60 * 24 * 3),  # 3 days ago
        },
        {
            "id": PATIENT_2_ID,
            "mrn": "PMC-2025-002",
            "first_name": "Meera",
            "last_name": "Patel",
            "date_of_birth": "1975-11-22",
            "gender": "female",
            "blood_type": "A-",
            "ward_id": ward_a_id,
            "bed_id": bed_ids["ICU-A-02"],
            "attending_physician_id": doctor_id,
            "primary_nurse_id": nurse_id,
            "diagnosis": "Sepsis secondary to pneumonia, hemodynamic instability",
            "patient_status": "admitted",
            "risk_level": "critical",
            "admission_date": time_ago(60 * 24 * 1),  # 1 day ago
        },
        {
            "id": uid(),
            "mrn": "PMC-2025-003",
            "first_name": "Anita",
            "last_name": "Desai",
            "date_of_birth": "1982-07-08",
            "gender": "female",
            "blood_type": "O+",
            "ward_id": ward_b_id,
            "bed_id": bed_ids["ICU-B-01"],
            "attending_physician_id": doctor_id,
            "primary_nurse_id": nurse2_id,
            "diagnosis": "Acute respiratory distress syndrome (ARDS)",
            "patient_status": "admitted",
            "risk_level": "high",
            "admission_date": time_ago(60 * 24 * 2),
        },
        {
            "id": uid(),
            "mrn": "PMC-2025-004",
            "first_name": "Vikram",
            "last_name": "Singh",
            "date_of_birth": "1955-01-30",
            "gender": "male",
            "blood_type": "AB+",
            "ward_id": ward_b_id,
            "bed_id": bed_ids["ICU-B-02"],
            "attending_physician_id": doctor_id,
            "primary_nurse_id": nurse2_id,
            "diagnosis": "Diabetic ketoacidosis, recovering",
            "patient_status": "admitted",
            "risk_level": "medium",
            "admission_date": time_ago(60 * 24 * 5),
        },
    ]
    p_data = post("patients", patients)
    if not p_data:
        print("  ✖ Failed to create patients.")
        return
    for p in patients:
        print(f"   ✔ {p['first_name']} {p['last_name']} (MRN: {p['mrn']}, risk: {p['risk_level']})")

    # Update bed status to occupied
    for p in patients:
        requests.patch(
            f"{SUPABASE_URL}/rest/v1/beds?id=eq.{p['bed_id']}",
            headers=headers,
            json={"status": "occupied"}
        )

    # ─── Step 6: Historical Vitals (last 2 hours for Patient 1 & 2) ────────
    print("\n📊 Creating historical vitals...")
    now = datetime.now(timezone.utc)
    vitals_batch = []

    for patient_idx, pid in enumerate([PATIENT_1_ID, PATIENT_2_ID, patients[2]["id"], patients[3]["id"]]):
        for i in range(60):  # 60 readings over ~20 min intervals
            t = now - timedelta(seconds=20 * (60 - i))
            if patient_idx == 0:  # Stable patient
                hr = 78 + random.gauss(0, 3)
                sbp = 112 + random.gauss(0, 5)
                dbp = 74 + random.gauss(0, 3)
                rr = 17 + random.gauss(0, 1)
                temp = 37.2 + random.gauss(0, 0.1)
                spo2 = 97 + random.gauss(0, 0.5)
                etco2 = 38 + random.gauss(0, 1)
                map_v = 86 + random.gauss(0, 3)
            elif patient_idx == 1:  # Hemodynamic (deteriorating)
                hr = 115 + i * 0.3 + random.gauss(0, 4)
                sbp = 92 - i * 0.2 + random.gauss(0, 5)
                dbp = 58 - i * 0.1 + random.gauss(0, 3)
                rr = 24 + i * 0.1 + random.gauss(0, 1.5)
                temp = 37.8 + i * 0.005 + random.gauss(0, 0.1)
                spo2 = 92 - i * 0.05 + random.gauss(0, 0.8)
                etco2 = 48 + i * 0.1 + random.gauss(0, 1.5)
                map_v = 68 - i * 0.2 + random.gauss(0, 3)
            elif patient_idx == 2:  # ARDS patient
                hr = 105 + i * 0.2 + random.gauss(0, 3)
                sbp = 118 + random.gauss(0, 6)
                dbp = 72 + random.gauss(0, 3)
                rr = 28 + i * 0.15 + random.gauss(0, 2)
                temp = 38.3 + random.gauss(0, 0.15)
                spo2 = 90 - i * 0.03 + random.gauss(0, 1)
                etco2 = 50 + i * 0.1 + random.gauss(0, 2)
                map_v = 78 + random.gauss(0, 4)
            else:  # DKA recovering
                hr = 95 - i * 0.1 + random.gauss(0, 3)
                sbp = 125 + i * 0.05 + random.gauss(0, 4)
                dbp = 78 + random.gauss(0, 3)
                rr = 20 - i * 0.02 + random.gauss(0, 1)
                temp = 37.4 + random.gauss(0, 0.1)
                spo2 = 96 + i * 0.01 + random.gauss(0, 0.5)
                etco2 = 36 + random.gauss(0, 1)
                map_v = 88 + random.gauss(0, 3)

            vitals_batch.append({
                "patient_id": pid,
                "heart_rate": round(max(30, min(220, hr))),
                "blood_pressure_systolic": round(max(70, min(220, sbp))),
                "blood_pressure_diastolic": round(max(40, min(130, dbp))),
                "respiratory_rate": round(max(8, min(50, rr))),
                "temperature": round(max(35, min(42, temp)), 1),
                "oxygen_saturation": round(max(70, min(100, spo2))),
                "etco2": round(max(10, min(80, etco2))),
                "map": round(max(30, min(150, map_v))),
                "pulse": round(max(30, min(220, hr + random.gauss(0, 2)))),
                "aw_rr": round(max(8, min(50, rr + random.gauss(0, 1)))),
                "pain_level": random.randint(1, 5),
                "blood_glucose": random.randint(100, 200),
                "measurement_method": "automated",
                "recorded_by": SYSTEM_USER_ID,
                "timestamp": t.isoformat(),
            })

    # Insert in chunks of 100
    for i in range(0, len(vitals_batch), 100):
        chunk = vitals_batch[i:i + 100]
        post("vitals", chunk)
    print(f"   ✔ {len(vitals_batch)} vitals created for 4 patients")

    # ─── Step 7: Alerts ────────────────────────────────────────────────────
    print("\n🔔 Creating alerts...")
    alerts = [
        {
            "patient_id": PATIENT_2_ID,
            "type": "tachycardia",
            "severity": "high",
            "title": "⚠ AI: Hemodynamic Instability",
            "message": "HR rising while BP dropping — indicates possible circulatory compromise.\n\n[AI Decision Support Only — physician assessment required]",
            "auto_generated": True,
            "source": "system",
            "status": "active",
            "escalation_level": 2,
        },
        {
            "patient_id": PATIENT_2_ID,
            "type": "hypotension",
            "severity": "critical",
            "title": "⚠ Systolic BP Below 90 mmHg",
            "message": "Patient Meera Patel's systolic blood pressure has dropped below 90 mmHg. Consider vasopressor support.",
            "auto_generated": True,
            "source": "device",
            "status": "active",
            "escalation_level": 3,
        },
        {
            "patient_id": patients[2]["id"],
            "type": "desaturation",
            "severity": "high",
            "title": "⚠ SpO2 Declining",
            "message": "Oxygen saturation trending downward. Currently at 89%. Consider adjusting ventilator settings.",
            "auto_generated": True,
            "source": "system",
            "status": "active",
            "escalation_level": 2,
        },
        {
            "patient_id": PATIENT_1_ID,
            "type": "system",
            "severity": "low",
            "title": "Routine vitals recorded",
            "message": "All vitals within normal parameters for the last 4 hours.",
            "auto_generated": True,
            "source": "system",
            "status": "acknowledged",
            "escalation_level": 0,
        },
        {
            "patient_id": patients[3]["id"],
            "type": "glucose",
            "severity": "medium",
            "title": "Blood Glucose Elevated",
            "message": "Blood glucose at 245 mg/dL. Insulin drip may need adjustment.",
            "auto_generated": False,
            "source": "device",
            "status": "active",
            "escalation_level": 1,
        },
    ]
    post("alerts", alerts)
    print(f"   ✔ {len(alerts)} alerts created")

    # ─── Step 8: Medications ───────────────────────────────────────────────
    print("\n💊 Creating medications...")
    medications = [
        # Patient 1 — Post-CABG
        {"patient_id": PATIENT_1_ID, "name": "Aspirin", "dosage": "81 mg", "frequency": "Once daily", "route": "Oral", "start_date": time_ago(60*24*3), "end_date": None, "prescribed_by": doctor_id, "status": "active"},
        {"patient_id": PATIENT_1_ID, "name": "Atorvastatin", "dosage": "40 mg", "frequency": "Once daily at bedtime", "route": "Oral", "start_date": time_ago(60*24*3), "end_date": None, "prescribed_by": doctor_id, "status": "active"},
        {"patient_id": PATIENT_1_ID, "name": "Metoprolol", "dosage": "25 mg", "frequency": "Twice daily", "route": "Oral", "start_date": time_ago(60*24*3), "end_date": None, "prescribed_by": doctor_id, "status": "active"},
        {"patient_id": PATIENT_1_ID, "name": "Enoxaparin", "dosage": "40 mg", "frequency": "Once daily", "route": "Subcutaneous", "start_date": time_ago(60*24*3), "end_date": time_ago(60*24*1), "prescribed_by": doctor_id, "status": "completed"},

        # Patient 2 — Sepsis
        {"patient_id": PATIENT_2_ID, "name": "Meropenem", "dosage": "1 g", "frequency": "Every 8 hours", "route": "IV", "start_date": time_ago(60*24*1), "end_date": None, "prescribed_by": doctor_id, "status": "active"},
        {"patient_id": PATIENT_2_ID, "name": "Norepinephrine", "dosage": "0.1 mcg/kg/min", "frequency": "Continuous infusion", "route": "IV", "start_date": time_ago(60*24*1), "end_date": None, "prescribed_by": doctor_id, "status": "active"},
        {"patient_id": PATIENT_2_ID, "name": "Hydrocortisone", "dosage": "50 mg", "frequency": "Every 6 hours", "route": "IV", "start_date": time_ago(60*18), "end_date": None, "prescribed_by": doctor_id, "status": "active"},
        {"patient_id": PATIENT_2_ID, "name": "Normal Saline", "dosage": "500 mL/hr", "frequency": "Continuous", "route": "IV", "start_date": time_ago(60*24*1), "end_date": None, "prescribed_by": doctor_id, "status": "active"},
        {"patient_id": PATIENT_2_ID, "name": "Paracetamol", "dosage": "1 g", "frequency": "Every 6 hours PRN", "route": "IV", "start_date": time_ago(60*24*1), "end_date": None, "prescribed_by": doctor_id, "status": "active"},

        # Patient 3 — ARDS
        {"patient_id": patients[2]["id"], "name": "Dexamethasone", "dosage": "6 mg", "frequency": "Once daily", "route": "IV", "start_date": time_ago(60*24*2), "end_date": None, "prescribed_by": doctor_id, "status": "active"},
        {"patient_id": patients[2]["id"], "name": "Piperacillin-Tazobactam", "dosage": "4.5 g", "frequency": "Every 6 hours", "route": "IV", "start_date": time_ago(60*24*2), "end_date": None, "prescribed_by": doctor_id, "status": "active"},
        {"patient_id": patients[2]["id"], "name": "Propofol", "dosage": "50 mcg/kg/min", "frequency": "Continuous sedation", "route": "IV", "start_date": time_ago(60*24*2), "end_date": None, "prescribed_by": doctor_id, "status": "active"},

        # Patient 4 — DKA
        {"patient_id": patients[3]["id"], "name": "Insulin Regular", "dosage": "0.1 units/kg/hr", "frequency": "Continuous infusion", "route": "IV", "start_date": time_ago(60*24*5), "end_date": None, "prescribed_by": doctor_id, "status": "active"},
        {"patient_id": patients[3]["id"], "name": "Potassium Chloride", "dosage": "20 mEq", "frequency": "Every 4 hours", "route": "IV", "start_date": time_ago(60*24*5), "end_date": None, "prescribed_by": doctor_id, "status": "active"},
        {"patient_id": patients[3]["id"], "name": "Normal Saline 0.9%", "dosage": "250 mL/hr", "frequency": "Continuous", "route": "IV", "start_date": time_ago(60*24*5), "end_date": time_ago(60*24*3), "prescribed_by": doctor_id, "status": "completed"},
    ]
    post("medications", medications)
    print(f"   ✔ {len(medications)} medications created")

    # ─── Step 9: Lab Results ───────────────────────────────────────────────
    print("\n🧪 Creating lab results...")
    lab_results = [
        # Patient 1 — Post-CABG (mostly normal)
        {"patient_id": PATIENT_1_ID, "test_name": "Complete Blood Count (CBC)", "result_value": "13.2", "reference_range": "12.0-17.5", "units": "g/dL", "status": "final", "priority": "routine", "resulted_at": time_ago(60*6)},
        {"patient_id": PATIENT_1_ID, "test_name": "Troponin I", "result_value": "0.08", "reference_range": "0.00-0.04", "units": "ng/mL", "status": "final", "priority": "stat", "resulted_at": time_ago(60*4)},
        {"patient_id": PATIENT_1_ID, "test_name": "BNP", "result_value": "185", "reference_range": "0-100", "units": "pg/mL", "status": "final", "priority": "routine", "resulted_at": time_ago(60*6)},
        {"patient_id": PATIENT_1_ID, "test_name": "Basic Metabolic Panel", "result_value": "138", "reference_range": "136-145", "units": "mEq/L", "status": "final", "priority": "routine", "resulted_at": time_ago(60*8)},
        {"patient_id": PATIENT_1_ID, "test_name": "INR", "result_value": "1.1", "reference_range": "0.8-1.2", "units": "", "status": "final", "priority": "routine", "resulted_at": time_ago(60*12)},
        {"patient_id": PATIENT_1_ID, "test_name": "Creatinine", "result_value": "1.0", "reference_range": "0.7-1.3", "units": "mg/dL", "status": "final", "priority": "routine", "resulted_at": time_ago(60*8)},

        # Patient 2 — Sepsis (abnormal values!)
        {"patient_id": PATIENT_2_ID, "test_name": "Procalcitonin", "result_value": "8.5", "reference_range": "0.0-0.5", "units": "ng/mL", "status": "final", "priority": "stat", "resulted_at": time_ago(60*2)},
        {"patient_id": PATIENT_2_ID, "test_name": "Lactate", "result_value": "4.2", "reference_range": "0.5-2.2", "units": "mmol/L", "status": "final", "priority": "stat", "resulted_at": time_ago(60*1)},
        {"patient_id": PATIENT_2_ID, "test_name": "WBC", "result_value": "18.5", "reference_range": "4.5-11.0", "units": "x10³/µL", "status": "final", "priority": "stat", "resulted_at": time_ago(60*3)},
        {"patient_id": PATIENT_2_ID, "test_name": "CRP", "result_value": "245", "reference_range": "0-10", "units": "mg/L", "status": "final", "priority": "stat", "resulted_at": time_ago(60*3)},
        {"patient_id": PATIENT_2_ID, "test_name": "Blood Culture", "result_value": "Gram-negative rods (pending speciation)", "reference_range": "No growth", "units": "", "status": "preliminary", "priority": "stat", "resulted_at": time_ago(60*1)},
        {"patient_id": PATIENT_2_ID, "test_name": "Creatinine", "result_value": "2.8", "reference_range": "0.7-1.3", "units": "mg/dL", "status": "final", "priority": "stat", "resulted_at": time_ago(60*2)},
        {"patient_id": PATIENT_2_ID, "test_name": "Platelet Count", "result_value": "85", "reference_range": "150-400", "units": "x10³/µL", "status": "final", "priority": "stat", "resulted_at": time_ago(60*3)},

        # Patient 3 — ARDS
        {"patient_id": patients[2]["id"], "test_name": "ABG pH", "result_value": "7.28", "reference_range": "7.35-7.45", "units": "", "status": "final", "priority": "stat", "resulted_at": time_ago(60*1)},
        {"patient_id": patients[2]["id"], "test_name": "PaO2", "result_value": "58", "reference_range": "80-100", "units": "mmHg", "status": "final", "priority": "stat", "resulted_at": time_ago(60*1)},
        {"patient_id": patients[2]["id"], "test_name": "PaCO2", "result_value": "52", "reference_range": "35-45", "units": "mmHg", "status": "final", "priority": "stat", "resulted_at": time_ago(60*1)},
        {"patient_id": patients[2]["id"], "test_name": "P/F Ratio", "result_value": "116", "reference_range": ">300", "units": "mmHg", "status": "final", "priority": "stat", "resulted_at": time_ago(60*1)},
        {"patient_id": patients[2]["id"], "test_name": "D-Dimer", "result_value": "3.8", "reference_range": "0.0-0.5", "units": "µg/mL", "status": "final", "priority": "stat", "resulted_at": time_ago(60*4)},

        # Patient 4 — DKA
        {"patient_id": patients[3]["id"], "test_name": "Blood Glucose", "result_value": "245", "reference_range": "70-110", "units": "mg/dL", "status": "final", "priority": "stat", "resulted_at": time_ago(60*2)},
        {"patient_id": patients[3]["id"], "test_name": "HbA1c", "result_value": "11.2", "reference_range": "4.0-5.6", "units": "%", "status": "final", "priority": "routine", "resulted_at": time_ago(60*24)},
        {"patient_id": patients[3]["id"], "test_name": "ABG pH", "result_value": "7.22", "reference_range": "7.35-7.45", "units": "", "status": "final", "priority": "stat", "resulted_at": time_ago(60*6)},
        {"patient_id": patients[3]["id"], "test_name": "Serum Ketones", "result_value": "5.8", "reference_range": "0.0-0.6", "units": "mmol/L", "status": "final", "priority": "stat", "resulted_at": time_ago(60*6)},
        {"patient_id": patients[3]["id"], "test_name": "Potassium", "result_value": "3.2", "reference_range": "3.5-5.0", "units": "mEq/L", "status": "final", "priority": "stat", "resulted_at": time_ago(60*4)},
        {"patient_id": patients[3]["id"], "test_name": "Bicarbonate", "result_value": "12", "reference_range": "22-28", "units": "mEq/L", "status": "final", "priority": "stat", "resulted_at": time_ago(60*6)},
    ]
    post("lab_results", lab_results)
    print(f"   ✔ {len(lab_results)} lab results created")

    # ─── Done! ─────────────────────────────────────────────────────────────
    print("\n" + "=" * 60)
    print("  ✅ Seed complete!")
    print("=" * 60)
    print(f"""
  Summary:
    🏥 1 hospital
    🏢 2 wards
    🛏  10 beds (4 occupied)
    👤 4 users (1 doctor, 2 nurses, 1 admin)
    🧑‍⚕️ 4 patients:
       • Rajesh Sharma  — Stable, Post-CABG      (Ward A, Bed 01)
       • Meera Patel    — Critical, Sepsis        (Ward A, Bed 02) ← AI simulation
       • Anita Desai    — High risk, ARDS         (Ward B, Bed 01)
       • Vikram Singh   — Medium risk, DKA        (Ward B, Bed 02)
    📊 {len(vitals_batch)} vitals (60 per patient)
    🔔 {len(alerts)} alerts
    💊 {len(medications)} medications
    🧪 {len(lab_results)} lab results

  Backend simulation patients (auto-updating):
    Patient 1: {PATIENT_1_ID} (Rajesh Sharma — stable)
    Patient 2: {PATIENT_2_ID} (Meera Patel — hemodynamic deterioration)
    """)


if __name__ == "__main__":
    seed()
