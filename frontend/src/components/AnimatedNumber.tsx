import { useEffect, useRef, useState } from 'react';
import { motion, useSpring, useTransform } from 'framer-motion';

interface AnimatedNumberProps {
  value: number;
  precision?: number;
  duration?: number;
  className?: string;
  style?: React.CSSProperties;
}

export default function AnimatedNumber({ value, precision = 0, duration = 0.8, className, style }: AnimatedNumberProps) {
  const spring = useSpring(value, { stiffness: 100, damping: 30, duration: duration * 1000 });
  const display = useTransform(spring, (v: number) => v.toFixed(precision));
  const [displayValue, setDisplayValue] = useState(value.toFixed(precision));
  const initialized = useRef(false);

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      spring.set(value);
      setDisplayValue(value.toFixed(precision));
      return;
    }
    spring.set(value);
  }, [value, spring, precision]);

  useEffect(() => {
    const unsubscribe = display.on('change', (v) => {
      setDisplayValue(v);
    });
    return unsubscribe;
  }, [display]);

  return (
    <motion.span className={className} style={style}>
      {displayValue}
    </motion.span>
  );
}
