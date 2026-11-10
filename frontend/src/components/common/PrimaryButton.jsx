import React, { useRef, useState, useEffect } from 'react';
import { lerp, clamp, isReducedMotion } from '../../utils/motion';

/**
 * PrimaryButton — The Bindery Craftsman Button
 * 
 * Features:
 * - Active: translateY(1px) and shadow collapse
 * - Hover (fine pointer): 600ms light sweep (skewed highlight)
 * - Desktop-only magnetic effect: translates up to 4px toward cursor within 40px buffer
 * - Ink-splat click ripple (400ms fade, contained in overflow: hidden)
 * - Morphing loading state: label slides up/out, new label slides from below, progress fill runs behind
 */
export default function PrimaryButton({
  children,
  onClick,
  disabled = false,
  loading = false,
  loadingText = 'Processing...',
  progress = null, // optional number 0-100
  className = '',
  type = 'button',
  variant = 'primary', // 'primary' (red) | 'secondary' (vellum/kraft)
  icon: Icon = null,
  ...props
}) {
  const btnRef = useRef(null);
  const [ripples, setRipples] = useState([]);
  const [magneticOffset, setMagneticOffset] = useState({ x: 0, y: 0 });

  // Desktop-only magnetic effect
  useEffect(() => {
    if (disabled || loading || typeof window === 'undefined' || isReducedMotion()) return;
    if (!window.matchMedia('(pointer: fine)').matches) return;

    const btn = btnRef.current;
    if (!btn) return;

    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;
    let animFrame = null;
    let isTracking = false;

    const updatePosition = () => {
      currentX = lerp(currentX, targetX, 0.16);
      currentY = lerp(currentY, targetY, 0.16);

      if (btn) {
        btn.style.transform = `translate3d(${currentX.toFixed(2)}px, ${currentY.toFixed(2)}px, 0)`;
      }

      if (Math.abs(targetX - currentX) > 0.05 || Math.abs(targetY - currentY) > 0.05) {
        animFrame = requestAnimationFrame(updatePosition);
      } else {
        isTracking = false;
        if (targetX === 0 && targetY === 0 && btn) {
          btn.style.transform = '';
        }
      }
    };

    const handleWindowMouseMove = (e) => {
      const rect = btn.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const buffer = 40;

      const isNearby =
        e.clientX >= rect.left - buffer &&
        e.clientX <= rect.right + buffer &&
        e.clientY >= rect.top - buffer &&
        e.clientY <= rect.bottom + buffer;

      if (isNearby) {
        const deltaX = e.clientX - centerX;
        const deltaY = e.clientY - centerY;
        targetX = clamp((deltaX / (rect.width / 2 + buffer)) * 4, -4, 4);
        targetY = clamp((deltaY / (rect.height / 2 + buffer)) * 4, -4, 4);

        if (!isTracking) {
          isTracking = true;
          animFrame = requestAnimationFrame(updatePosition);
        }
      } else if (targetX !== 0 || targetY !== 0) {
        targetX = 0;
        targetY = 0;
        if (!isTracking) {
          isTracking = true;
          animFrame = requestAnimationFrame(updatePosition);
        }
      }
    };

    window.addEventListener('mousemove', handleWindowMouseMove, { passive: true });

    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      if (animFrame) cancelAnimationFrame(animFrame);
      if (btn) btn.style.transform = '';
    };
  }, [disabled, loading]);

  // Click ripple effect
  const handlePointerDown = (e) => {
    if (disabled || loading) return;
    const btn = btnRef.current;
    if (!btn) return;

    const rect = btn.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const size = Math.max(rect.width, rect.height) * 2;
    const rippleId = Date.now() + Math.random();

    setRipples((prev) => [...prev, { id: rippleId, x, y, size }]);

    setTimeout(() => {
      setRipples((prev) => prev.filter((r) => r.id !== rippleId));
    }, 450);
  };

  const isPrimary = variant === 'primary';
  const baseClasses = isPrimary
    ? 'bg-red text-white shadow-[0_2px_0_#982c12] hover:bg-red-dark active:shadow-none'
    : 'bg-vellum border border-rule-strong text-ink shadow-[0_1px_2px_rgba(36,27,20,0.04)] hover:bg-kraft/50 active:shadow-none';

  return (
    <button
      ref={btnRef}
      type={type}
      disabled={disabled || loading}
      onClick={onClick}
      onPointerDown={handlePointerDown}
      className={`btn-sweep-container bindery-press-btn relative select-none rounded-[6px] font-medium text-sm transition-colors duration-120 focus:outline-none focus:ring-2 focus:ring-cyan ${baseClasses} ${className}`}
      {...props}
    >
      {/* Background Progress Fill during Loading */}
      {loading && (
        <span
          className="absolute inset-y-0 left-0 bg-ink/15 pointer-events-none transition-all duration-200"
          style={{ width: progress !== null ? `${progress}%` : '100%' }}
        />
      )}

      {/* Ripple Elements */}
      {ripples.map((ripple) => (
        <span
          key={ripple.id}
          className="ink-ripple"
          style={{
            left: ripple.x,
            top: ripple.y,
            width: ripple.size,
            height: ripple.size,
          }}
        />
      ))}

      {/* Button Content with Vertical Slide Label Swap for Loading */}
      <span className="relative z-10 flex items-center justify-center gap-2 w-full h-full pointer-events-none px-4 py-2.5">
        {Icon && !loading && <Icon className="w-4 h-4 shrink-0" strokeWidth={1.75} />}

        <span className="relative inline-flex flex-col overflow-hidden h-[1.3em]">
          {/* Default Label */}
          <span
            className={`transition-all duration-200 ease-out ${
              loading
                ? '-translate-y-full opacity-0 pointer-events-none'
                : 'translate-y-0 opacity-100'
            }`}
          >
            {children}
          </span>

          {/* Loading Label */}
          <span
            className={`absolute inset-0 flex items-center justify-center transition-all duration-200 ease-out ${
              loading
                ? 'translate-y-0 opacity-100'
                : 'translate-y-full opacity-0 pointer-events-none'
            }`}
          >
            {loadingText}
          </span>
        </span>
      </span>
    </button>
  );
}
