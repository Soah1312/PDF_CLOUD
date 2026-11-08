import React from 'react';
import { Layers, Plus, Zap, ArrowRight, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';

export const WorkflowStudio = () => {
  const { isAuthenticated } = useAuth();

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-8 border-b border-slate-800 gap-4">
        <div>
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold mb-2">
            <Zap className="w-3.5 h-3.5" />
            <span>Automated Pipelines</span>
          </div>
          <h1 className="text-3xl font-bold text-white flex items-center">
            <Layers className="w-8 h-8 mr-3 text-indigo-400" />
            Workflow Studio
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Chain multiple PDF actions into automated, reusable cloud execution pipelines.
          </p>
        </div>

        {isAuthenticated && (
          <button className="flex items-center text-xs font-semibold px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/30 transition-all">
            <Plus className="w-4 h-4 mr-1.5" />
            Create New Pipeline
          </button>
        )}
      </div>

      {/* Guest Notice banner if unauthenticated */}
      {!isAuthenticated && (
        <div className="mt-6 p-4 rounded-xl bg-indigo-950/40 border border-indigo-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <ShieldCheck className="w-6 h-6 text-indigo-400 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-white">Member Feature: Saved Workflows</p>
              <p className="text-xs text-slate-400">
                Sign in with Amazon Cognito to design, save, and automate custom PDF pipelines.
              </p>
            </div>
          </div>
          <Link
            to="/login"
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shrink-0 transition-colors"
          >
            Sign In to Unlock
          </Link>
        </div>
      )}

      {/* Visual Pipeline Example Preview */}
      <div className="mt-8 rounded-2xl glass-panel border border-slate-800/80 bg-slate-900/50 p-8">
        <h2 className="text-lg font-bold text-white mb-2">Pre-Engineered Pipeline Templates</h2>
        <p className="text-xs text-slate-400 mb-8">
          Preview automated workflows supported by the backend <code className="bg-slate-800 px-1 py-0.5 rounded text-indigo-300">SavedWorkflow</code> schema.
        </p>

        {/* Pipeline Card: Confidential Publication */}
        <div className="p-6 rounded-xl bg-slate-950/60 border border-slate-800">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
            <div>
              <span className="text-xs font-semibold text-indigo-400 uppercase tracking-wider font-mono">
                TEMPLATE #01
              </span>
              <h3 className="text-base font-bold text-white">Confidential Document Dissemination</h3>
            </div>
            <span className="text-xs px-2.5 py-1 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-medium">
              3 Sequential Steps
            </span>
          </div>

          <p className="text-xs text-slate-400 mb-6">
            Automatically scrubs private metadata, injects an invisible forensic canary token with download telemetry, and compresses the PDF for email distribution.
          </p>

          {/* Flow Visualizer */}
          <div className="flex flex-col md:flex-row items-center gap-3 text-xs font-mono">
            <div className="w-full md:w-auto p-3 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 flex items-center">
              <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] mr-2">1</span>
              Metadata Scrub
            </div>
            <ArrowRight className="w-4 h-4 text-slate-600 rotate-90 md:rotate-0" />
            <div className="w-full md:w-auto p-3 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 flex items-center">
              <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] mr-2">2</span>
              Canary Watermark
            </div>
            <ArrowRight className="w-4 h-4 text-slate-600 rotate-90 md:rotate-0" />
            <div className="w-full md:w-auto p-3 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 flex items-center">
              <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] mr-2">3</span>
              Compress & S3 Vault
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WorkflowStudio;

