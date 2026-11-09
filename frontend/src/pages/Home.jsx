import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import ToolCard from '../components/common/ToolCard';
import {
  FileText,
  Layers,
  Fingerprint,
  Zap,
  Minimize2,
  Lock,
  ArrowRight,
  RotateCw,
  Sparkles,
  Image as ImageIcon,
  FileCode,
  FileSpreadsheet,
  UploadCloud,
  Check,
  ShieldCheck,
  Search
} from 'lucide-react';

const TOOLS = [
  {
    id: 'merge',
    title: 'Merge PDF',
    description: 'Combine multiple PDF files into a single document with custom ordering.',
    category: 'assembly',
    badgeText: 'Instant',
    color: 'amber',
    icon: Layers,
    to: '/tools/merge',
  },
  {
    id: 'split',
    title: 'Split & Extract',
    description: 'Separate specific pages, divide into chapters, or extract target ranges.',
    category: 'assembly',
    badgeText: 'Instant',
    color: 'sky',
    icon: FileText,
    to: '/tools/split',
  },
  {
    id: 'compress',
    title: 'Compress PDF',
    description: 'Downsample resolution and optimize streams for minimal file size.',
    category: 'optimize',
    badgeText: 'Optimized',
    color: 'emerald',
    icon: Minimize2,
    to: '/tools/compress',
  },
  {
    id: 'rotate',
    title: 'Rotate Pages',
    description: 'Rotate PDF pages by 90°, 180°, or 270° with full stream preservation.',
    category: 'assembly',
    badgeText: 'Instant',
    color: 'amber',
    icon: RotateCw,
    to: '/tools/rotate',
  },
  {
    id: 'protect',
    title: 'Protect & Encrypt',
    description: 'Secure sensitive documents with AES encryption and custom passwords.',
    category: 'security',
    badgeText: 'Security',
    color: 'violet',
    icon: Lock,
    to: '/tools/protect',
  },
  {
    id: 'watermark',
    title: 'Watermark PDF',
    description: 'Stamp custom text watermarks with control over opacity and angle.',
    category: 'security',
    badgeText: 'Branding',
    color: 'violet',
    icon: Sparkles,
    to: '/tools/watermark',
  },
  {
    id: 'to-images',
    title: 'PDF to Images',
    description: 'Export high-resolution PNG or JPEG images into a ZIP archive.',
    category: 'convert',
    badgeText: 'Export',
    color: 'sky',
    icon: ImageIcon,
    to: '/tools/to-images',
  },
  {
    id: 'from-images',
    title: 'Images to PDF',
    description: 'Combine JPEG and PNG image sets into standardized PDF documents.',
    category: 'convert',
    badgeText: 'Convert',
    color: 'sky',
    icon: ImageIcon,
    to: '/tools/from-images',
  },
  {
    id: 'to-word',
    title: 'PDF to Word',
    description: 'Convert PDF documents into editable Word files preserving paragraphs.',
    category: 'convert',
    badgeText: 'Editable',
    color: 'blue',
    icon: FileCode,
    to: '/tools/to-word',
  },
  {
    id: 'from-word',
    title: 'Word to PDF',
    description: 'Convert DOCX documents into clean, standardized PDF files.',
    category: 'convert',
    badgeText: 'Convert',
    color: 'blue',
    icon: FileSpreadsheet,
    to: '/tools/from-word',
  },
  {
    id: 'canary',
    title: 'Canary Watermark',
    description: 'Embed forensic zero-width steganographic tokens to identify leaks.',
    category: 'security',
    badgeText: 'Forensic',
    color: 'rose',
    icon: Fingerprint,
    requiresAuth: true,
    to: '/workspace',
  },
  {
    id: 'workflows',
    title: 'Workflow Studio',
    description: 'Design multi-step pipelines: Upload -> Watermark -> Compress -> Vault.',
    category: 'optimize',
    badgeText: 'Automated',
    color: 'emerald',
    icon: Zap,
    requiresAuth: true,
    to: '/workflows',
  },
];

const CATEGORIES = [
  { id: 'all', label: 'All Tools' },
  { id: 'assembly', label: 'Merge & Split' },
  { id: 'optimize', label: 'Compress' },
  { id: 'convert', label: 'Conversions' },
  { id: 'security', label: 'Security' },
];

export const Home = () => {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [activeCategory, setActiveCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  const filteredTools = TOOLS.filter((tool) => {
    const matchesCategory = activeCategory === 'all' || tool.category === activeCategory;
    const matchesSearch =
      tool.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tool.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer?.files?.length) {
      // Direct drag-and-drop: jump straight to merge or compress
      navigate('/tools/compress');
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0C] text-[#FAFAFA] flex flex-col pt-4 pb-16">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 w-full space-y-6">
        {/* Compact Header — Straight to the point */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pt-2 pb-2">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white flex items-center">
              <span>PDF Document Tools</span>
              <span className="ml-3 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Stateless & Private
              </span>
            </h1>
            <p className="mt-1 text-xs text-[#9E9E98]">
              Select any tool below to start processing instantly, or drag documents directly onto the page.
            </p>
          </div>

          {/* Quick Search */}
          <div className="relative w-full md:w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#666662]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tools..."
              className="w-full pl-8 pr-3 py-1.5 bg-[#121214] border border-white/10 rounded-full text-xs text-white placeholder-[#666662] focus:outline-none focus:border-white/30 transition-colors"
            />
          </div>
        </div>

        {/* Quick Drag & Drop Action Banner */}
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`rounded-2xl p-4 border border-dashed transition-all duration-200 flex flex-col sm:flex-row items-center justify-between gap-3 ${
            isDragging
              ? 'border-emerald-400 bg-emerald-500/10 scale-[1.01]'
              : 'border-white/10 bg-[#121214]/60 hover:border-white/20 hover:bg-[#141417]'
          }`}
        >
          <div className="flex items-center space-x-3 text-center sm:text-left">
            <div className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-[#E8E8E3] shrink-0">
              <UploadCloud className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-semibold text-white">
                Drag any PDF file directly into this zone
              </p>
              <p className="text-[11px] text-[#9E9E98]">
                Instant in-memory processing. Files are never stored without permission.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            <Link
              to="/tools/compress"
              className="px-3 py-1.5 rounded-full bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/25 text-xs font-medium transition-all active:scale-[0.97]"
            >
              Quick Compress
            </Link>
            <Link
              to="/tools/merge"
              className="px-3 py-1.5 rounded-full bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/25 text-xs font-medium transition-all active:scale-[0.97]"
            >
              Quick Merge
            </Link>
          </div>
        </div>

        {/* Category Filters */}
        <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 text-xs">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`px-3.5 py-1.5 rounded-full font-medium transition-all duration-150 active:scale-[0.96] shrink-0 ${
                activeCategory === cat.id
                  ? 'bg-[#E8E8E3] text-[#111113] shadow-sm font-semibold'
                  : 'bg-[#121214] text-[#9E9E98] hover:text-white border border-white/10 hover:border-white/20'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Tool Cards Grid — Right at the top, immediately visible */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5 pt-1">
          {filteredTools.map((tool) => (
            <ToolCard
              key={tool.id}
              icon={tool.icon}
              title={tool.title}
              description={tool.description}
              badgeText={tool.badgeText}
              color={tool.color}
              requiresAuth={tool.requiresAuth}
              to={tool.to}
            />
          ))}
        </div>

        {/* Compact Dual-Tier Notice at Bottom */}
        <div className="mt-8 pt-6 border-t border-white/5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-4 rounded-2xl bg-[#121214] border border-white/10 flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-white flex items-center">
                <Check className="w-3.5 h-3.5 text-emerald-400 mr-1.5" /> Guest Mode Active
              </div>
              <p className="text-[11px] text-[#9E9E98] mt-0.5">
                Instant access to all tools. No sign-in or installation required.
              </p>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-[#141417] border border-white/15 flex items-center justify-between shadow-lg shadow-black/20">
            <div>
              <div className="text-xs font-semibold text-[#E8E8E3] flex items-center">
                <ShieldCheck className="w-3.5 h-3.5 text-violet-400 mr-1.5" /> Need Cloud Storage?
              </div>
              <p className="text-[11px] text-[#9E9E98] mt-0.5">
                Unlock 500 MB cloud persistence and forensic leak tracking.
              </p>
            </div>
            {!isAuthenticated && (
              <Link
                to="/register"
                className="px-3 py-1.5 rounded-full bg-[#E8E8E3] text-[#111113] hover:bg-white text-xs font-semibold shrink-0 transition-all active:scale-[0.97]"
              >
                Sign Up Free
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;
