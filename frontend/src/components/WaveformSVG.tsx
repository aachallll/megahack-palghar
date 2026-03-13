import { useEffect, useRef } from 'react';

export default function WaveformSVG() {
  const pathRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    let offset = 0;
    let animFrame: number;

    const animate = () => {
      offset += 0.5;
      if (pathRef.current) {
        const d = generateECG(offset);
        pathRef.current.setAttribute('d', d);
      }
      animFrame = requestAnimationFrame(animate);
    };

    animFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animFrame);
  }, []);

  return (
    <div className="w-full max-w-md">
      <svg viewBox="0 0 400 120" className="w-full" preserveAspectRatio="xMidYMid meet">
        {/* Grid lines */}
        {Array.from({ length: 20 }).map((_, i) => (
          <line
            key={`v${i}`}
            x1={i * 20}
            y1={0}
            x2={i * 20}
            y2={120}
            stroke="hsl(var(--border))"
            strokeWidth="0.5"
          />
        ))}
        {Array.from({ length: 6 }).map((_, i) => (
          <line
            key={`h${i}`}
            x1={0}
            y1={i * 20}
            x2={400}
            y2={i * 20}
            stroke="hsl(var(--border))"
            strokeWidth="0.5"
          />
        ))}
        <path
          ref={pathRef}
          d={generateECG(0)}
          fill="none"
          stroke="hsl(var(--vital-hr))"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

function generateECG(offset: number): string {
  const points: string[] = [];
  const baseline = 60;
  const width = 400;
  const cycleLength = 100;

  for (let x = 0; x < width; x += 1) {
    const pos = (x + offset) % cycleLength;
    let y = baseline;

    if (pos > 20 && pos < 25) {
      // P wave
      y = baseline - 8 * Math.sin(((pos - 20) / 5) * Math.PI);
    } else if (pos > 30 && pos < 33) {
      // Q
      y = baseline + 5;
    } else if (pos > 33 && pos < 38) {
      // R
      y = baseline - 40 * Math.sin(((pos - 33) / 5) * Math.PI);
    } else if (pos > 38 && pos < 42) {
      // S
      y = baseline + 10 * Math.sin(((pos - 38) / 4) * Math.PI);
    } else if (pos > 50 && pos < 60) {
      // T wave
      y = baseline - 12 * Math.sin(((pos - 50) / 10) * Math.PI);
    }

    points.push(`${x === 0 ? 'M' : 'L'} ${x} ${y}`);
  }

  return points.join(' ');
}
