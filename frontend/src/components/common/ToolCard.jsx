import React from 'react';
import { ArrowRight, Lock } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function ToolCard({
  variant = 'tile',
  tool,
  onClick,
}) {
  const {
    id,
    number,
    title,
    verb,
    description,
    to = '#',
    icon: Icon,
    tint,
    badgeText,
    requiresAuth,
  } = tool;

  // Variant A: Large Folder-Tab Tile (Merge, Split, Compress, Protect)
  if (variant === 'tile') {
    return (
      <Link
        to={to}
        onClick={onClick}
        className="group relative flex flex-col justify-between p-5 rounded-md border border-rule bg-vellum transition-all duration-150 hover:-translate-y-0.5 hover:shadow-ink-lift hover:border-rule-strong focus:outline-none focus:ring-2 focus:ring-cyan"
        style={{
          borderTopColor: tint || 'var(--rule)',
          borderTopWidth: '3px',
        }}
      >
        {/* Subtle peeling corner effect in top right */}
        <div className="absolute top-0 right-0 w-4 h-4 overflow-hidden pointer-events-none">
          <div
            className="w-6 h-6 -mr-3 -mt-3 transform rotate-45 border-l border-b border-rule bg-paper transition-transform duration-150 group-hover:scale-110"
            aria-hidden="true"
          />
        </div>

        <div>
          {/* Header row: Number + Verb + Icon */}
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-rule">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-semibold text-ink-soft tracking-mono">
                {number}
              </span>
              <span
                className="text-[10px] font-mono tracking-mono uppercase px-1.5 py-0.5 rounded border border-rule text-ink font-medium"
                style={{ backgroundColor: tint || 'var(--kraft)' }}
              >
                {verb}
              </span>
            </div>

            <div className="w-8 h-8 rounded border border-rule bg-paper flex items-center justify-center text-ink shrink-0 group-hover:border-ink transition-colors">
              {Icon && (
                <Icon
                  className={`w-4 h-4 transition-transform duration-200 ${
                    id === 'rotate'
                      ? 'group-hover:rotate-90'
                      : id === 'compress'
                      ? 'group-hover:scale-90'
                      : id === 'merge'
                      ? 'group-hover:-translate-y-0.5'
                      : 'group-hover:scale-105'
                  }`}
                  strokeWidth={1.5}
                />
              )}
            </div>
          </div>

          <h3 className="font-display text-lg tracking-tight text-ink group-hover:text-red transition-colors">
            {title}
          </h3>
          <p className="mt-1 text-xs text-ink-soft leading-relaxed">
            {description}
          </p>
        </div>

        {/* Footer row */}
        <div className="mt-5 pt-3 border-t border-rule flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {requiresAuth ? (
              <span className="inline-flex items-center text-[10px] font-mono tracking-mono text-ink-soft">
                <Lock className="w-2.5 h-2.5 mr-1 text-ink-faint" /> VAULT
              </span>
            ) : (
              <span className="text-[10px] font-mono tracking-mono uppercase text-ink-faint">
                {badgeText || 'Bench'}
              </span>
            )}
          </div>

          <span className="inline-flex items-center text-xs font-medium text-ink group-hover:text-red transition-colors">
            <span>Open</span>
            <ArrowRight className="w-3.5 h-3.5 ml-1 transition-transform duration-120 group-hover:translate-x-1" strokeWidth={1.5} />
          </span>
        </div>
      </Link>
    );
  }

  // Variant B: Table-of-Contents List Item with Dotted Leaders
  return (
    <Link
      to={to}
      onClick={onClick}
      className="group flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded border border-rule bg-vellum hover:bg-kraft/40 hover:border-rule-strong transition-all duration-120 focus:outline-none focus:ring-2 focus:ring-cyan"
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <span className="font-mono text-xs font-semibold text-ink-faint tracking-mono shrink-0 w-6">
          {number}
        </span>

        <div className="w-7 h-7 rounded border border-rule bg-paper flex items-center justify-center text-ink shrink-0 group-hover:border-ink transition-colors">
          {Icon && <Icon className="w-3.5 h-3.5" strokeWidth={1.5} />}
        </div>

        <div className="flex items-baseline gap-2 min-w-0 shrink-0">
          <span className="text-sm font-semibold text-ink group-hover:text-red transition-colors truncate">
            {title}
          </span>
          <span className="text-[10px] font-mono tracking-mono uppercase px-1 py-0.2 rounded bg-kraft/80 text-ink-soft border border-rule shrink-0">
            {verb}
          </span>
        </div>

        {/* Dotted Leader */}
        <span className="hidden md:inline-block flex-1 border-b border-dotted border-rule-strong mx-3" />

        <p className="text-xs text-ink-soft truncate max-w-sm hidden lg:block">
          {description}
        </p>
      </div>

      <div className="flex items-center justify-between sm:justify-end gap-3 mt-2 sm:mt-0 shrink-0 sm:pl-3">
        {requiresAuth && (
          <span className="inline-flex items-center text-[10px] font-mono tracking-mono text-ink-faint">
            <Lock className="w-2.5 h-2.5 mr-1" /> VAULT
          </span>
        )}
        <div className="inline-flex items-center text-xs font-medium text-ink-soft group-hover:text-red transition-colors">
          <ArrowRight className="w-3.5 h-3.5 transition-transform duration-120 group-hover:translate-x-1" strokeWidth={1.5} />
        </div>
      </div>
    </Link>
  );
}
