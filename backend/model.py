import logging
import base64
import io
import time
import os
import numpy as np
from datetime import datetime
from typing import List, Dict, Any, Optional
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

try:
    import torch
    import cv2
    TORCH_AVAILABLE = True
except (ImportError, OSError):
    TORCH_AVAILABLE = False
    logger.warning("PyTorch/OpenCV not available — mock mode active")

try:
    from PIL import Image, ImageDraw
    PIL_AVAILABLE = True
except ImportError:
    PIL_AVAILABLE = False

CONF_THRESHOLD = float(os.getenv("MODEL_CONFIDENCE", "0.45"))

class AnomalyDetector:
    def __init__(self):
        self.loaded = False
        self.model = None
        self.prev_centroids: List[tuple] = []
        self.no_person_frames: int = 0
        self.frame_count: int = 0
        self._load_model()

    def _load_model(self):
        if not TORCH_AVAILABLE:
            logger.warning("PyTorch not available — mock detection mode")
            return
        try:
            logger.info("Loading YOLOv9 model...")
            self.model = torch.hub.load(
                'WongKinYiu/yolov9',
                'yolov9-c',
                pretrained=True,
                verbose=False
            )
            self.model.eval()
            self.device = torch.device(
                'cuda' if torch.cuda.is_available() else 'cpu'
            )
            self.model = self.model.to(self.device)
            self.loaded = True
            logger.info(f"YOLOv9 loaded on {self.device}")
        except Exception as e:
            logger.error(f"YOLOv9 load failed: {e}")
            self.loaded = False

    def _apply_spike_filter(self, value: float,
                             history: List[float],
                             sigma: float = 3.0) -> bool:
        """Layer 1: spike filter — returns True if outlier"""
        if len(history) < 4:
            return False
        mean = np.mean(history)
        std = np.std(history)
        return abs(value - mean) > sigma * std

    def _check_anomalies(self,
                          persons: List[Dict],
                          frame_shape: tuple) -> List[Dict]:
        h, w = frame_shape[:2]
        anomalies = []
        current_centroids = []

        if len(persons) == 0:
            self.no_person_frames += 1
            if self.no_person_frames > 10:
                anomalies.append({
                    "type": "no_person",
                    "severity": "medium",
                    "message": "No person detected for extended period",
                    "timestamp": datetime.now().isoformat()
                })
        else:
            self.no_person_frames = 0

        if len(persons) > 2:
            anomalies.append({
                "type": "multiple_persons",
                "severity": "medium",
                "message": f"{len(persons)} persons detected — possible unauthorized visitor",
                "timestamp": datetime.now().isoformat()
            })

        for person in persons:
            bbox = person.get("bbox", [])
            if len(bbox) != 4:
                continue
            x1, y1, x2, y2 = bbox
            pw = x2 - x1
            ph = y2 - y1
            cx = (x1 + x2) / 2
            cy = (y1 + y2) / 2
            current_centroids.append((cx, cy))

            # Fall detection: horizontal bbox
            if ph > 0 and pw / ph > 1.2:
                anomalies.append({
                    "type": "fall_detected",
                    "severity": "critical",
                    "message": "Possible fall detected — patient appears horizontal",
                    "timestamp": datetime.now().isoformat()
                })

            # Edge proximity: fall risk
            margin = 50
            if (x1 < margin or y1 < margin or
                x2 > w - margin or y2 > h - margin):
                anomalies.append({
                    "type": "person_near_edge",
                    "severity": "high",
                    "message": "Patient near edge of frame — fall risk",
                    "timestamp": datetime.now().isoformat()
                })

            # Rapid movement
            if self.prev_centroids:
                for prev_cx, prev_cy in self.prev_centroids:
                    dist = ((cx - prev_cx)**2 + (cy - prev_cy)**2) ** 0.5
                    if dist > 150:
                        anomalies.append({
                            "type": "rapid_movement",
                            "severity": "high",
                            "message": "Rapid patient movement detected",
                            "timestamp": datetime.now().isoformat()
                        })
                        break

        self.prev_centroids = current_centroids

        # Deduplicate anomaly types
        seen = set()
        unique = []
        for a in anomalies:
            if a["type"] not in seen:
                seen.add(a["type"])
                unique.append(a)
        return unique

    def detect(self, frame: np.ndarray) -> Dict[str, Any]:
        """
        Run detection on a BGR numpy frame.
        Returns persons list, anomalies list,
        frame_count, processing_time_ms.
        """
        start = time.time()
        self.frame_count += 1
        persons = []

        try:
            if self.loaded and self.model is not None:
                # Real YOLOv9 inference
                with torch.no_grad():
                    results = self.model(frame)

                if hasattr(results, 'xyxy'):
                    for *box, conf, cls in results.xyxy[0]:
                        if int(cls) == 0 and float(conf) >= CONF_THRESHOLD:
                            x1, y1, x2, y2 = [float(v) for v in box]
                            cx = (x1 + x2) / 2
                            cy = (y1 + y2) / 2
                            persons.append({
                                "bbox": [x1, y1, x2, y2],
                                "confidence": float(conf),
                                "centroid": [cx, cy]
                            })
            else:
                # Mock mode — simulate one person
                h, w = frame.shape[:2]
                persons = [{
                    "bbox": [w*0.3, h*0.2, w*0.6, h*0.8],
                    "confidence": 0.87,
                    "centroid": [w*0.45, h*0.5]
                }]

            anomalies = self._check_anomalies(persons, frame.shape)

        except Exception as e:
            logger.error(f"Detection error: {e}")
            anomalies = []

        elapsed = (time.time() - start) * 1000
        return {
            "persons": persons,
            "anomalies": anomalies,
            "frame_count": self.frame_count,
            "processing_time_ms": round(elapsed, 2)
        }