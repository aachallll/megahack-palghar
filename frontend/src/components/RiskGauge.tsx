import { motion } from 'framer-motion';

interface RiskGaugeProps {
  score: number; // 0-100
  size?: number;
}

export default function RiskGauge({ score, size = 160 }: RiskGaugeProps) {
  const clampedScore = Math.max(0, Math.min(100, score));
  const radius = (size - 20) / 2;
  const cx = size / 2;
  const cy = size / 2 + 10;

  // Semicircle arc from 180deg to 0deg (left to right)
  const startAngle = Math.PI;
  const endAngle = 0;
  const sweepAngle = startAngle - (clampedScore / 100) * Math.PI;

  const needleX = isNaN(radius) ? cx : cx + radius * 0.75 * Math.cos(sweepAngle);
  const needleY = isNaN(radius) ? cy : cy - radius * 0.75 * Math.sin(sweepAngle);

  const safeNeedleX = isNaN(needleX) ? cx : needleX;
  const safeNeedleY = isNaN(needleY) ? cy : needleY;

  // Arc path
  const arcPath = (startA: number, endA: number, r: number) => {
    const x1 = cx + r * Math.cos(startA);
    const y1 = cy - r * Math.sin(startA);
    const x2 = cx + r * Math.cos(endA);
    const y2 = cy - r * Math.sin(endA);
    const largeArc = startA - endA > Math.PI ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 0 ${x2} ${y2}`;
  };

  const getColor = (s: number) => {
    if (s < 30) return 'hsl(142, 76%, 36%)';
    if (s < 50) return 'hsl(38, 92%, 50%)';
    if (s < 80) return 'hsl(0, 84%, 60%)';
    return 'hsl(347, 77%, 50%)';
  };

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size / 2 + 30} viewBox={`0 0 ${size} ${size / 2 + 30}`}>
        {/* Background arc */}
        <path
          d={arcPath(startAngle, endAngle, radius)}
          fill="none"
          stroke="hsl(var(--border))"
          strokeWidth="8"
          strokeLinecap="round"
        />

        {/* Gradient segments */}
        <defs>
          <linearGradient id="gaugeGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="hsl(142, 76%, 36%)" />
            <stop offset="40%" stopColor="hsl(38, 92%, 50%)" />
            <stop offset="70%" stopColor="hsl(0, 84%, 60%)" />
            <stop offset="100%" stopColor="hsl(347, 77%, 50%)" />
          </linearGradient>
        </defs>
        <path
          d={arcPath(startAngle, endAngle, radius)}
          fill="none"
          stroke="url(#gaugeGrad)"
          strokeWidth="8"
          strokeLinecap="round"
          opacity={0.3}
        />

        {/* Needle */}
        <motion.line
          x1={cx}
          y1={cy}
          x2={safeNeedleX}
          y2={safeNeedleY}
          stroke={getColor(clampedScore)}
          strokeWidth="2.5"
          strokeLinecap="round"
          initial={false}
          animate={{ x2: safeNeedleX, y2: safeNeedleY }}
          transition={{ type: 'spring', stiffness: 60, damping: 15, duration: 1 }}
        />

        {/* Center dot */}
        <circle cx={cx} cy={cy} r="4" fill={getColor(clampedScore)} />

        {/* Score text */}
        <text
          x={cx}
          y={cy - 15}
          textAnchor="middle"
          className="text-2xl font-bold"
          fill="currentColor"
        >
          {Math.round(clampedScore)}
        </text>
      </svg>
      <p className="clinical-disclaimer mt-1">AI decision support only — verify clinically</p>
    </div>
  );
}
