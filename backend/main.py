"""
Prahari ICU Backend v4.0
Real-time predictive monitoring:
  • Background loop pushes simulated vitals to Supabase every 20 s per patient
  • AI predictor (predictor.py) analyses every new reading
  • /ws/predict/{patient_id} streams full AI analysis to connected clients
  • /ws/surveillance/{patient_id} and /ws/ward/{ward_id} stream camera frames
"""

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from typing import Dict, Set, Optional, List, Any
import asyncio
import json
import logging
import os
import random
import math
import cv2
import base64
import numpy as np
from datetime import datetime, timezone
from dotenv import load_dotenv
from supabase import create_client, Client
from model import AnomalyDetector
from predictor import analyze_patient_vitals, debouncer

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ─── Patient simulation profiles ────────────────────────────────────────────
#  Each admitted patient gets a profile that controls how their vitals evolve.
#  Mode: 'stable' | 'deteriorating' | 'improving' | 'sepsis' | 'resp_failure' | 'resp_distress' | 'hemodynamic'
#  'step': increments every cycle (20 s)

PATIENT_PROFILES: Dict[str, Dict[str, Any]] = {
    "aaaaaaaa-0000-0000-0000-000000000001": {
        # Sim One – baseline stable ICU patient
        "mode": "stable",
        "step": 0,
        "base": {"hr": 78, "sbp": 112, "dbp": 74, "rr": 17, "temp": 37.2, "spo2": 97, "etco2": 38, "map": 86, "pulse": 78, "aw_rr": 17},
        "drift": {"hr": 0, "sbp": 0, "dbp": 0, "rr": 0, "temp": 0, "spo2": 0, "etco2": 0, "map": 0, "pulse": 0, "aw_rr": 0},
    },
    "aaaaaaaa-0000-0000-0000-000000000002": {
        # Sim Two – serious cardiac/hemodynamic patient
        "mode": "hemodynamic",
        "step": 0,
        # Tachycardic, hypotensive, tachypneic, borderline oxygenation
        "base": {"hr": 115, "sbp": 92, "dbp": 58, "rr": 24, "temp": 37.8, "spo2": 92, "etco2": 48, "map": 68, "pulse": 115, "aw_rr": 24},
        "drift": {"hr": 0, "sbp": -0.8, "dbp": -0.5, "rr": 0.4, "temp": 0.02, "spo2": -0.1, "etco2": 0.4, "map": -0.8, "pulse": 0.0, "aw_rr": 0.4},
    }
}

SIMULATION_TEMPLATES = {
    "stable": {
        "hr": 0, "sbp": 0, "dbp": 0, "rr": 0, "temp": 0, "spo2": 0, "etco2": 0, "map": 0, "pulse": 0, "aw_rr": 0
    },
    "sepsis": {
        "hr": 2.2, "sbp": -1.1, "dbp": -0.8, "rr": 0.5, "temp": 0.08, "spo2": -0.1, "etco2": 0, "map": -1.3, "pulse": 2.2, "aw_rr": 0.5
    },
    "resp_failure": {
        "hr": 1.5, "sbp": 0, "dbp": 0, "rr": 1.1, "temp": 0, "spo2": -0.9, "etco2": 1.4, "map": 0, "pulse": 1.5, "aw_rr": 1.1
    },
    "resp_distress": {
        "hr": 1.8, "sbp": 0, "dbp": 0, "rr": 1.5, "temp": 0, "spo2": -0.6, "etco2": 0.2, "map": 0, "pulse": 1.8, "aw_rr": 1.5
    },
    "hemodynamic": {
        "hr": 2.5, "sbp": -1.8, "dbp": -1.2, "rr": 0.4, "temp": 0, "spo2": -0.2, "etco2": 0, "map": -1.8, "pulse": 2.5, "aw_rr": 0.4
    },
    "improving": {
        "hr": -1.2, "sbp": 0.4, "dbp": 0.3, "rr": -0.3, "temp": -0.01, "spo2": 0.2, "etco2": -0.2, "map": 0.4, "pulse": -1.2, "aw_rr": -0.3
    }
}

# Per‑vital noise levels (standard deviation) for more visible ups/downs
NOISE_SIGMA = {
    "hr": 5.0,
    "sbp": 10.0,
    "dbp": 6.0,
    "rr": 2.0,
    "temp": 0.1,
    "spo2": 1.2,
    "etco2": 2.5,
    "map": 5.0,
    "pulse": 5.0,
    "aw_rr": 2.0,
}

def _gen_vital_from_profile(pid: str) -> dict:
    """Generate one vitals reading based on the patient's simulation profile."""
    p = PATIENT_PROFILES.get(pid)
    if not p:
        return {}
    step = p["step"]
    b = p["base"]
    d = p["drift"]

    # Gaussian noise with per‑signal sigma
    def noise(key: str) -> float:
        return random.gauss(0, NOISE_SIGMA.get(key, 1.0))

    # Slow sinusoidal modulation to create more natural “ups and downs”
    def wave(amplitude: float, period_steps: float) -> float:
        # period_steps ~ number of 20s cycles per full oscillation
        return amplitude * math.sin(2 * math.pi * (step / max(period_steps, 1.0)))

    # Larger, more “ventilator-like” swings on pressure/flow-related vitals
    hr   = round(max(30,  min(220, b.get("hr", 70)   + d.get("hr", 0)   * step + wave(10, 14) + noise("hr"))))
    sbp  = round(max(70,  min(220, b.get("sbp", 120) + d.get("sbp", 0) * step + wave(15, 18) + noise("sbp"))))
    dbp  = round(max(40,  min(130, b.get("dbp", 80)  + d.get("dbp", 0) * step + wave(8, 18)  + noise("dbp"))))
    rr   = round(max(8,   min(50,  b.get("rr", 16)   + d.get("rr", 0)  * step + wave(3, 10)  + noise("rr"))))
    temp = round(max(35.0, min(42.0, b.get("temp", 37.0) + d.get("temp", 0) * step + wave(0.2, 40) + noise("temp"))), 1)
    spo2 = round(max(70,  min(100, b.get("spo2", 98) + d.get("spo2", 0) * step + wave(2.0, 18) + noise("spo2"))))
    etco2= round(max(10,  min(80,  b.get("etco2", 35) + d.get("etco2", 0) * step + wave(5, 12)  + noise("etco2"))))
    map_val= round(max(30, min(150, b.get("map", 90)   + d.get("map", 0)   * step + wave(10, 16) + noise("map"))))
    pulse = round(max(30, min(220, b.get("pulse", 70) + d.get("pulse", 0) * step + wave(10, 14) + noise("pulse"))))
    aw_rr = round(max(8,  min(50,  b.get("aw_rr", 16) + d.get("aw_rr", 0) * step + wave(4, 10)  + noise("aw_rr"))))

    # Cap deterioration drift after 60 steps so values don't go infinite
    p["step"] = min(step + 1, 120)

    return {
        "patient_id": pid,
        "heart_rate": hr,
        "blood_pressure_systolic": sbp,
        "blood_pressure_diastolic": dbp,
        "respiratory_rate": rr,
        "temperature": temp,
        "oxygen_saturation": spo2,
        "etco2": etco2,
        "map": map_val,
        "pulse": pulse,
        "aw_rr": aw_rr,
        "pain_level": random.randint(3, 8) if p["mode"] == "deteriorating" else random.randint(1, 4),
        "blood_glucose": random.randint(110, 200),
        "measurement_method": "automated",
        "recorded_by": os.getenv("SIM_RECORDED_BY", "98205de9-2fdf-4c84-9efc-1ba4dff923ae"),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


# ─── Global state ─────────────────────────────────────────────────────────────
detector: Optional[AnomalyDetector] = None
supabase_client: Optional[Client] = None
camera: Optional[cv2.VideoCapture] = None
_vital_history_cache: Dict[str, List[dict]] = {}   # in-memory recent vitals per patient
_MAX_CACHE = 60   # keep last 60 readings (~20 min at 20 s intervals)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global detector, supabase_client, camera

    # Init detector
    try:
        detector = AnomalyDetector()
        logger.info(f"AnomalyDetector ready. Model loaded: {detector.loaded}")
    except Exception as e:
        logger.error(f"Detector init failed: {e}")
        detector = AnomalyDetector.__new__(AnomalyDetector)
        detector.loaded = False

    # Init Supabase
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_KEY")
    if url and key:
        try:
            supabase_client = create_client(url, key)
            logger.info("Supabase connected")
            # Pre-warm vital history cache
            await _warm_cache()
        except Exception as e:
            logger.error(f"Supabase init failed: {e}")

    # Init camera
    cam_source = os.getenv("CAMERA_SOURCE", "0")
    try:
        source = int(cam_source)
    except ValueError:
        source = cam_source
    try:
        camera = cv2.VideoCapture(source)
        if not camera.isOpened():
            logger.warning(f"Camera not available: {source}")
            camera = None
    except Exception as e:
        logger.error(f"Camera error: {e}")
        camera = None

    # Start the real-time vitals simulation loop
    sim_task = asyncio.create_task(_realtime_vitals_loop())
    logger.info("Prahari ICU real-time loop started")
    yield

    sim_task.cancel()
    try:
        await sim_task
    except asyncio.CancelledError:
        pass
    if camera:
        camera.release()
    logger.info("Backend shutdown")


async def _warm_cache():
    """Load last 60 vitals for each monitored patient from Supabase."""
    for pid in PATIENT_PROFILES:
        try:
            resp = (
                supabase_client.table("vitals")
                .select("*")
                .eq("patient_id", pid)
                .order("timestamp", desc=False)
                .limit(60)
                .execute()
            )
            if resp.data:
                _vital_history_cache[pid] = resp.data
                logger.info(f"Cache warmed for {pid[:8]}: {len(resp.data)} vitals")
        except Exception as e:
            logger.error(f"Cache warm error {pid[:8]}: {e}")


async def _realtime_vitals_loop():
    """
    Main real-time loop — runs every 20 seconds:
      1. Generate new vital reading from profile
      2. Save to Supabase
      3. Update in-memory cache
      4. Run AI predictor (predictor.py)
      5. Auto-save confirmed alerts to Supabase (with debounce)
      6. Broadcast full prediction payload to all connected /ws/predict clients
    """
    INTERVAL = 20   # seconds between readings
    await asyncio.sleep(3)  # brief startup delay

    while True:
        tasks = [_process_patient(pid) for pid in PATIENT_PROFILES]
        await asyncio.gather(*tasks, return_exceptions=True)
        await asyncio.sleep(INTERVAL)


async def _process_patient(pid: str):
    """Generate, store, analyse, and broadcast one cycle for a patient."""
    try:
        # 1. Generate vital
        vital = _gen_vital_from_profile(pid)
        if not vital:
            return

        # 2. Save to Supabase
        inserted_vital = None
        if supabase_client:
            try:
                resp = supabase_client.table("vitals").insert(vital).execute()
                if resp.data:
                    inserted_vital = resp.data[0]
            except Exception as e:
                logger.error(f"Supabase insert error {pid[:8]}: {e}")

        # 3. Update in-memory cache
        cache_entry = inserted_vital or vital
        cache = _vital_history_cache.setdefault(pid, [])
        cache.append(cache_entry)
        if len(cache) > _MAX_CACHE:
            _vital_history_cache[pid] = cache[-_MAX_CACHE:]

        history = _vital_history_cache[pid]

        # 4. Run AI predictor (need ≥3 readings)
        if len(history) < 3:
            return

        result = analyze_patient_vitals(pid, history, debounce=True)

        # 5. Auto-save confirmed alerts (high/critical correlations, debounced)
        if supabase_client:
            for corr in result.correlations:
                if corr.severity in ("critical", "urgent") and corr.confidence >= 0.8:
                    await _save_predictive_alert(pid, corr.pattern, corr.severity, corr.explanation)

        # 6. Broadcast prediction to WebSocket subscribers
        payload = _build_prediction_payload(pid, vital, result)
        room = f"predict-{pid}"
        if room in manager.connections:
            dead = set()
            for ws in list(manager.connections[room]):
                try:
                    await ws.send_text(json.dumps(payload, default=str))
                except Exception:
                    dead.add(ws)
            for ws in dead:
                manager.connections[room].discard(ws)

    except Exception as e:
        logger.error(f"Process patient error {pid[:8]}: {e}")


def _build_prediction_payload(pid: str, vital: dict, result) -> dict:
    profile = PATIENT_PROFILES.get(pid, {})
    return {
        "type": "prediction",
        "patient_id": pid,
        "mode": profile.get("mode", "stable"),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "latest_vital": vital,
        "trends": [
            {
                "vital": t.vital,
                "label": t.label,
                "direction": t.direction,
                "slope": round(t.slope, 4),
                "change_percent": round(t.change_percent, 2),
                "alarming": t.alarming,
                "current_value": t.current_value,
            }
            for t in result.trends
        ],
        "correlations": [
            {
                "pattern": c.pattern,
                "severity": c.severity,
                "explanation": c.explanation,
                "vitals_involved": c.vitals_involved,
                "confidence": round(c.confidence, 3),
            }
            for c in result.correlations
        ],
        "predictive_score": result.predictive_score,
        "time_to_alert": result.time_to_alert,
        "news2": result.news2,
        "disclaimer": "AI Decision Support Only — all clinical decisions must be verified by a qualified medical professional.",
    }


app = FastAPI(
    title="Prahari ICU Backend",
    version="4.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Connection Manager ────────────────────────────────────────────────────────
class ConnectionManager:
    def __init__(self):
        self.connections: Dict[str, Set[WebSocket]] = {}

    async def connect(self, ws: WebSocket, room: str):
        await ws.accept()
        self.connections.setdefault(room, set()).add(ws)
        logger.info(f"WS connected room={room} peers={len(self.connections[room])}")

    def disconnect(self, ws: WebSocket, room: str):
        if room in self.connections:
            self.connections[room].discard(ws)

    async def send(self, ws: WebSocket, data: dict):
        try:
            await ws.send_text(json.dumps(data, default=str))
        except Exception as e:
            logger.error(f"Send error: {e}")

manager = ConnectionManager()


# ─── Camera helpers ────────────────────────────────────────────────────────────
def read_camera_frame() -> Optional[str]:
    if not camera or not camera.isOpened():
        return None
    ret, frame = camera.read()
    if not ret:
        return None
    frame = cv2.resize(frame, (640, 480))
    _, buf = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 75])
    return base64.b64encode(buf.tobytes()).decode('utf-8')


def draw_detections(frame_b64: str, result: dict) -> str:
    try:
        img_bytes = base64.b64decode(frame_b64)
        arr = np.frombuffer(img_bytes, np.uint8)
        frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        h, w = frame.shape[:2]
        for person in result.get("persons", []):
            bbox = person.get("bbox", [])
            if len(bbox) == 4:
                x1, y1, x2, y2 = int(bbox[0]*w), int(bbox[1]*h), int(bbox[2]*w), int(bbox[3]*h)
                cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
        for anomaly in result.get("anomalies", []):
            cv2.putText(frame, f"⚠ {anomaly.get('type','?')}", (10, 30),
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)
        _, buf = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 75])
        return base64.b64encode(buf.tobytes()).decode('utf-8')
    except Exception:
        return frame_b64


async def _save_predictive_alert(pid: str, pattern: str, severity: str, explanation: str):
    if not supabase_client:
        return
    # Avoid duplicate active alerts for the same pattern in the last 30 min
    try:
        existing = (
            supabase_client.table("alerts")
            .select("id")
            .eq("patient_id", pid)
            .eq("title", f"⚠ AI: {pattern}")
            .eq("status", "active")
            .execute()
        )
        if existing.data:
            return  # already active

        sev_map = {"critical": "critical", "urgent": "high", "warning": "medium"}
        supabase_client.table("alerts").insert({
            "patient_id": pid,
            "type": "sepsis" if "Sepsis" in pattern else "tachycardia" if "Tach" in pattern else "system",
            "severity": sev_map.get(severity, "medium"),
            "title": f"⚠ AI: {pattern}",
            "message": explanation + "\n\n[AI Decision Support Only — physician assessment required]",
            "auto_generated": True,
            "source": "system",
            "status": "active",
        }).execute()
        logger.info(f"AI alert saved: {pattern} for {pid[:8]}")
    except Exception as e:
        logger.error(f"Alert save error: {e}")


# ─── REST Endpoints ────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "Prahari ICU Backend",
        "version": "4.0.0",
        "model_loaded": detector.loaded if detector else False,
        "camera_connected": camera.isOpened() if camera else False,
        "monitored_patients": len(PATIENT_PROFILES),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/api/predict/{patient_id}")
async def predict_patient(patient_id: str):
    """Return latest AI analysis snapshot for a patient (REST fallback)."""
    history = _vital_history_cache.get(patient_id, [])
    if len(history) < 3:
        if supabase_client:
            try:
                resp = (
                    supabase_client.table("vitals")
                    .select("*")
                    .eq("patient_id", patient_id)
                    .order("timestamp", desc=False)
                    .limit(60)
                    .execute()
                )
                history = resp.data or []
                _vital_history_cache[patient_id] = history
            except Exception as e:
                return {"error": str(e)}
    if len(history) < 3:
        return {"error": "Insufficient vitals data", "count": len(history)}

    result = analyze_patient_vitals(patient_id, history, debounce=False)
    latest = history[-1] if history else {}
    return _build_prediction_payload(patient_id, latest, result)


@app.post("/api/vitals/simulate/mode")
async def set_patient_mode(patient_id: str, mode: str):
    """Change a patient's simulation mode: stable | sepsis | resp_failure | resp_distress | hemodynamic | improving"""
    if patient_id not in PATIENT_PROFILES:
        # Auto-create profile if missing
        PATIENT_PROFILES[patient_id] = {
            "mode": "stable",
            "step": 0,
            "base": {"hr": 70, "sbp": 120, "dbp": 80, "rr": 16, "temp": 37.0, "spo2": 98, "etco2": 35, "map": 90},
            "drift": SIMULATION_TEMPLATES["stable"]
        }
    
    if mode not in SIMULATION_TEMPLATES:
        return {"error": f"Invalid mode. Choose from: {list(SIMULATION_TEMPLATES.keys())}"}
    
    PATIENT_PROFILES[patient_id]["mode"] = mode
    PATIENT_PROFILES[patient_id]["step"] = 0
    PATIENT_PROFILES[patient_id]["drift"] = SIMULATION_TEMPLATES[mode]
    debouncer.reset_count(patient_id)
    logger.info(f"Simulation mode for {patient_id[:8]} set to {mode}")
    return {"patient_id": patient_id, "mode": mode, "message": f"Simulation set to {mode}. Slopes are active."}


@app.get("/api/snapshot")
async def snapshot():
    frame_b64 = read_camera_frame()
    if not frame_b64:
        return {"error": "Camera not available"}
    if detector:
        img_bytes = base64.b64decode(frame_b64)
        arr = np.frombuffer(img_bytes, np.uint8)
        result = detector.detect(cv2.imdecode(arr, cv2.IMREAD_COLOR))
        frame_b64 = draw_detections(frame_b64, result)
        return {"frame": frame_b64, "result": result}
    return {"frame": frame_b64, "result": {}}


# ─── WebSocket Endpoints ───────────────────────────────────────────────────────

@app.websocket("/ws/predict/{patient_id}")
async def ws_predict(websocket: WebSocket, patient_id: str):
    """
    Streams real-time AI prediction payload for a patient.
    On connect, immediately sends the latest cached analysis so the UI isn't blank.
    After that, the background loop pushes new payloads every ~20 s.
    """
    room = f"predict-{patient_id}"
    await manager.connect(websocket, room)

    # Send immediate snapshot so the UI renders right away
    history = _vital_history_cache.get(patient_id, [])
    if len(history) >= 3:
        result = analyze_patient_vitals(patient_id, history, debounce=False)
        latest = history[-1]
        payload = _build_prediction_payload(patient_id, latest, result)
        await manager.send(websocket, payload)
    else:
        await manager.send(websocket, {
            "type": "waiting",
            "patient_id": patient_id,
            "message": "Collecting vitals data — first analysis in <20 s",
        })

    try:
        # Keep alive — the loop handles broadcasts
        while True:
            await asyncio.sleep(1)
            # Ping to detect client disconnects
            try:
                await websocket.send_text('{"type":"ping"}')
            except Exception:
                break
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(websocket, room)
        logger.info(f"Predict WS disconnected: {patient_id[:8]}")


@app.websocket("/ws/surveillance/{patient_id}")
async def ws_patient(websocket: WebSocket, patient_id: str):
    room = f"patient-{patient_id}"
    await manager.connect(websocket, room)
    try:
        while True:
            frame_b64 = read_camera_frame()
            result = {"persons": [], "anomalies": []}
            if frame_b64 and detector:
                arr = np.frombuffer(base64.b64decode(frame_b64), np.uint8)
                result = detector.detect(cv2.imdecode(arr, cv2.IMREAD_COLOR))
                frame_b64 = draw_detections(frame_b64, result)
                for anomaly in result.get("anomalies", []):
                    if anomaly.get("severity") in ("high", "critical"):
                        try:
                            supabase_client and supabase_client.table("alerts").insert({
                                "patient_id": patient_id,
                                "type": "fall_risk",
                                "severity": anomaly.get("severity", "medium"),
                                "title": f"Vision Alert: {anomaly.get('type','').replace('_',' ').title()}",
                                "message": anomaly.get("message", "Anomaly detected via CCTV"),
                                "auto_generated": True,
                                "source": "device",
                                "status": "active",
                            }).execute()
                        except Exception:
                            pass
            await manager.send(websocket, {
                "type": "frame",
                "patient_id": patient_id,
                "frame": frame_b64 or "",
                "persons_count": len(result.get("persons", [])),
                "anomalies": result.get("anomalies", []),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })
            await asyncio.sleep(0.1)
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(websocket, room)


@app.websocket("/ws/ward/{ward_id}")
async def ws_ward(websocket: WebSocket, ward_id: str):
    room = f"ward-{ward_id}"
    await manager.connect(websocket, room)
    try:
        while True:
            frame_b64 = read_camera_frame()
            result = {"persons": [], "anomalies": []}
            if frame_b64 and detector:
                arr = np.frombuffer(base64.b64decode(frame_b64), np.uint8)
                result = detector.detect(cv2.imdecode(arr, cv2.IMREAD_COLOR))
                frame_b64 = draw_detections(frame_b64, result)
            await manager.send(websocket, {
                "type": "frame",
                "ward_id": ward_id,
                "frame": frame_b64 or "",
                "persons_count": len(result.get("persons", [])),
                "anomalies": result.get("anomalies", []),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })
            await asyncio.sleep(0.1)
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(websocket, room)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=os.getenv("HOST", "0.0.0.0"),
        port=int(os.getenv("PORT", 8000)),
        reload=True
    )