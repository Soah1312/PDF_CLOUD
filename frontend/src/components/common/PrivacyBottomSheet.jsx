import React, { useEffect } from 'react';
import { ShieldCheck, X, Check, Lock, Cpu } from 'lucide-react';

export default function PrivacyBottomSheet({ isOpen, onClose }) {
  // Lock body scroll when bottom sheet is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const triggerHaptic = () => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(10);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-ink/40 backdrop-blur-[2px] transition-opacity duration-200"
        onClick={() => {
          triggerHaptic();
          onClose();
        }}
        aria-hidden="true"
      />

      {/* Sheet panel */}
      <div
        className="relative z-10 w-full max-w-lg mx-auto bg-vellum border-t sm:border border-rule sm:rounded-t-xl shadow-ink-drag p-5 pb-safe animate-sheet-up"
        role="dialog"
        aria-modal="true"
        aria-labelledby="privacy-sheet-title"
      >
        {/* Grab Handle */}
        <div className="w-10 h-1 bg-rule-strong rounded-full mx-auto mb-4" />

        {/* Header */}
        <div className="flex items-start justify-between border-b border-rule pb-3 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded border border-rule bg-kraft/70 flex items-center justify-center text-moss shrink-0">
              <ShieldCheck className="w-5 h-5" strokeWidth={1.5} />
            </div>
            <div>
              <h2 id="privacy-sheet-title" className="font-display text-lg text-ink leading-tight">
                Print-Shop Privacy Guarantee
              </h2>
              <span className="font-mono text-[10px] uppercase tracking-mono text-moss font-semibold">
                Stateless • RAM-Only • Zero Retention
              </span>
            </div>
          </div>

          <button
            onClick={() => {
              triggerHaptic();
              onClose();
            }}
            className="p-2 rounded text-ink-soft hover:text-ink hover:bg-kraft/50 transition-colors touch-target flex items-center justify-center"
            aria-label="Close privacy information"
          >
            <X className="w-5 h-5" strokeWidth={1.5} />
          </button>
        </div>

        {/* Content details */}
        <div className="space-y-3.5 text-xs text-ink-soft leading-relaxed">
          <div className="flex items-start gap-2.5 p-3 rounded bg-paper border border-rule">
            <Cpu className="w-4 h-4 text-ink shrink-0 mt-0.5" strokeWidth={1.5} />
            <div>
              <p className="font-semibold text-ink">In-Memory Volatile Processing</p>
              <p className="text-[11px] text-ink-soft mt-0.5">
                Every document processed through guest bench tools resides exclusively in volatile Linux RAM (<code className="font-mono text-[10px] text-ink bg-kraft/60 px-1 py-0.2 rounded">/dev/shm</code>). No physical disk writes occur.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-2.5 p-3 rounded bg-paper border border-rule">
            <Check className="w-4 h-4 text-moss shrink-0 mt-0.5" strokeWidth={2} />
            <div>
              <p className="font-semibold text-ink">Immediate Memory Wipe</p>
              <p className="text-[11px] text-ink-soft mt-0.5">
                Upon stream download completion, the buffer is zeroed and wiped immediately. If abandoned, the job memory automatically purges within 60 seconds.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-2.5 p-3 rounded bg-paper border border-rule">
            <Lock className="w-4 h-4 text-cyan shrink-0 mt-0.5" strokeWidth={1.5} />
            <div>
              <p className="font-semibold text-ink">Optional Cloud Vault Encryption</p>
              <p className="text-[11px] text-ink-soft mt-0.5">
                Persistent storage only happens when a signed-in member explicitly clicks <span className="font-mono text-[10px] text-ink bg-kraft px-1 py-0.5 rounded">Save to Vault</span>. Files are sealed with user-isolated AES-256 keys.
              </p>
            </div>
          </div>
        </div>

        {/* Dismiss Button */}
        <div className="mt-5 pt-3 border-t border-rule">
          <button
            onClick={() => {
              triggerHaptic();
              onClose();
            }}
            className="w-full h-12 flex items-center justify-center rounded bg-ink text-vellum font-semibold text-xs transition-transform active:translate-y-0.5 shadow-ink-button"
          >
            Understood — Return to Bench
          </button>
        </div>
      </div>
    </div>
  );
}

