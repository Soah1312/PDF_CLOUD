import React from 'react';
import { Cloud, Database, Lock, Server, Cpu } from 'lucide-react';

export const Footer = () => {
  return (
    <footer className="border-t border-slate-900 bg-slate-950 py-10 mt-auto text-slate-500 text-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex flex-col items-center md:items-start space-y-1">
          <div className="flex items-center space-x-2 text-slate-400 font-medium">
            <span>CloudPDF Studio</span>
            <span>•</span>
            <span className="text-indigo-400">AWS Cloud Edition</span>
          </div>
          <p className="text-slate-500 text-[11px]">
            Enterprise-grade cloud PDF automation with Dual-Access authentication and forensic watermarking.
          </p>
        </div>

        {/* Cloud Architecture Badges */}
        <div className="flex flex-wrap items-center justify-center gap-3">
          <div className="flex items-center px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800 text-[11px] text-slate-400">
            <Server className="w-3.5 h-3.5 mr-1.5 text-emerald-400" />
            FastAPI Backend
          </div>
          <div className="flex items-center px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800 text-[11px] text-slate-400">
            <Database className="w-3.5 h-3.5 mr-1.5 text-sky-400" />
            PostgreSQL (RDS)
          </div>
          <div className="flex items-center px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800 text-[11px] text-slate-400">
            <Cloud className="w-3.5 h-3.5 mr-1.5 text-amber-400" />
            Amazon S3 & SSM
          </div>
          <div className="flex items-center px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800 text-[11px] text-slate-400">
            <Lock className="w-3.5 h-3.5 mr-1.5 text-purple-400" />
            Cognito User Pools
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;

