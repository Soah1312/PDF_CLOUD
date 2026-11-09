import React from 'react';
import { ArrowRight, Lock } from 'lucide-react';
import { Link } from 'react-router-dom';

const THEMES = {
  amber: {
    iconBg: 'bg-amber-500/10 border-amber-500/25 text-amber-400 group-hover:bg-amber-500/20 group-hover:border-amber-500/50 group-hover:text-amber-300',
    borderHover: 'hover:border-amber-500/40 hover:shadow-amber-500/5',
    badge: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  },
  emerald: {
    iconBg: 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400 group-hover:bg-emerald-500/20 group-hover:border-emerald-500/50 group-hover:text-emerald-300',
    borderHover: 'hover:border-emerald-500/40 hover:shadow-emerald-500/5',
    badge: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  },
  sky: {
    iconBg: 'bg-sky-500/10 border-sky-500/25 text-sky-400 group-hover:bg-sky-500/20 group-hover:border-sky-500/50 group-hover:text-sky-300',
    borderHover: 'hover:border-sky-500/40 hover:shadow-sky-500/5',
    badge: 'bg-sky-500/10 text-sky-300 border-sky-500/30',
  },
  blue: {
    iconBg: 'bg-blue-500/10 border-blue-500/25 text-blue-400 group-hover:bg-blue-500/20 group-hover:border-blue-500/50 group-hover:text-blue-300',
    borderHover: 'hover:border-blue-500/40 hover:shadow-blue-500/5',
    badge: 'bg-blue-500/10 text-blue-300 border-blue-500/30',
  },
  violet: {
    iconBg: 'bg-violet-500/10 border-violet-500/25 text-violet-400 group-hover:bg-violet-500/20 group-hover:border-violet-500/50 group-hover:text-violet-300',
    borderHover: 'hover:border-violet-500/40 hover:shadow-violet-500/5',
    badge: 'bg-violet-500/10 text-violet-300 border-violet-500/30',
  },
  rose: {
    iconBg: 'bg-rose-500/10 border-rose-500/25 text-rose-400 group-hover:bg-rose-500/20 group-hover:border-rose-500/50 group-hover:text-rose-300',
    borderHover: 'hover:border-rose-500/40 hover:shadow-rose-500/5',
    badge: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
  },
  neutral: {
    iconBg: 'bg-white/5 border-white/10 text-[#E8E8E3] group-hover:bg-white/10 group-hover:text-white',
    borderHover: 'hover:border-white/25 hover:shadow-white/5',
    badge: 'bg-white/5 text-[#9E9E98] border-white/10',
  },
};

export const ToolCard = ({
  icon: Icon,
  title,
  description,
  badgeText,
  color = 'neutral',
  requiresAuth = false,
  to = '#',
}) => {
  const t = THEMES[color] || THEMES.neutral;

  return (
    <Link
      to={to}
      className={`group relative flex flex-col justify-between p-5 rounded-2xl bg-[#121214] border border-white/10 ${t.borderHover} hover:bg-[#151518] hover:shadow-xl transition-all duration-200 hover:-translate-y-1 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40`}
    >
      <div>
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-white/5">
          <div
            className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-all duration-200 group-hover:scale-105 ${t.iconBg}`}
          >
            {Icon && <Icon className="w-4 h-4 stroke-[1.8]" />}
          </div>
          <div className="flex items-center space-x-1.5">
            {requiresAuth && (
              <span className="inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/5 text-[#E8E8E3] border border-white/10">
                <Lock className="w-2.5 h-2.5 mr-1 text-[#9E9E98]" /> Member
              </span>
            )}
            {badgeText && (
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${t.badge}`}>
                {badgeText}
              </span>
            )}
          </div>
        </div>

        <h3 className="text-sm font-semibold tracking-tight text-white group-hover:text-[#FAFAFA] transition-colors">
          {title}
        </h3>
        <p className="mt-1.5 text-xs text-[#9E9E98] leading-relaxed">
          {description}
        </p>
      </div>

      <div className="mt-5 pt-3 border-t border-white/5 flex items-center justify-between">
        <span className="text-[11px] text-[#666662]">
          {requiresAuth ? 'Requires sign in' : 'No sign-in required'}
        </span>
        <span className="inline-flex items-center text-xs font-medium text-[#E8E8E3] group-hover:translate-x-1 transition-transform duration-150">
          Open <ArrowRight className="w-3 h-3 ml-1 stroke-[2.2]" />
        </span>
      </div>
    </Link>
  );
};

export default ToolCard;
