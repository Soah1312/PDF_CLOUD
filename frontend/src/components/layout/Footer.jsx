import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Volume2, VolumeX } from 'lucide-react';
import binderyAudio from '../../utils/audio';
import { motionBus } from '../../utils/motion';

export default function Footer() {
  const [audioEnabled, setAudioEnabled] = useState(() => binderyAudio.isEnabled());

  useEffect(() => {
    return motionBus.on('audio:state', (enabled) => {
      setAudioEnabled(enabled);
    });
  }, []);

  const handleToggleAudio = () => {
    const nextState = binderyAudio.toggle();
    setAudioEnabled(nextState);
  };

  return (
    <footer className="border-t border-rule bg-vellum py-10 mt-auto text-ink-soft text-xs relative z-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 pb-6 border-b border-rule">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded border border-ink bg-paper flex items-center justify-center shrink-0">
              <svg
                viewBox="0 0 24 24"
                className="w-3.5 h-3.5 text-ink"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
            </div>
            <div>
              <span className="font-display text-sm tracking-tight text-ink font-semibold">
                CloudPDF Studio
              </span>
              <span className="text-[11px] font-mono text-ink-soft ml-2">
                — The Bindery [Rev 3.0]
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-6 text-xs font-mono">
            <Link to="/" className="ink-link-hover hover:text-ink transition-colors">
              Bench Index
            </Link>
            <Link to="/tools/merge" className="ink-link-hover hover:text-ink transition-colors">
              Merge
            </Link>
            <Link to="/tools/compress" className="ink-link-hover hover:text-ink transition-colors">
              Compress
            </Link>
            <Link to="/workflows" className="ink-link-hover hover:text-ink transition-colors">
              Pipelines
            </Link>
            <Link to="/workspace" className="ink-link-hover hover:text-ink transition-colors">
              Cloud Vault
            </Link>

            {/* Craftsman Mechanical Audio Toggle (OFF by default, persisted in localStorage) */}
            <button
              type="button"
              onClick={handleToggleAudio}
              className={`flex items-center gap-1.5 px-2 py-1 rounded border transition-colors select-none ${
                audioEnabled
                  ? 'bg-paper border-rule text-ink shadow-xs'
                  : 'bg-transparent border-rule/60 text-ink-faint hover:text-ink-soft'
              }`}
              title={`Acoustic feedback is ${audioEnabled ? 'ON' : 'OFF'} (paper snap & thunk)`}
              aria-label="Toggle craftsman paper acoustics"
            >
              {audioEnabled ? (
                <Volume2 className="w-3.5 h-3.5 text-red" />
              ) : (
                <VolumeX className="w-3.5 h-3.5 text-ink-faint" />
              )}
              <span className="text-[10px] uppercase tracking-mono">
                {audioEnabled ? 'Audio: ON' : 'Audio: OFF'}
              </span>
            </button>
          </div>
        </div>

        <div className="pt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-[11px] font-mono text-ink-faint">
          <div>
            Zero telemetry. Stateless volatile execution. Guest documents purged from RAM immediately upon handoff.
          </div>
          <div>
            AES-256 Vault Encryption • SHA-256 Forensic Canary Ledger
          </div>
        </div>
      </div>
    </footer>
  );
}
