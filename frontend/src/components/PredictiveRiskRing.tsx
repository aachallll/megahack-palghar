import { useMemo } from 'react';
import AnimatedNumber from './AnimatedNumber';

interface PredictiveRiskRingProps {
  score: number;       // 0–100
  size?: number;       // px, default 120
  strokeWidth?: number;
  showLabel?: boolean;
  label?: string;
}

function scoreToColor(score: number): { stroke: string; glow: string; text: string } {
  if (score >= 70) return { stroke: '#ef4444', glow: 'rgba(239,68,68,0.3)', text: 'text-red-500' };
  if (score >= 40) return { stroke: '#f59e0b', glow: 'rgba(245,158,11,0.25)', text: 'text-amber-500' };
  return { stroke: '#22c55e', glow: 'rgba(34,197,94,0.2)', text: 'text-green-500' };
}

export default function PredictiveRiskRing({
  score,
  size = 120,
  strokeWidth = 8,
  showLabel = true,
  label = 'Predictive Risk',
}: PredictiveRiskRingProps) {
  const { stroke, glow, text } = useMemo(() => scoreToColor(score), [score]);
  const r = (size - strokeWidth * 2) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const dashOffset = circumference * (1 - Math.min(100, Math.max(0, score)) / 100);
  const isSmall = size < 64;

  return (
    <div className="relative flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        {/* Glow backdrop */}
        {!isSmall && score > 0 && (
          <div
            className="absolute inset-0 rounded-full blur-md transition-all duration-700"
            style={{ backgroundColor: glow }}
          />
        )}

        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="relative z-10"
          style={{ transform: 'rotate(-90deg)' }}
        >
          {/* Track */}
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke="hsl(var(--border))"
            strokeWidth={strokeWidth}
          />
          {/* Progress arc */}
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            style={{ transition: 'stroke-dashoffset 0.8s ease, stroke 0.4s ease' }}
          />
        </svg>

        {/* Centre label */}
        <div
          className="absolute inset-0 flex flex-col items-center justify-center z-20"
          style={{ transform: 'rotate(0deg)' }}
        >
          {isSmall ? (
            <AnimatedNumber value={score} className={`text-[10px] font-bold tabular-nums ${text}`} />
          ) : (
            <>
              <AnimatedNumber
                value={score}
                className={`font-bold tabular-nums leading-none ${text}`}
                style={{ fontSize: size * 0.22 }}
              />
              <span className="text-muted-foreground" style={{ fontSize: size * 0.09 }}>/ 100</span>
            </>
          )}
        </div>
      </div>

      {showLabel && !isSmall && (
        <span className="text-xs text-muted-foreground text-center leading-tight">{label}</span>
      )}
    </div>
  );
}
