import React, { useState, useEffect } from 'react';
import { isReducedMotion } from '../../utils/motion';

/**
 * OdometerValue — Print-shop mechanical rolling number display
 * Features:
 * - Smoothly rolls or increments tabular-nums to target value
 * - Respects prefers-reduced-motion (renders target immediately)
 */
export default function OdometerValue({ value, duration = 400, className = '' }) {
  const numericMatch = typeof value === 'string' ? value.match(/(\d+(\.\d+)?)/) : null;
  const targetNum = typeof value === 'number' ? value : numericMatch ? parseFloat(numericMatch[0]) : null;
  const suffix = typeof value === 'string' && numericMatch ? value.replace(numericMatch[0], '') : '';
  const prefix = typeof value === 'string' && numericMatch ? value.substring(0, value.indexOf(numericMatch[0])) : '';

  const [displayNum, setDisplayNum] = useState(() => (targetNum !== null ? 0 : value));

  useEffect(() => {
    if (targetNum === null || isReducedMotion()) {
      setDisplayNum(targetNum !== null ? targetNum : value);
      return;
    }

    let start = 0;
    const startTime = performance.now();
    let animFrame = null;

    const tick = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      // Ease-out cubic: 1 - Math.pow(1 - progress, 3)
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = start + (targetNum - start) * eased;

      const isFloat = targetNum % 1 !== 0;
      setDisplayNum(isFloat ? parseFloat(current.toFixed(1)) : Math.round(current));

      if (progress < 1) {
        animFrame = requestAnimationFrame(tick);
      } else {
        setDisplayNum(targetNum);
      }
    };

    animFrame = requestAnimationFrame(tick);

    return () => {
      if (animFrame) cancelAnimationFrame(animFrame);
    };
  }, [value, targetNum, duration]);

  if (targetNum === null) {
    return <span className={`tabular-nums font-mono ${className}`}>{value}</span>;
  }

  return (
    <span className={`tabular-nums font-mono inline-block transition-transform duration-200 ${className}`}>
      {prefix}
      {displayNum}
      {suffix}
    </span>
  );
}
