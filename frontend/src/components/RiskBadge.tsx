import { motion } from 'framer-motion';
import type { RiskLevel, AlertSeverity } from '@/types/database';

type Level = RiskLevel | AlertSeverity;

const config: Record<Level, { bg: string; text: string; pulse?: boolean }> = {
  low: { bg: 'bg-risk-low-bg', text: 'text-risk-low-text' },
  medium: { bg: 'bg-risk-medium-bg', text: 'text-risk-medium-text' },
  high: { bg: 'bg-risk-high-bg', text: 'text-risk-high-text' },
  critical: { bg: 'bg-risk-critical-bg', text: 'text-risk-critical-text', pulse: true },
};

export default function RiskBadge({ level, label }: { level: Level; label?: string }) {
  const c = config[level] || config.low;
  return (
    <motion.span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold capitalize ${c.bg} ${c.text} ${c.pulse ? 'pulse-critical' : ''}`}
      initial={{ scale: 0.9 }}
      animate={{ scale: 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 20 }}
    >
      {label || level}
    </motion.span>
  );
}
