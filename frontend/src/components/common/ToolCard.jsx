import React, { useRef } from 'react';
import { ArrowRight, ChevronRight, Lock, Scissors, Layers, Minimize2 } from 'lucide-react';
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

  const tileRef = useRef(null);

  const handleClick = (e) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(10);
    }
    if (onClick) onClick(e);
  };

  const handlePointerMove = (e) => {
    if (tileRef.current && window.matchMedia && window.matchMedia('(pointer: fine)').matches) {
      const rect = tileRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      tileRef.current.style.setProperty('--mx', `${x}px`);
      tileRef.current.style.setProperty('--my', `${y}px`);
    }
  };

  // Dedicated motion styling for specific tool icons on hover
  const renderToolIcon = () => {
    if (id === 'merge') {
      // Two sheets slide together
      return (
        <div className="relative w-6 h-6 flex items-center justify-center overflow-hidden">
          <div className="absolute w-3.5 h-4.5 rounded-[2px] border border-ink bg-kraft transition-transform duration-200 ease-out -translate-x-1 group-hover:translate-x-0" />
          <div className="absolute w-3.5 h-4.5 rounded-[2px] border border-ink bg-vellum transition-transform duration-200 ease-out translate-x-1 group-hover:translate-x-0 shadow-xs" />
        </div>
      );
    }
    if (id === 'split') {
      // Rotates 90 degrees
      return (
        <Scissors
          className="w-5 h-5 text-ink transition-transform duration-200 ease-out group-hover:rotate-90 origin-center"
          strokeWidth={1.75}
        />
      );
    }
    if (id === 'compress') {
      // Pinches inward
      return (
        <Minimize2
          className="w-5 h-5 text-ink transition-transform duration-200 ease-out group-hover:scale-75 origin-center"
          strokeWidth={1.75}
        />
      );
    }
    if (id === 'protect') {
      // Shackle closes / lock settles
      return (
        <Lock
          className="w-5 h-5 text-ink transition-transform duration-200 ease-out group-hover:-translate-y-0.5 group-hover:scale-105"
          strokeWidth={1.75}
        />
      );
    }
    return Icon ? (
      <Icon
        className="w-5 h-5 text-ink transition-transform duration-200 ease-out group-hover:scale-110 group-hover:rotate-3"
        strokeWidth={1.75}
      />
    ) : null;
  };

  // Variant A: Primary Bench Tool Tile
  if (variant === 'tile') {
    return (
      <Link
        ref={tileRef}
        to={to}
        onClick={handleClick}
        onPointerMove={handlePointerMove}
        className="tool-card-bench group relative flex flex-col justify-between p-3 sm:p-4 rounded-[6px] border border-rule bg-vellum h-[140px] sm:h-[155px] overflow-hidden select-none active:translate-y-0.5 active:scale-[0.98] transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-cyan shadow-[0_1px_2px_rgba(36,27,20,0.03)]"
      >
        {/* Cursor-following spotlight inside the tile (fine pointers only) */}
        <div
          className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
          style={{
            background:
              'radial-gradient(140px circle at var(--mx, -200px) var(--my, -200px), rgba(255, 255, 255, 0.5) 0%, rgba(240, 180, 41, 0.1) 45%, transparent 80%)',
          }}
          aria-hidden="true"
        />

        {/* Corner Fold Peel (pseudo-element grows 0 to 14px) */}
        <div className="tile-corner-fold" aria-hidden="true" />

        {/* Tinted top band using tool's tint */}
        <div
          className="absolute top-0 left-0 right-0 h-1"
          style={{ backgroundColor: tint || 'var(--rule)' }}
          aria-hidden="true"
        />

        {/* Top row: icon + Mono sub-tag */}
        <div className="flex items-center justify-between pt-1 relative z-10">
          <div className="w-8 h-8 rounded border border-rule bg-paper flex items-center justify-center text-ink shrink-0 shadow-xs">
            {renderToolIcon()}
          </div>

          <span
            className="text-[10px] font-mono tracking-mono uppercase px-1.5 py-0.5 rounded border border-rule text-ink font-semibold shrink-0"
            style={{ backgroundColor: tint || 'var(--kraft)' }}
          >
            {verb}
          </span>
        </div>

        {/* Middle/Bottom: Gloock 20px name + 1-line 13px description */}
        <div className="min-w-0 relative z-10">
          <h3 className="font-display text-[19px] sm:text-[20px] text-ink leading-tight truncate">
            {title}
          </h3>
          <p className="text-[13px] text-ink-soft truncate leading-tight mt-0.5 transition-all duration-200 ease-out group-hover:-translate-y-0.5 group-hover:text-ink">
            {description}
          </p>
        </div>
      </Link>
    );
  }

  // Variant B: Table-of-Contents List Item
  return (
    <Link
      to={to}
      onClick={handleClick}
      className="group flex items-center justify-between px-3 sm:px-4 py-2 rounded-[6px] border border-rule bg-vellum active:bg-kraft/50 active:scale-[0.99] transition-all duration-120 focus:outline-none focus:ring-2 focus:ring-cyan min-h-[56px] select-none"
    >
      <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
        {/* Mono number */}
        <span className="font-mono text-xs font-semibold text-ink-faint tracking-mono shrink-0 w-6">
          {number}
        </span>

        {/* Tool Icon */}
        <div className="w-7 h-7 rounded border border-rule bg-paper flex items-center justify-center text-ink shrink-0">
          {Icon && (
            <Icon
              className="w-4 h-4 text-ink-soft group-hover:text-ink transition-transform duration-200 group-hover:scale-110"
              strokeWidth={1.5}
            />
          )}
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

        {/* 13px description */}
        <p className="text-[13px] text-ink-soft truncate max-w-xs hidden sm:block transition-transform duration-200 group-hover:-translate-y-0.5">
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
