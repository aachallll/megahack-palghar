import { motion } from 'framer-motion';

interface TimeToAlertCountdownProps {
    minutes: number;   // estimated minutes until threshold breach
    maxMinutes?: number; // cap for the arc (default 30)
}

export default function TimeToAlertCountdown({
    minutes,
    maxMinutes = 30,
}: TimeToAlertCountdownProps) {
    const clamped = Math.max(1, Math.min(minutes, maxMinutes));
    const fraction = clamped / maxMinutes;
    const isCritical = clamped <= 10;
    const isUrgent = clamped <= 20;

    const size = 80;
    const strokeWidth = 7;
    const r = (size - strokeWidth * 2) / 2;
    const circumference = 2 * Math.PI * r;
    const dashOffset = circumference * fraction; // full circle = maxMinutes, lower = closer to breach

    const color = isCritical ? '#ef4444' : isUrgent ? '#f59e0b' : '#8b5cf6';
    const bgColor = isCritical ? 'rgba(239,68,68,0.1)' : isUrgent ? 'rgba(245,158,11,0.1)' : 'rgba(139,92,246,0.1)';
    const borderColor = isCritical ? 'border-red-200' : isUrgent ? 'border-amber-200' : 'border-violet-200';
    const textColor = isCritical ? 'text-red-600' : isUrgent ? 'text-amber-600' : 'text-violet-600';

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`flex items-center gap-3 px-3 py-2 rounded-xl border ${borderColor}`}
            style={{ backgroundColor: bgColor }}
        >
            <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
                <svg
                    width={size}
                    height={size}
                    viewBox={`0 0 ${size} ${size}`}
                    style={{ transform: 'rotate(-90deg)' }}
                >
                    {/* Track */}
                    <circle
                        cx={size / 2}
                        cy={size / 2}
                        r={r}
                        fill="none"
                        stroke="hsl(var(--border))"
                        strokeWidth={strokeWidth}
                    />
                    {/* Countdown arc — starts full, shrinks as time runs out */}
                    <circle
                        cx={size / 2}
                        cy={size / 2}
                        r={r}
                        fill="none"
                        stroke={color}
                        strokeWidth={strokeWidth}
                        strokeLinecap="round"
                        strokeDasharray={circumference}
                        strokeDashoffset={dashOffset}
                        style={{ transition: 'stroke-dashoffset 1s ease' }}
                    />
                </svg>

                {/* Centre content */}
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    {isCritical ? (
                        <motion.span
                            animate={{ opacity: [1, 0.4, 1] }}
                            transition={{ repeat: Infinity, duration: 1 }}
                            className={`text-lg font-bold tabular-nums ${textColor}`}
                        >
                            {clamped}
                        </motion.span>
                    ) : (
                        <span className={`text-lg font-bold tabular-nums ${textColor}`}>{clamped}</span>
                    )}
                    <span className={`text-[9px] ${textColor} opacity-70`}>min</span>
                </div>
            </div>

            <div>
                <p className={`text-xs font-semibold ${textColor}`}>⏱ Time to Threshold</p>
                <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">
                    {isCritical
                        ? 'Breach imminent — alert staff now'
                        : isUrgent
                            ? 'Approaching critical range'
                            : 'Early deterioration detected'}
                </p>
                <p className="text-[10px] text-muted-foreground/60 mt-1 italic">
                    AI estimate — verify clinically
                </p>
            </div>
        </motion.div>
    );
}
