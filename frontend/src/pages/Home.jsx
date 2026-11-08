import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { checkHealth } from '../services/api';
import ToolCard from '../components/common/ToolCard';
import {
  FileText,
  Layers,
  Fingerprint,
  Zap,
  Minimize2,
  FileCheck,
  ShieldAlert,
  Sliders,
  CheckCircle2,
  XCircle,
  Database,
  Cloud,
  Lock,
  ArrowRight,
  Server,
  RotateCw,
  Sparkles,
  Image as ImageIcon,
  FileCode,
  FileSpreadsheet
} from 'lucide-react';

export const Home = () => {
  const { isAuthenticated, user } = useAuth();
  const [telemetry, setTelemetry] = useState(null);
  const [loadingHealth, setLoadingHealth] = useState(true);

  useEffect(() => {
    const fetchTelemetry = async () => {
      try {
        const data = await checkHealth();
        setTelemetry(data);
      } catch (err) {
        setTelemetry({
          status: 'degraded',
          database_connected: false,
          ssm_enabled: false,
          cognito_configured: false,
          environment: 'offline',
          region: 'unknown',
        });
      } finally {
        setLoadingHealth(false);
      }
    };
    fetchTelemetry();
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Hero Section */}
      <section className="relative overflow-hidden pt-12 pb-16 lg:pt-20 lg:pb-24 border-b border-slate-900 bg-gradient-to-b from-indigo-950/20 via-slate-950 to-slate-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto">
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold mb-6">
              <Cloud className="w-3.5 h-3.5" />
              <span>Cloud-Native PDF Processing & Automation</span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white leading-tight">
              Enterprise PDF Studio with{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-sky-400 to-indigo-300">
                Dual-Access Architecture
              </span>
            </h1>

            <p className="mt-6 text-lg text-slate-400 leading-relaxed">
              Run lightning-fast ad-hoc PDF transformations as an ephemeral guest, or sign in via{' '}
              <span className="text-white font-medium">Amazon Cognito</span> to unlock persistent cloud vaults,
              forensic invisible canary watermarking, and automated processing pipelines.
            </p>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              {isAuthenticated ? (
                <Link
                  to="/workspace"
                  className="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm shadow-lg shadow-indigo-600/30 flex items-center transition-all"
                >
                  Enter My Cloud Vault <ArrowRight className="w-4 h-4 ml-2" />
                </Link>
              ) : (
                <>
                  <Link
                    to="/register"
                    className="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm shadow-lg shadow-indigo-600/30 flex items-center transition-all"
                  >
                    Create Member Account <ArrowRight className="w-4 h-4 ml-2" />
                  </Link>
                  <a
                    href="#tools-grid"
                    className="px-6 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 font-semibold text-sm border border-slate-800 flex items-center transition-all"
                  >
                    Try Guest Tools
                  </a>
                </>
              )}
            </div>
          </div>

          {/* Cloud Telemetry Bar */}
          <div className="mt-14 max-w-4xl mx-auto p-4 rounded-2xl glass-panel border border-slate-800/80 shadow-2xl">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800/60 text-xs">
              <span className="font-semibold text-slate-300 flex items-center">
                <Server className="w-4 h-4 mr-1.5 text-indigo-400" /> Cloud Telemetry & Health Monitor
              </span>
              <span className="font-mono text-slate-500 text-[11px]">
                API: /api/health
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
              {/* PostgreSQL / RDS */}
              <div className="flex items-center space-x-2.5 p-2 rounded-lg bg-slate-900/60 border border-slate-800">
                <Database className="w-4 h-4 text-sky-400 shrink-0" />
                <div>
                  <div className="text-[10px] text-slate-500 font-mono">POSTGRESQL (RDS)</div>
                  <div className="flex items-center font-semibold mt-0.5">
                    {telemetry?.database_connected ? (
                      <span className="text-emerald-400 flex items-center">
                        <CheckCircle2 className="w-3 h-3 mr-1" /> Connected
                      </span>
                    ) : (
                      <span className="text-rose-400 flex items-center">
                        <XCircle className="w-3 h-3 mr-1" /> Disconnected
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* AWS SSM */}
              <div className="flex items-center space-x-2.5 p-2 rounded-lg bg-slate-900/60 border border-slate-800">
                <Cloud className="w-4 h-4 text-amber-400 shrink-0" />
                <div>
                  <div className="text-[10px] text-slate-500 font-mono">AWS SSM STORE</div>
                  <div className="flex items-center font-semibold mt-0.5">
                    {telemetry?.ssm_enabled ? (
                      <span className="text-emerald-400 flex items-center">
                        <CheckCircle2 className="w-3 h-3 mr-1" /> Active
                      </span>
                    ) : (
                      <span className="text-slate-400 flex items-center">
                        Local .env Mode
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Amazon Cognito */}
              <div className="flex items-center space-x-2.5 p-2 rounded-lg bg-slate-900/60 border border-slate-800">
                <Lock className="w-4 h-4 text-purple-400 shrink-0" />
                <div>
                  <div className="text-[10px] text-slate-500 font-mono">AMAZON COGNITO</div>
                  <div className="flex items-center font-semibold mt-0.5">
                    {telemetry?.cognito_configured ? (
                      <span className="text-emerald-400 flex items-center">
                        <CheckCircle2 className="w-3 h-3 mr-1" /> Configured
                      </span>
                    ) : (
                      <span className="text-amber-400 flex items-center">
                        Pending Setup
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Environment / Region */}
              <div className="flex items-center space-x-2.5 p-2 rounded-lg bg-slate-900/60 border border-slate-800">
                <Server className="w-4 h-4 text-indigo-400 shrink-0" />
                <div>
                  <div className="text-[10px] text-slate-500 font-mono">ENVIRONMENT</div>
                  <div className="font-semibold text-slate-300 mt-0.5 capitalize">
                    {telemetry?.environment || 'development'} ({telemetry?.region || 'ap-south-1'})
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Dual Access Tier Comparison */}
      <section className="py-12 bg-slate-950 border-b border-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Guest Tier */}
            <div className="p-6 rounded-2xl bg-slate-900/40 border border-slate-800 flex flex-col justify-between">
              <div>
                <div className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 mb-3">
                  Tier 1: Guest Access (No Sign In)
                </div>
                <h3 className="text-xl font-bold text-white">Instant Ad-Hoc Operations</h3>
                <p className="mt-2 text-sm text-slate-400">
                  Ideal for rapid, single-action PDF tasks without any account requirement.
                </p>

                <ul className="mt-4 space-y-2 text-xs text-slate-300">
                  <li className="flex items-center"><CheckCircle2 className="w-4 h-4 mr-2 text-emerald-400 shrink-0" /> Fast single-file processing (Merge, Split, Compress)</li>
                  <li className="flex items-center"><CheckCircle2 className="w-4 h-4 mr-2 text-emerald-400 shrink-0" /> Ephemeral session ID (Automatic expiry)</li>
                  <li className="flex items-center text-slate-500"><XCircle className="w-4 h-4 mr-2 text-slate-600 shrink-0" /> No persistent S3 document storage</li>
                  <li className="flex items-center text-slate-500"><XCircle className="w-4 h-4 mr-2 text-slate-600 shrink-0" /> No forensic canary watermark tracking</li>
                </ul>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-800">
                <span className="text-xs text-slate-500">Accessible right now from the tool grid below.</span>
              </div>
            </div>

            {/* Member Tier */}
            <div className="p-6 rounded-2xl bg-gradient-to-br from-indigo-950/40 to-slate-900/60 border border-indigo-500/30 flex flex-col justify-between shadow-lg shadow-indigo-950/30">
              <div>
                <div className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 mb-3">
                  Tier 2: Authenticated Member (Amazon Cognito)
                </div>
                <h3 className="text-xl font-bold text-white">Persistent Vault & Automation</h3>
                <p className="mt-2 text-sm text-slate-300">
                  Secured with JWT verification, persistent RDS tracking, and AWS S3 storage.
                </p>

                <ul className="mt-4 space-y-2 text-xs text-slate-200">
                  <li className="flex items-center"><CheckCircle2 className="w-4 h-4 mr-2 text-indigo-400 shrink-0" /> Persistent encrypted cloud document vault</li>
                  <li className="flex items-center"><CheckCircle2 className="w-4 h-4 mr-2 text-indigo-400 shrink-0" /> Forensic invisible canary watermark generator (Leak provenance)</li>
                  <li className="flex items-center"><CheckCircle2 className="w-4 h-4 mr-2 text-indigo-400 shrink-0" /> Visual pipeline studio & saved multi-step workflows</li>
                  <li className="flex items-center"><CheckCircle2 className="w-4 h-4 mr-2 text-indigo-400 shrink-0" /> Dedicated storage quota telemetry</li>
                </ul>
              </div>

              <div className="mt-6 pt-4 border-t border-indigo-900/60 flex items-center justify-between">
                <span className="text-xs text-indigo-300 font-medium">Free during cloud preview</span>
                {!isAuthenticated && (
                  <Link
                    to="/register"
                    className="text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 px-3.5 py-1.5 rounded-lg transition-colors"
                  >
                    Sign Up Free
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Tools Grid */}
      <section id="tools-grid" className="py-16 bg-slate-950 flex-1">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-10">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold text-white">Cloud Processing Tools</h2>
              <p className="mt-2 text-sm text-slate-400">
                Select a tool to launch immediate processing or pipeline orchestration.
              </p>
            </div>
            <div className="mt-4 md:mt-0 flex items-center space-x-2 text-xs text-slate-400">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
              <span>Available for Guests</span>
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 ml-3"></span>
              <span>Member Vault Required</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            <ToolCard
              icon={Layers}
              title="Merge PDF Documents"
              description="Combine multiple PDF files into a single, cohesive document with custom page ordering."
              badgeText="Free Guest"
              badgeColor="green"
              requiresAuth={false}
              to="/tools/merge"
            />

            <ToolCard
              icon={FileText}
              title="Split & Extract Pages"
              description="Separate specific pages, divide large documents into chapters, or extract target ranges."
              badgeText="Free Guest"
              badgeColor="green"
              requiresAuth={false}
              to="/tools/split"
            />

            <ToolCard
              icon={Minimize2}
              title="PDF Compression Engine"
              description="Downsample resolution and optimize streams for minimal file size without legibility loss."
              badgeText="Free Guest"
              badgeColor="green"
              requiresAuth={false}
              to="/tools/compress"
            />

            <ToolCard
              icon={RotateCw}
              title="Rotate PDF Pages"
              description="Rotate pages by 90°, 180°, or 270° clockwise with full structural preservation."
              badgeText="Free Guest"
              badgeColor="green"
              requiresAuth={false}
              to="/tools/rotate"
            />

            <ToolCard
              icon={Lock}
              title="Protect & Encrypt PDF"
              description="Secure sensitive documents with AES encryption and custom passwords."
              badgeText="Security"
              badgeColor="purple"
              requiresAuth={false}
              to="/tools/protect"
            />

            <ToolCard
              icon={Sparkles}
              title="Watermark PDF"
              description="Stamp custom text watermarks with control over opacity, angle, size, and placement."
              badgeText="Branding"
              badgeColor="blue"
              requiresAuth={false}
              to="/tools/watermark"
            />

            <ToolCard
              icon={ImageIcon}
              title="PDF to Images"
              description="Extract high-resolution PNG or JPEG images from all PDF pages into a ZIP archive."
              badgeText="Export"
              badgeColor="green"
              requiresAuth={false}
              to="/tools/to-images"
            />

            <ToolCard
              icon={ImageIcon}
              title="Images to PDF"
              description="Combine JPEG and PNG image sets into standardized single-file PDF documents."
              badgeText="Convert"
              badgeColor="amber"
              requiresAuth={false}
              to="/tools/from-images"
            />

            <ToolCard
              icon={FileCode}
              title="PDF to Word DOCX"
              description="Convert PDF documents into editable Word files preserving paragraphs and tables."
              badgeText="Editable"
              badgeColor="blue"
              requiresAuth={false}
              to="/tools/to-word"
            />

            <ToolCard
              icon={FileSpreadsheet}
              title="Word to PDF"
              description="Convert DOCX documents into clean, standardized PDF files via serverless engine."
              badgeText="Standard"
              badgeColor="green"
              requiresAuth={false}
              to="/tools/from-word"
            />

            <ToolCard
              icon={Fingerprint}
              title="Invisible Canary Watermark"
              description="Embed forensic zero-width steganographic tokens to identify leaked confidential PDFs."
              badgeText="Forensic Vault"
              badgeColor="purple"
              requiresAuth={true}
              to="/workspace"
            />

            <ToolCard
              icon={Zap}
              title="Automated Workflow Studio"
              description="Design multi-step pipelines: Upload -> OCR -> Watermark -> Compress -> Store in S3."
              badgeText="Automated"
              badgeColor="indigo"
              requiresAuth={true}
              to="/workflows"
            />
          </div>
        </div>
      </section>
    </div>
  );
};

export default Home;

