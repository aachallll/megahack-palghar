import { useEffect, useRef, memo } from 'react';

interface Props {
  type: 'ecg' | 'pleth' | 'abp' | 'co2' | 'resp';
  color: string;
  label: string;
  rate: number;
  speed?: number;
  height?: number;
  showGrid?: boolean;
}

/**
 * LivePhysiologicalWave — High-fidelity replica of the user-provided image.
 * Features: Continuous glowing zigzag patterns, vertical sweep head line, 
 * and integrated channel labels.
 */
function LivePhysiologicalWaveInner({
  type,
  color,
  label,
  rate,
  speed = 2.8, // Slightly faster for smoother appearance
  height = 120,
  showGrid = true,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const posRef = useRef(0);
  const bufferRef = useRef<Float32Array | null>(null);
  const dprRef = useRef(1);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height: h } = entry.contentRect;
        const dpr = window.devicePixelRatio || 1;
        dprRef.current = dpr;
        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(h * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        
        const bufLen = Math.floor(width);
        const buf = new Float32Array(bufLen);
        const bl = h / 2;
        // Pre-fill buffer for instant continuous zigzag
        for (let i = 0; i < bufLen; i++) {
          buf[i] = generateSample(type, i, rate, h, bl);
        }
        bufferRef.current = buf;
        posRef.current = 0;
      }
    });
    resizeObserver.observe(canvas);

    const draw = () => {
      const dpr = dprRef.current;
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;
      const baseline = h * 0.55; // Slightly lowered baseline
      const buf = bufferRef.current;
      if (!buf || w < 10) {
        animRef.current = requestAnimationFrame(draw);
        return;
      }

      // Advance sweep
      const pxPerFrame = speed;
      for (let i = 0; i < pxPerFrame; i++) {
        const x = Math.floor(posRef.current) % buf.length;
        buf[x] = generateSample(type, posRef.current, rate, h, baseline);
        posRef.current = (posRef.current + 1) % buf.length;
      }

      // Clear with deep black
      ctx.fillStyle = '#050505';
      ctx.fillRect(0, 0, w, h);

      // 1. Draw Mesh Grid (Subtle)
      if (showGrid) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        for (let gx = 0; gx < w; gx += 40) {
          ctx.moveTo(gx, 0);
          ctx.lineTo(gx, h);
        }
        for (let gy = 0; gy < h; gy += 25) {
          ctx.moveTo(0, gy);
          ctx.lineTo(w, gy);
        }
        ctx.stroke();
      }

      // 2. Draw Waveform
      const headPos = Math.floor(posRef.current) % buf.length;
      const eraserWidth = 25;

      ctx.strokeStyle = color;
      ctx.lineWidth = 2.8; // Thicker line for better visibility
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      
      // Intense Glow effect to match "exactly"
      ctx.shadowBlur = 12;
      ctx.shadowColor = color;

      ctx.beginPath();
      let started = false;
      let prevSkipped = false;

      for (let px = 0; px < buf.length; px++) {
        const dist = (headPos - px + buf.length) % buf.length;
        if (dist < eraserWidth) {
          prevSkipped = true;
          continue;
        }
        if (!started || prevSkipped) {
          ctx.moveTo(px, buf[px]);
          started = true;
          prevSkipped = false;
        } else {
          ctx.lineTo(px, buf[px]);
        }
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      // 3. Draw Vertical Sweep Head Line
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)'; 
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(headPos - eraserWidth, 0);
      ctx.lineTo(headPos - eraserWidth, h);
      ctx.stroke();

      // 4. Draw Label (Small, Bold, Caps - matching your image exactly)
      ctx.font = '900 10px "Inter", "system-ui", sans-serif';
      ctx.fillStyle = color;
      ctx.globalAlpha = 1.0;
      ctx.fillText(label.toUpperCase(), 12, 18);
      ctx.globalAlpha = 1.0;

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animRef.current);
      resizeObserver.disconnect();
    };
  }, [type, color, label, rate, speed, showGrid]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full"
      style={{ height: `${height}px`, display: 'block' }}
    />
  );
}

const LivePhysiologicalWave = memo(LivePhysiologicalWaveInner);
export default LivePhysiologicalWave;

// ──────────────────────────────────────────────────────────
// High-Density Models for Continuous "Zigzag" Visuals
// ──────────────────────────────────────────────────────────

function pseudoNoise(x: number): number {
  const n = Math.sin(x * 12.3 + x * 98.2) * 43758.5453;
  return n - Math.floor(n);
}

function generateSample(
  type: string,
  globalX: number,
  rate: number,
  canvasHeight: number,
  baseline: number
): number {
  // Density: Matches the image which show many beats.
  // Lower = more cramped/spiky zigzag.
  const pixelsPerBeat = (type === 'ecg' || type === 'abp') ? 50 : 70; 
  const cyclePx = (60 / Math.max(rate, 40)) * pixelsPerBeat;
  const pos = globalX % cyclePx;
  const t = pos / cyclePx; 
  const amp = canvasHeight * 0.42; // Taller waves

  const wander = Math.sin(globalX * 0.005) * amp * 0.05;
  const noise = (pseudoNoise(globalX) - 0.5) * 1.5;

  switch (type) {
    case 'ecg':
      return ecgModel(t, baseline, amp) + wander + noise;
    case 'pleth':
      return plethModel(t, baseline, amp * 0.8) + wander + noise;
    case 'abp':
      return abpModel(t, baseline, amp * 0.95) + wander + noise;
    case 'co2':
      return co2Model(t, baseline, amp * 0.75) + noise;
    case 'resp':
      return respModel(t, baseline, amp * 0.7) + noise;
    default:
      return baseline + noise;
  }
}

// Spiky ECG - matching image's high-frequency sharp spikes
function ecgModel(t: number, baseline: number, amp: number): number {
  // P-wave
  if (t < 0.12) return baseline - amp * 0.08 * Math.sin((t / 0.12) * Math.PI);
  // PR segment
  if (t < 0.18) return baseline;
  // QRS Complex (Extreme Sharpness)
  if (t < 0.20) return baseline + amp * 0.08 * Math.sin(((t - 0.18) / 0.02) * Math.PI); // Q
  if (t < 0.24) return baseline - amp * 1.1 * Math.sin(((t - 0.20) / 0.04) * Math.PI); // R Spike
  if (t < 0.27) return baseline + amp * 0.25 * Math.sin(((t - 0.24) / 0.03) * Math.PI); // S Dip
  // T-wave
  if (t < 0.30) return baseline;
  if (t < 0.50) return baseline - amp * 0.18 * Math.sin(((t - 0.30) / 0.20) * Math.PI);
  return baseline;
}

// Sharpened SpO2 / Pleth
function plethModel(t: number, baseline: number, amp: number): number {
  if (t < 0.15) {
    const s = t / 0.15;
    return baseline - amp * Math.pow(Math.sin(s * (Math.PI / 2)), 0.5);
  }
  if (t < 0.25) {
    const d = (t - 0.15) / 0.10;
    return (baseline - amp) + (amp * 0.4 * d);
  }
  if (t < 0.35) {
    const n = (t - 0.25) / 0.10;
    return (baseline - amp * 0.6) + (amp * 0.12 * Math.sin(n * Math.PI));
  }
  if (t < 0.80) {
    const r = (t - 0.35) / 0.45;
    return (baseline - amp * 0.48) * Math.exp(-r * 2.8) + (baseline * (1 - Math.exp(-r * 2.8)));
  }
  return baseline;
}

// Sharp Arterial Pressure (ABP) - Very spiky in user image
function abpModel(t: number, baseline: number, amp: number): number {
  if (t < 0.08) {
    const s = t / 0.08;
    return baseline - amp * Math.pow(Math.sin(s * (Math.PI / 2)), 0.3);
  }
  if (t < 0.18) {
    const d = (t - 0.08) / 0.10;
    return (baseline - amp) + (amp * 0.35 * d);
  }
  if (t < 0.28) {
    const n = (t - 0.18) / 0.10;
    return (baseline - amp * 0.65) + (amp * 0.15 * Math.sin(n * Math.PI));
  }
  const runoff = (t - 0.28) / 0.72;
  return (baseline - amp * 0.5) * Math.exp(-runoff * 3.0) + (baseline * (1 - Math.exp(-runoff * 3.0)));
}

// Rectangular with rounded peaks for CO2
function co2Model(t: number, baseline: number, amp: number): number {
  if (t < 0.25) return baseline + amp * 0.8; 
  if (t < 0.32) {
    const r = (t - 0.25) / 0.07;
    return baseline + amp * 0.8 - amp * 1.6 * Math.sqrt(r);
  }
  if (t < 0.70) return baseline - amp * 0.8;
  if (t < 0.78) {
    const f = (t - 0.70) / 0.08;
    return baseline - amp * 0.8 + amp * 1.6 * (f * f);
  }
  return baseline + amp * 0.8;
}

// Full Sine waves for Resp
function respModel(t: number, baseline: number, amp: number): number {
  const wave = Math.sin(t * 2 * Math.PI);
  return baseline - amp * wave;
}
