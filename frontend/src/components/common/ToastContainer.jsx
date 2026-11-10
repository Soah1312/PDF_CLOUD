import React, { useState, useEffect, useRef } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { motionBus } from '../../utils/motion';

/**
 * ToastManager / ToastContainer — Paper-Slip Style
 * Features:
 * - Print-shop ticket / paper-slip card
 * - Spring entrance
 * - Thin red timer line at the bottom
 * - Pause countdown on hover
 * - Swipe to dismiss on touch (touchmove deltaX)
 */

export function showToast(msg, type = 'info', duration = 4000) {
  motionBus.emit('toast', { id: Date.now() + Math.random(), msg, type, duration });
}

export default function ToastContainer() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    return motionBus.on('toast', (newToast) => {
      setToasts((prev) => [...prev, newToast]);
    });
  }, []);

  const removeToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <div
      aria-live="polite"
      className="fixed bottom-20 sm:bottom-6 right-4 sm:right-6 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={() => removeToast(toast.id)} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }) {
  const [progress, setProgress] = useState(100);
  const [isPaused, setIsPaused] = useState(false);
  const [touchStartX, setTouchStartX] = useState(null);
  const [swipeOffset, setSwipeOffset] = useState(0);

  const duration = toast.duration || 4000;
  const remainingRef = useRef(duration);
  const lastTickRef = useRef(Date.now());

  useEffect(() => {
    if (isPaused) return;

    lastTickRef.current = Date.now();
    const interval = setInterval(() => {
      const now = Date.now();
      const delta = now - lastTickRef.current;
      lastTickRef.current = now;

      remainingRef.current = Math.max(0, remainingRef.current - delta);
      setProgress((remainingRef.current / duration) * 100);

      if (remainingRef.current <= 0) {
        clearInterval(interval);
        onDismiss();
      }
    }, 50);

    return () => clearInterval(interval);
  }, [isPaused, duration, onDismiss]);

  // Touch Swipe to dismiss
  const handleTouchStart = (e) => {
    setTouchStartX(e.touches[0].clientX);
  };

  const handleTouchMove = (e) => {
    if (touchStartX === null) return;
    const currentX = e.touches[0].clientX;
    const deltaX = currentX - touchStartX;
    if (deltaX > 0) {
      setSwipeOffset(deltaX);
    }
  };

  const handleTouchEnd = () => {
    if (swipeOffset > 80) {
      onDismiss();
    } else {
      setSwipeOffset(0);
    }
    setTouchStartX(null);
  };

  return (
    <div
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{
        transform: `translateX(${swipeOffset}px)`,
        transition: swipeOffset > 0 ? 'none' : 'transform 200ms cubic-bezier(0.2, 0.8, 0.2, 1)',
      }}
      className="pointer-events-auto relative overflow-hidden p-3.5 sm:p-4 rounded-[6px] border border-rule bg-vellum shadow-ink-drag text-ink select-none animate-sheet-up transition-opacity duration-200"
    >
      {/* Corner Crop Marks for Paper-slip character */}
      <span className="absolute top-1 left-1 font-mono text-[9px] text-rule-strong select-none leading-none" aria-hidden="true">+</span>
      <span className="absolute top-1 right-1 font-mono text-[9px] text-rule-strong select-none leading-none" aria-hidden="true">+</span>

      <div className="flex items-start gap-3">
        {toast.type === 'success' ? (
          <CheckCircle2 className="w-4 h-4 text-moss shrink-0 mt-0.5" strokeWidth={2} />
        ) : toast.type === 'error' ? (
          <AlertCircle className="w-4 h-4 text-red shrink-0 mt-0.5" strokeWidth={2} />
        ) : (
          <Info className="w-4 h-4 text-ink-soft shrink-0 mt-0.5" strokeWidth={2} />
        )}

        <div className="flex-1 min-w-0 pr-2">
          <p className="text-xs font-semibold text-ink leading-tight">
            {toast.title || (toast.type === 'error' ? 'Bench Notice' : 'Folio Status')}
          </p>
          <p className="text-[11px] text-ink-soft mt-0.5 leading-snug">
            {toast.msg}
          </p>
        </div>

        <button
          onClick={onDismiss}
          className="text-ink-faint hover:text-ink p-1 rounded transition-colors touch-target -mr-1 -mt-1"
          aria-label="Dismiss toast"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Thin Red Timer Line at the Bottom */}
      <div className="absolute bottom-0 inset-x-0 h-[2px] bg-rule/40 overflow-hidden">
        <div
          className="h-full bg-red transition-all duration-75 ease-linear"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
