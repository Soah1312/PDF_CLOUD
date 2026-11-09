import React, { useState, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  UploadCloud,
  Search,
  FileText,
  FileCheck,
  Lock,
  Layers,
  Scissors,
  Minimize2,
  FileImage,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  X,
  FileCode,
  Camera,
} from 'lucide-react';
import { BINDERY_TOOLS, TOOL_CATEGORIES } from '../config/tools';
import ToolCard from '../components/common/ToolCard';
import { useAuth } from '../context/AuthContext';

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export default function Home() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const [activeCategory, setActiveCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  // Dropped file inspection state
  const [droppedFiles, setDroppedFiles] = useState([]);
  const [fileAnalysis, setFileAnalysis] = useState(null);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  // Four featured bench tools
  const featuredToolIds = ['merge', 'split', 'compress', 'protect'];
  const featuredTools = BINDERY_TOOLS.filter((t) => featuredToolIds.includes(t.id));

  // Remaining tools for Table of Contents
  const remainingTools = BINDERY_TOOLS.filter((t) => !featuredToolIds.includes(t.id));

  // Filter tools based on category and search
  const filteredRemainingTools = remainingTools.filter((tool) => {
    const matchesCategory =
      activeCategory === 'all' ||
      tool.category === activeCategory ||
      (activeCategory === 'assembly' && tool.group === 'Merge & Split') ||
      (activeCategory === 'security' && tool.group === 'Security') ||
      (activeCategory === 'convert' && tool.group === 'Convert');

    const matchesSearch =
      tool.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tool.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tool.verb.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesCategory && matchesSearch;
  });

  // Client-side quick inspection of dropped file
  const handleFilesChosen = async (filesList) => {
    const files = Array.from(filesList);
    if (!files.length) return;

    setDroppedFiles(files);

    if (files.length === 1) {
      const file = files[0];
      const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';
      const isImage = file.type.startsWith('image/');
      const isDocx = file.name.toLowerCase().endsWith('.docx');

      let pageCount = null;
      let isEncrypted = false;

      if (isPdf && file.size < 50 * 1024 * 1024) {
        try {
          const sliceStart = await file.slice(0, 131072).text();
          const sliceEnd = await file.slice(Math.max(0, file.size - 131072)).text();
          const combined = sliceStart + ' ' + sliceEnd;
          if (combined.includes('/Encrypt')) {
            isEncrypted = true;
          }
          const countMatch = combined.match(/\/Count\s+(\d+)/);
          if (countMatch) {
            pageCount = parseInt(countMatch[1], 10);
          } else {
            const pageMatches = combined.match(/\/Type\s*\/Page[^s]/g);
            if (pageMatches) {
              pageCount = pageMatches.length;
            }
          }
        } catch {
          // ignore parsing error
        }
      }

      setFileAnalysis({
        name: file.name,
        size: file.size,
        isPdf,
        isImage,
        isDocx,
        pageCount,
        isEncrypted,
        count: 1,
      });
    } else {
      // Multiple files dropped
      const allPdf = files.every((f) => f.name.toLowerCase().endsWith('.pdf'));
      const allImages = files.every((f) => f.type.startsWith('image/'));
      const totalSize = files.reduce((acc, f) => acc + f.size, 0);

      setFileAnalysis({
        count: files.length,
        totalSize,
        allPdf,
        allImages,
      });
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer?.files?.length) {
      handleFilesChosen(e.dataTransfer.files);
    }
  };

  const routeWithFiles = (path) => {
    navigate(path, {
      state: {
        preloadedFiles: droppedFiles,
      },
    });
  };

  const resetDroppedFiles = () => {
    setDroppedFiles([]);
    setFileAnalysis(null);
  };

  return (
    <div
      className="min-h-screen bg-paper text-ink pb-24 relative"
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.relatedTarget) {
          setIsDragging(false);
        }
      }}
      onDrop={handleDrop}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-10 sm:pt-14 space-y-12">
        {/* Editorial Masthead */}
        <div className="max-w-3xl space-y-3">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] uppercase tracking-mono text-ink-soft bg-kraft/80 border border-rule px-2 py-0.5 rounded">
              Workshop Bench
            </span>
            <span className="font-mono text-[11px] text-ink-faint">
              Stateless • In-Memory • Client-Isolated
            </span>
          </div>

          <h1 className="font-display text-3xl sm:text-4xl md:text-5xl tracking-tight leading-tightest text-ink">
            Every PDF job, done at the <span className="italic text-red">bench</span>.
          </h1>

          <p className="text-sm sm:text-base text-ink-soft leading-relaxed max-w-2xl">
            Precision document binding, cutting, stream compression, and forensic watermarking.
            Run instant stateless actions as a guest, or save encrypted folios to your private Cloud Vault.
          </p>
        </div>

        {/* HERO DROP ZONE (Primary Element) */}
        <div className="relative">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => handleFilesChosen(e.target.files)}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="hidden"
            onChange={(e) => handleFilesChosen(e.target.files)}
          />

          {!fileAnalysis ? (
            /* Empty Rest / Drag-Over State */
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              className={`relative cursor-pointer p-6 sm:p-12 rounded-md border-2 border-dashed transition-all duration-150 text-center select-none ${
                isDragging
                  ? 'border-red bg-kraft/70 -translate-y-0.5 shadow-ink-lift'
                  : 'border-rule hover:border-rule-strong bg-vellum hover:bg-kraft/30 active:bg-kraft/50 shadow-subtle'
              }`}
            >
              {/* Corner Registration Marks (+) */}
              <span
                className={`absolute top-2 left-2 font-mono text-xs transition-colors duration-150 ${
                  isDragging ? 'text-red font-bold' : 'text-rule-strong'
                }`}
                aria-hidden="true"
              >
                +
              </span>
              <span
                className={`absolute top-2 right-2 font-mono text-xs transition-colors duration-150 ${
                  isDragging ? 'text-red font-bold' : 'text-rule-strong'
                }`}
                aria-hidden="true"
              >
                +
              </span>
              <span
                className={`absolute bottom-2 left-2 font-mono text-xs transition-colors duration-150 ${
                  isDragging ? 'text-red font-bold' : 'text-rule-strong'
                }`}
                aria-hidden="true"
              >
                +
              </span>
              <span
                className={`absolute bottom-2 right-2 font-mono text-xs transition-colors duration-150 ${
                  isDragging ? 'text-red font-bold' : 'text-rule-strong'
                }`}
                aria-hidden="true"
              >
                +
              </span>

              <div className="max-w-md mx-auto space-y-3">
                <div className="w-12 h-12 rounded border border-rule bg-paper mx-auto flex items-center justify-center text-ink shadow-sm">
                  <UploadCloud className="w-6 h-6 text-ink-soft" strokeWidth={1.5} />
                </div>

                <div>
                  <p className="font-display text-base sm:text-lg text-ink font-semibold">
                    {isDragging
                      ? 'Release to add to workbench'
                      : 'Place documents on the workbench'}
                  </p>
                  <p className="text-xs text-ink-soft mt-1">
                    Drag and drop PDFs or images anywhere, or tap below to choose folios.
                  </p>
                </div>

                {/* Mobile Touch Action Buttons (>= 44px hit targets) */}
                <div className="flex sm:hidden flex-col gap-2 pt-2 w-full max-w-xs mx-auto">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      fileInputRef.current?.click();
                    }}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded bg-red text-vellum font-semibold text-xs transition-colors shadow-ink-button min-h-[44px] active:scale-[0.98]"
                  >
                    <UploadCloud className="w-4 h-4" />
                    <span>Choose PDF / Files</span>
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      cameraInputRef.current?.click();
                    }}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded border border-rule bg-paper hover:bg-kraft active:bg-kraft/70 text-ink font-semibold text-xs transition-colors min-h-[44px] active:scale-[0.98]"
                  >
                    <Camera className="w-4 h-4 text-ink-soft" />
                    <span>Scan / Take Photo</span>
                  </button>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2 pt-2 text-[10px] sm:text-[11px] font-mono text-ink-faint">
                  <span className="px-2 py-0.5 rounded bg-kraft/60 border border-rule">
                    PDF up to 100 MB
                  </span>
                  <span className="px-2 py-0.5 rounded bg-kraft/60 border border-rule">
                    Images (.PNG, .JPG)
                  </span>
                  <span className="px-2 py-0.5 rounded bg-kraft/60 border border-rule">
                    Word (.DOCX)
                  </span>
                </div>
              </div>
            </div>
          ) : (
            /* File Summary & Suggested Bench Operations */
            <div className="p-6 rounded-md border border-rule-strong bg-vellum shadow-ink-lift space-y-5">
              <div className="flex items-start justify-between border-b border-rule pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded border border-rule bg-kraft flex items-center justify-center text-ink shrink-0">
                    <FileCheck className="w-5 h-5 text-moss" strokeWidth={1.5} />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-ink">
                      {fileAnalysis.count === 1
                        ? fileAnalysis.name
                        : `${fileAnalysis.count} documents placed on bench`}
                    </h3>
                    <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-ink-soft mt-1">
                      <span className="tabular-nums">
                        Size: {formatBytes(fileAnalysis.size || fileAnalysis.totalSize)}
                      </span>
                      {fileAnalysis.pageCount && (
                        <span className="tabular-nums">
                          Pages: ~{fileAnalysis.pageCount}
                        </span>
                      )}
                      {fileAnalysis.isEncrypted && (
                        <span className="inline-flex items-center text-red font-medium">
                          <Lock className="w-3 h-3 mr-1" /> Encrypted PDF
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  onClick={resetDroppedFiles}
                  className="p-1 rounded hover:bg-kraft text-ink-soft hover:text-ink transition-colors"
                  title="Remove and reset bench"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Suggested Actions Row */}
              <div className="space-y-2">
                <span className="text-xs font-mono tracking-mono uppercase text-ink-faint">
                  Suggested Bench Operations
                </span>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                  {fileAnalysis.count > 1 ? (
                    <>
                      <button
                        onClick={() => routeWithFiles('/tools/merge')}
                        className="flex flex-col items-start p-3 rounded border border-rule bg-tint-merge/40 hover:bg-tint-merge text-left transition-colors group"
                      >
                        <div className="flex items-center justify-between w-full">
                          <span className="font-mono text-[10px] uppercase tracking-mono text-ink font-semibold">
                            bind
                          </span>
                          <ArrowRight className="w-3.5 h-3.5 text-ink group-hover:translate-x-1 transition-transform" />
                        </div>
                        <span className="font-semibold text-sm text-ink mt-1">
                          Merge All PDFs
                        </span>
                        <span className="text-[11px] text-ink-soft mt-0.5">
                          Combine {fileAnalysis.count} folios into 1
                        </span>
                      </button>

                      <button
                        onClick={() => routeWithFiles('/tools/from-images')}
                        className="flex flex-col items-start p-3 rounded border border-rule bg-paper hover:bg-kraft text-left transition-colors group"
                      >
                        <div className="flex items-center justify-between w-full">
                          <span className="font-mono text-[10px] uppercase tracking-mono text-ink-faint">
                            compile
                          </span>
                          <ArrowRight className="w-3.5 h-3.5 text-ink-soft group-hover:translate-x-1 transition-transform" />
                        </div>
                        <span className="font-semibold text-sm text-ink mt-1">
                          Images to PDF
                        </span>
                        <span className="text-[11px] text-ink-soft mt-0.5">
                          Sequence image plates
                        </span>
                      </button>
                    </>
                  ) : fileAnalysis.isImage ? (
                    <button
                      onClick={() => routeWithFiles('/tools/from-images')}
                      className="flex flex-col items-start p-3 rounded border border-rule bg-tint-convert/40 hover:bg-tint-convert text-left transition-colors group col-span-2"
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="font-mono text-[10px] uppercase tracking-mono text-ink font-semibold">
                          compile
                        </span>
                        <ArrowRight className="w-3.5 h-3.5 text-ink group-hover:translate-x-1 transition-transform" />
                      </div>
                      <span className="font-semibold text-sm text-ink mt-1">
                        Convert Image to PDF
                      </span>
                      <span className="text-[11px] text-ink-soft mt-0.5">
                        Compile into fixed-size printable document
                      </span>
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => routeWithFiles('/tools/compress')}
                        className="flex flex-col items-start p-3 rounded border border-rule bg-tint-compress/40 hover:bg-tint-compress text-left transition-colors group"
                      >
                        <div className="flex items-center justify-between w-full">
                          <span className="font-mono text-[10px] uppercase tracking-mono text-ink font-semibold">
                            press
                          </span>
                          <ArrowRight className="w-3.5 h-3.5 text-ink group-hover:translate-x-1 transition-transform" />
                        </div>
                        <span className="font-semibold text-sm text-ink mt-1">
                          Compress PDF
                        </span>
                        <span className="text-[11px] text-ink-soft mt-0.5">
                          Reduce byte footprint
                        </span>
                      </button>

                      <button
                        onClick={() => routeWithFiles('/tools/split')}
                        className="flex flex-col items-start p-3 rounded border border-rule bg-tint-split/40 hover:bg-tint-split text-left transition-colors group"
                      >
                        <div className="flex items-center justify-between w-full">
                          <span className="font-mono text-[10px] uppercase tracking-mono text-ink font-semibold">
                            cut
                          </span>
                          <ArrowRight className="w-3.5 h-3.5 text-ink group-hover:translate-x-1 transition-transform" />
                        </div>
                        <span className="font-semibold text-sm text-ink mt-1">
                          Split & Extract
                        </span>
                        <span className="text-[11px] text-ink-soft mt-0.5">
                          Slice pages or chapters
                        </span>
                      </button>

                      <button
                        onClick={() => routeWithFiles('/tools/protect')}
                        className="flex flex-col items-start p-3 rounded border border-rule bg-tint-protect/40 hover:bg-tint-protect text-left transition-colors group"
                      >
                        <div className="flex items-center justify-between w-full">
                          <span className="font-mono text-[10px] uppercase tracking-mono text-ink font-semibold">
                            seal
                          </span>
                          <ArrowRight className="w-3.5 h-3.5 text-ink group-hover:translate-x-1 transition-transform" />
                        </div>
                        <span className="font-semibold text-sm text-ink mt-1">
                          Protect & Encrypt
                        </span>
                        <span className="text-[11px] text-ink-soft mt-0.5">
                          Apply AES-256 seal
                        </span>
                      </button>

                      <button
                        onClick={() => routeWithFiles('/tools/to-word')}
                        className="flex flex-col items-start p-3 rounded border border-rule bg-tint-convert/40 hover:bg-tint-convert text-left transition-colors group"
                      >
                        <div className="flex items-center justify-between w-full">
                          <span className="font-mono text-[10px] uppercase tracking-mono text-ink font-semibold">
                            extract
                          </span>
                          <ArrowRight className="w-3.5 h-3.5 text-ink group-hover:translate-x-1 transition-transform" />
                        </div>
                        <span className="font-semibold text-sm text-ink mt-1">
                          Extract to Word
                        </span>
                        <span className="text-[11px] text-ink-soft mt-0.5">
                          Editable DOCX manuscript
                        </span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* SECTION 1: FOUR PRIMARY FOLDER-TAB BENCH TILES */}
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-rule pb-2">
            <div>
              <h2 className="font-display text-xl sm:text-2xl tracking-tight text-ink">
                Primary Bench Tools
              </h2>
              <p className="text-xs text-ink-soft mt-0.5">
                Core daily operations: binding volumes, trimming pages, pressing streams, and sealing archives.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {featuredTools.map((tool) => (
              <ToolCard
                key={tool.id}
                variant="tile"
                tool={tool}
                onClick={() => {
                  if (droppedFiles.length) {
                    routeWithFiles(tool.to);
                  }
                }}
              />
            ))}
          </div>
        </div>

        {/* SECTION 2: WORKSHOP SPECIMEN INDEX & TOC */}
        <div className="space-y-5 pt-4">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-rule pb-3">
            <div>
              <h2 className="font-display text-xl sm:text-2xl tracking-tight text-ink">
                Workshop Specimen Index
              </h2>
              <p className="text-xs text-ink-soft mt-0.5">
                Full suite of conversions, watermarks, forensic canary markers, and automated pipelines.
              </p>
            </div>

            {/* Search Input */}
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search tools or verbs..."
                className="w-full pl-8 pr-3 py-1.5 bg-vellum border border-rule rounded text-xs text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-cyan"
              />
            </div>
          </div>

          {/* Category Filter Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar scroll-smooth">
            {TOOL_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`px-3 py-1.5 rounded font-mono text-xs uppercase tracking-mono transition-all duration-120 shrink-0 border ${
                  activeCategory === cat.id
                    ? 'bg-ink text-paper border-ink font-semibold'
                    : 'bg-vellum text-ink-soft hover:text-ink border-rule hover:border-rule-strong'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Table of Contents List with Dotted Leaders */}
          <div className="space-y-2">
            {filteredRemainingTools.length === 0 ? (
              <div className="p-8 text-center border border-rule rounded bg-vellum">
                <p className="text-xs font-mono text-ink-soft">
                  No tools found matching query "{searchQuery}" in category "{activeCategory}".
                </p>
              </div>
            ) : (
              filteredRemainingTools.map((tool) => (
                <ToolCard
                  key={tool.id}
                  variant="toc"
                  tool={tool}
                  onClick={() => {
                    if (droppedFiles.length) {
                      routeWithFiles(tool.to);
                    }
                  }}
                />
              ))
            )}
          </div>
        </div>

        {/* SECTION 3: EDITORIAL PRIVACY & VAULT CALLOUT */}
        <div className="pt-6 border-t border-rule grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-5 rounded border border-rule bg-vellum flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 text-ink font-semibold text-sm">
                <CheckCircle2 className="w-4 h-4 text-moss" />
                <span>Stateless Workbench Guarantee</span>
              </div>
              <p className="text-xs text-ink-soft leading-relaxed mt-2">
                All guest operations run inside isolated Linux RAM namespaces on AWS EC2. No documents are logged, indexed, or stored. Output is delivered directly to your browser and erased from memory.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-rule/60 text-[11px] font-mono text-ink-faint">
              ZERO-PERSISTENCE GUEST PRIVACY
            </div>
          </div>

          <div className="p-5 rounded border border-rule-strong bg-kraft/40 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-ink font-semibold text-sm">
                  <ShieldCheck className="w-4 h-4 text-cyan" />
                  <span>Cloud Document Vault & Canary Tracking</span>
                </div>
                {!isAuthenticated && (
                  <span className="text-[10px] font-mono tracking-mono uppercase text-red bg-red/10 border border-red/20 px-2 py-0.5 rounded font-medium">
                    Free
                  </span>
                )}
              </div>
              <p className="text-xs text-ink-soft leading-relaxed mt-2">
                Need persistent storage? Authenticated members get a private AES-256 encrypted Cloud Vault with 500 MB quota and invisible cryptographic zero-width canary watermarks to detect document leaks.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-rule/60 flex items-center justify-between">
              <span className="text-[11px] font-mono text-ink-faint">
                AMAZON S3 ENCRYPTED VAULT
              </span>
              {!isAuthenticated ? (
                <Link
                  to="/register"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-red hover:underline"
                >
                  <span>Create Account</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              ) : (
                <Link
                  to="/workspace"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-ink hover:underline"
                >
                  <span>Open Vault</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
