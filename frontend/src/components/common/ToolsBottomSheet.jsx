import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, ArrowRight, ShieldCheck, Workflow, Archive } from 'lucide-react';
import { BINDERY_TOOLS } from '../../config/tools';

export default function ToolsBottomSheet({ isOpen, onClose }) {
  const navigate = useNavigate();
  const sheetRef = useRef(null);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const toolGroups = [
    {
      name: 'Assembly & Page Craft',
      tools: BINDERY_TOOLS.filter((t) => t.group === 'Merge & Split'),
    },
    {
      name: 'Press & Optimize',
      tools: BINDERY_TOOLS.filter((t) => t.group === 'Compress'),
    },
    {
      name: 'Formats & Conversion',
      tools: BINDERY_TOOLS.filter((t) => t.group === 'Convert'),
    },
    {
      name: 'Security & Forensics',
      tools: BINDERY_TOOLS.filter((t) => t.group === 'Security'),
    },
    {
      name: 'Automation',
      tools: BINDERY_TOOLS.filter((t) => t.group === 'Automate'),
    },
  ];

  const handleSelect = (to) => {
    onClose();
    navigate(to);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end bg-ink/40 backdrop-blur-sm transition-opacity duration-200"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="All Bench Tools"
    >
      <div
        ref={sheetRef}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-h-[88dvh] bg-vellum border-t border-rule rounded-t-xl shadow-ink-drag flex flex-col animate-sheet-up overflow-hidden pb-safe"
      >
        {/* Drag Handle & Header */}
        <div className="pt-3 pb-2 px-4 border-b border-rule bg-paper/80 flex items-center justify-between shrink-0">
          <div className="flex-1">
            <div className="w-10 h-1 rounded-full bg-rule-strong mx-auto mb-2" />
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-lg text-ink">Bench Tools Index</h2>
                <p className="text-[11px] font-mono text-ink-soft">
                  Select an operation to open on the workbench
                </p>
              </div>
              <button
                onClick={onClose}
                className="p-2 -mr-2 rounded text-ink-soft hover:text-ink touch-target flex items-center justify-center"
                aria-label="Close tools sheet"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Scrollable Tools List */}
        <div className="overflow-y-auto p-4 space-y-6 overscroll-contain flex-1">
          {toolGroups.map((group) => (
            <div key={group.name} className="space-y-2">
              <span className="text-[10px] font-mono uppercase tracking-mono text-ink-faint block pb-1 border-b border-rule/60">
                {group.name}
              </span>

              <div className="space-y-1.5">
                {group.tools.map((tool) => {
                  const Icon = tool.icon;
                  return (
                    <button
                      key={tool.id}
                      onClick={() => handleSelect(tool.to)}
                      className="w-full flex items-center justify-between p-3 rounded border border-rule bg-paper hover:bg-kraft active:bg-kraft/80 text-left transition-colors touch-target focus:outline-none"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div
                          className="w-8 h-8 rounded border border-rule flex items-center justify-center text-ink shrink-0"
                          style={{ backgroundColor: tool.tint || 'var(--kraft)' }}
                        >
                          <Icon className="w-4 h-4" strokeWidth={1.5} />
                        </div>
                        <div className="truncate">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-semibold text-ink truncate">
                              {tool.title}
                            </span>
                            <span className="text-[9px] font-mono tracking-mono uppercase px-1 py-0.2 rounded bg-kraft border border-rule text-ink-soft">
                              {tool.verb}
                            </span>
                          </div>
                          <p className="text-[10px] text-ink-soft truncate mt-0.5">
                            {tool.description}
                          </p>
                        </div>
                      </div>

                      <ArrowRight className="w-4 h-4 text-ink-faint shrink-0 ml-2" />
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

