import React from 'react';
import { ArrowRight, Lock, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';

export const ToolCard = ({
  icon: Icon,
  title,
  description,
  badgeText,
  badgeColor = 'slate',
  requiresAuth = false,
  to = '#',
}) => {
  const badgeClasses = {
    green: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    blue: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
    purple: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    amber: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    indigo: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
    slate: 'bg-slate-800 text-slate-400 border-slate-700',
  };

  return (
    <div className="group relative flex flex-col justify-between p-6 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-indigo-500/50 hover:shadow-xl hover:shadow-indigo-500/10 transition-all duration-300">
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="w-12 h-12 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-indigo-400 group-hover:bg-indigo-600 group-hover:text-white transition-colors duration-300">
            {Icon && <Icon className="w-6 h-6" />}
          </div>
          <div className="flex items-center space-x-2">
            {requiresAuth && (
              <span className="flex items-center text-xs px-2 py-0.5 rounded-full bg-slate-800/90 text-slate-400 border border-slate-700">
                <Lock className="w-3 h-3 mr-1" /> Member
              </span>
            )}
            <span
              className={`text-xs px-2.5 py-1 rounded-full border font-medium ${
                badgeClasses[badgeColor] || badgeClasses.slate
              }`}
            >
              {badgeText}
            </span>
          </div>
        </div>

        <h3 className="text-lg font-semibold text-white group-hover:text-indigo-300 transition-colors">
          {title}
        </h3>
        <p className="mt-2 text-sm text-slate-400 leading-relaxed">
          {description}
        </p>
      </div>

      <div className="mt-6 pt-4 border-t border-slate-800/60 flex items-center justify-between">
        <span className="text-xs text-slate-500 font-mono">
          {requiresAuth ? 'Cognito Protected' : 'Guest Ready'}
        </span>
        <Link
          to={to}
          className="inline-flex items-center text-xs font-semibold text-indigo-400 hover:text-indigo-300 group-hover:translate-x-0.5 transition-all"
        >
          Launch Tool <ArrowRight className="w-3.5 h-3.5 ml-1" />
        </Link>
      </div>
    </div>
  );
};

export default ToolCard;

