interface SparklineProps {
  data: number[];
  color: string;
  width?: number;
  height?: number;
}

export default function Sparkline({ data, color, width = 80, height = 32 }: SparklineProps) {
  if (data.length < 2) return null;

  const cleanData = data.filter(v => typeof v === 'number' && !isNaN(v));
  if (cleanData.length < 2) return <div className="h-full w-full bg-muted/20 animate-pulse" />;

  const min = Math.min(...cleanData);
  const max = Math.max(...cleanData);
  const range = max - min || 1;

  const points = cleanData
    .map((val, i) => {
      const x = (i / (cleanData.length - 1)) * 100;
      const y = 90 - ((val - min) / range) * 80;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}
