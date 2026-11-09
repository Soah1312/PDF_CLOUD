import React from 'react';
import { ArrowRight, ChevronRight, Lock } from 'lucide-react';
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

  const handleClick = (e) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(10);
    }
    if (onClick) onClick(e);
  };

  // Variant A: Primary Bench Tool Tile (140px tall, tinted top band, 28px icon, Gloock 20px name, mono sub-tag, 13px description)
  if (variant === 'tile') {
    return (
      <Link
        to={to}
        onClick={handleClick}
        className="group relative flex flex-col justify-between p-3 sm:p-4 rounded-[6px] border border-rule bg-vellum h-[140px] sm:h-[155px] overflow-hidden select-none active:translate-y-0.5 active:scale-[0.98] transition-transform duration-100 focus:outline-none focus:ring-2 focus:ring-cyan shadow-[0_1px_2px_rgba(36,27,20,0.03)]"
      >
        {/* Tinted top band using tool's tint */}
        <div
          className="absolute top-0 left-0 right-0 h-1"
          style={{ backgroundColor: tint || 'var(--rule)' }}
          aria-hidden="true"
        />

        {/* Top row: 28px icon + Mono sub-tag */}
        <div className="flex items-center justify-between pt-1">
          <div className="w-8 h-8 rounded border border-rule bg-paper flex items-center justify-center text-ink shrink-0">
            {Icon && (
              <Icon
                className="w-7 h-7 text-ink"
                strokeWidth={1.5}
              />
            )}
          </div>

          <span
            className="text-[10px] font-mono tracking-mono uppercase px-1.5 py-0.5 rounded border border-rule text-ink font-semibold shrink-0"
            style={{ backgroundColor: tint || 'var(--kraft)' }}
          >
            {verb}
          </span>
        </div>

        {/* Middle/Bottom: Gloock 20px name + 1-line 13px description */}
        <div className="min-w-0">
          <h3 className="font-display text-[19px] sm:text-[20px] text-ink leading-tight truncate">
            {title}
          </h3>
          <p className="text-[13px] text-ink-soft truncate leading-tight mt-0.5">
            {description}
          </p>
        </div>
      </Link>
    );
  }

  // Variant B: Table-of-Contents List Item (56px tall row, mono number, name, dotted leader, 13px description, chevron)
  return (
    <Link
      to={to}
      onClick={handleClick}
      className="group flex items-center justify-between px-3 sm:px-4 py-2 rounded-[6px] border border-rule bg-vellum active:bg-kraft/50 active:scale-[0.99] transition-transform duration-100 focus:outline-none focus:ring-2 focus:ring-cyan min-h-[56px] select-none"
    >
      <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
        {/* Mono number */}
        <span className="font-mono text-xs font-semibold text-ink-faint tracking-mono shrink-0 w-6">
          {number}
        </span>

        {/* Tool Icon */}
        <div className="w-7 h-7 rounded border border-rule bg-paper flex items-center justify-center text-ink shrink-0">
          {Icon && <Icon className="w-4 h-4 text-ink-soft group-hover:text-ink" strokeWidth={1.5} />}
        </div>

        {/* Title + Sub-tag */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-semibold text-ink group-hover:text-red transition-colors truncate">
            {title}
          </span>
          <span
            className="text-[10px] font-mono tracking-mono uppercase px-1.5 py-0.5 rounded border border-rule text-ink-soft shrink-0"
            style={{ backgroundColor: tint ? `${tint}66` : 'var(--kraft)' }}
          >
            {verb}
          </span>
        </div>

        {/* Dotted Leader */}
        <span className="hidden sm:inline-block flex-1 border-b border-dotted border-rule-strong mx-3" />

        {/* 13px description (hidden at phone widths / 360px per spec) */}
        <p className="text-[13px] text-ink-soft truncate max-w-xs hidden sm:block">
          {description}
        </p>
      </div>

      <div className="flex items-center gap-2 shrink-0 pl-2">
        {requiresAuth && (
          <span className="inline-flex items-center text-[10px] font-mono tracking-mono text-ink-faint">
            <Lock className="w-3 h-3 mr-1" strokeWidth={1.5} /> VAULT
          </span>
        )}
        <div className="w-6 h-6 flex items-center justify-center text-ink-soft group-hover:text-red transition-colors">
          <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" strokeWidth={1.5} />
        </div>
      </div>
    </Link>
  );
}
