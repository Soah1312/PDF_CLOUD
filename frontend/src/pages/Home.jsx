import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  UploadCloud,
  Search,
  FileCheck,
  Lock,
  ArrowRight,
  ShieldCheck,
  Camera,
  X,
} from 'lucide-react';
import { BINDERY_TOOLS, TOOL_CATEGORIES } from '../config/tools';
import ToolCard from '../components/common/ToolCard';
import PrivacyBottomSheet from '../components/common/PrivacyBottomSheet';
import PrimaryButton from '../components/common/PrimaryButton';
import OdometerValue from '../components/common/OdometerValue';
import { motionBus, initScrollReveals } from '../utils/motion';

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

// Small decorative inline-SVG illustration (96px)
// A stack of three offset paper sheets, the top one with a tiny red "PDF" corner stamp
// Sheets fan out slightly on page load (stagger 60ms) and settle. Reduced-motion: static.
function PaperFanIllustration() {
  return (
    <svg
      width="96"
      height="96"
      viewBox="0 0 96 96"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="shrink-0 select-none"
      aria-hidden="true"
    >
      {/* Sheet 1 (Bottom, kraft) */}
      <g className="animate-fan-1 origin-[48px_48px]">
        <rect
          x="20"
          y="16"
          width="54"
          height="66"
          rx="4"
          fill="#E4D7BE"
          stroke="#D5C6A8"
          strokeWidth="1.5"
        />
      </g>
      {/* Sheet 2 (Middle, soft kraft) */}
      <g className="animate-fan-2 origin-[48px_48px]">
        <rect
          x="21"
          y="15"
          width="54"
          height="66"
          rx="4"
          fill="#EDE3D0"
          stroke="#D5C6A8"
          strokeWidth="1.5"
        />
      </g>
      {/* Sheet 3 (Top, vellum with ruled lines and red PDF stamp) */}
      <g className="animate-fan-3 origin-[48px_48px]">
        <rect
          x="21"
          y="15"
          width="54"
          height="66"
          rx="4"
          fill="#FAF6EC"
          stroke="#241B14"
          strokeWidth="1.5"
        />
        {/* Subtle printed document lines */}
        <line x1="28" y1="28" x2="66" y2="28" stroke="#D5C6A8" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="28" y1="36" x2="66" y2="36" stroke="#D5C6A8" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="28" y1="44" x2="52" y2="44" stroke="#D5C6A8" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="28" y1="52" x2="64" y2="52" stroke="#D5C6A8" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="28" y1="60" x2="48" y2="60" stroke="#D5C6A8" strokeWidth="1.5" strokeLinecap="round" />
        {/* Tiny red "PDF" corner stamp */}
        <rect x="51" y="18" width="20" height="11" rx="2" fill="#D9441F" />
        <text
          x="61"
          y="26.5"
          textAnchor="middle"
          fill="#FAF6EC"
          fontSize="7"
          fontWeight="bold"
          fontFamily="Martian Mono, monospace"
        >
          PDF
        </text>
      </g>
    </svg>
  );
}

export default function Home() {
  const navigate = useNavigate();

  const [activeCategory, setActiveCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [isOverDropZone, setIsOverDropZone] = useState(false);
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);
  const windowDragCounter = useRef(0);
  const dropZoneDragCounter = useRef(0);

  // Dropped file inspection state
  const [droppedFiles, setDroppedFiles] = useState([]);
  const [fileAnalysis, setFileAnalysis] = useState(null);
  const [fileError, setFileError] = useState('');
  const [isThunking, setIsThunking] = useState(false);
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

  // Scroll reveals for section hairline rules and stagger items
  useEffect(() => {
    const cleanup = initScrollReveals();
    return () => {
      if (cleanup) cleanup();
    };
  }, [filteredRemainingTools]);

  const triggerHaptic = () => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(10);
    }
  };

  // Inspect chosen/dropped file
  const handleFilesChosen = async (filesList) => {
    const files = Array.from(filesList);
    if (!files.length) return;
    setFileError('');

    // Validate: max file size (100 MB)
    for (const f of files) {
      if (f.size > 100 * 1024 * 1024) {
        setFileError(`Document "${f.name}" exceeds 100 MB limit (${formatBytes(f.size)}).`);
        motionBus.emit('pressroom:state', 'error');
        setTimeout(() => motionBus.emit('pressroom:state', 'idle'), 400);
        return;
      }
    }

    // Validate supported formats (.pdf, images, .docx)
    const isValid = files.every((f) => {
      const name = f.name.toLowerCase();
      return name.endsWith('.pdf') || f.type === 'application/pdf' || f.type.startsWith('image/') || name.endsWith('.docx');
    });

    if (!isValid) {
      setFileError('Unsupported document format. Please place PDF or image files on the bench.');
      motionBus.emit('pressroom:state', 'error');
      setTimeout(() => motionBus.emit('pressroom:state', 'idle'), 400);
      return;
    }

    setDroppedFiles(files);
    motionBus.emit('pressroom:state', 'dropped');
    setTimeout(() => {
      motionBus.emit('pressroom:state', 'idle');
    }, 200);

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
    setFileError('');
    motionBus.emit('pressroom:state', 'idle');
  };

  return (
    <div
      className="min-h-screen bg-paper text-ink pb-24 md:pb-16 relative overflow-x-hidden"
      onDragEnter={(e) => {
        e.preventDefault();
        windowDragCounter.current += 1;
        if (!isDragging) {
          setIsDragging(true);
          motionBus.emit('pressroom:state', 'dragover');
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        if (!isDragging) {
          setIsDragging(true);
          motionBus.emit('pressroom:state', 'dragover');
        }
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        windowDragCounter.current -= 1;
        if (windowDragCounter.current <= 0) {
          windowDragCounter.current = 0;
          setIsDragging(false);
          setIsOverDropZone(false);
          dropZoneDragCounter.current = 0;
          motionBus.emit('pressroom:state', 'idle');
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        windowDragCounter.current = 0;
        dropZoneDragCounter.current = 0;
        setIsDragging(false);
        setIsOverDropZone(false);
        setIsThunking(true);
        setTimeout(() => setIsThunking(false), 220);
        motionBus.emit('audio:play', 'thunk');
        motionBus.emit('pressroom:state', 'dropped');
        setTimeout(() => {
          motionBus.emit('pressroom:state', 'idle');
        }, 200);
        if (e.dataTransfer?.files?.length) {
          handleFilesChosen(e.dataTransfer.files);
        }
      }}
    >
      {/* Hidden file inputs */}
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

      {/* Main Container: 4/8px spacing, page gutter 16px at 360px, 20px at sm */}
      <div className="max-w-4xl mx-auto px-4 sm:px-5 space-y-8">
        {/* =========================================================================
            ITEM 2: HERO (padding 20px sides, 24px top)
            - Headline in Gloock, clamp(34px, 9.5vw, 40px), line-height 1.04
            - Subcopy: ONE sentence, max 2 lines, 16px
            - Trust line: ONE single non-wrapping line, mono 11px uppercase, shield icon
            - Small decorative inline-SVG illustration (96px) fanning out 60ms
            - WORKSHOP BENCH chip removed entirely
           ========================================================================= */}
        <section className="pt-6 animate-fade-rise" style={{ animationDelay: '0ms' }}>
          <div className="max-w-3xl space-y-3">
            <div className="flex items-start justify-between sm:justify-start gap-4">
              <h1 className="font-display text-[clamp(21px,3.8vw,40px)] tracking-tight leading-[1.08] text-ink whitespace-nowrap">
                Every PDF job, done at the <span className="italic text-red">bench</span>.
              </h1>
              {/* Decorative 96px paper fan illustration aligned inside the headline content column */}
              <div className="hidden sm:block shrink-0 pt-0.5">
                <PaperFanIllustration />
              </div>
            </div>

            <p className="text-base text-ink-soft leading-snug">
              Merge, split, compress and protect PDFs. No sign-in needed.
            </p>

            {/* Trust line: one single non-wrapping line, mono 11px uppercase */}
            <div className="pt-1">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic();
                  setIsPrivacyOpen(true);
                }}
                className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-mono text-ink-soft hover:text-ink whitespace-nowrap active:scale-[0.98] transition-transform select-none focus:outline-none focus:ring-1 focus:ring-cyan rounded"
                title="View zero-retention guarantee"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-moss shrink-0" strokeWidth={1.5} />
                <span>FILES STAY IN MEMORY — NEVER STORED</span>
              </button>
            </div>
          </div>
        </section>

        {/* =========================================================================
            ITEM 3: DROP ZONE CARD
            - Compact: padding 20px, vellum, 1px rule, 6px radius, dashed inner border,
              registration "+" corners
            - Full-width primary button "Choose PDF files" (56px tall, red, upload icon,
              offset ink shadow)
            - Full-width secondary outlined button "Scan with camera" (image/*, capture=environment)
            - Mono 12px text: "or share a PDF to CloudPDF from any app"
            - NO drag-and-drop wording on touch devices
           ========================================================================= */}
        <section className="animate-fade-rise" style={{ animationDelay: '60ms' }}>
          {fileError && (
            <div className="mb-3 p-3.5 rounded-[6px] border border-red/40 bg-red/10 text-xs text-ink flex items-start gap-2.5 animate-invalid-shake">
              <span className="font-mono text-red font-bold">!</span>
              <div className="flex-1">
                <p className="font-semibold text-red">Document issue</p>
                <p className="text-ink-soft mt-0.5">{fileError}</p>
              </div>
              <button
                type="button"
                onClick={() => setFileError('')}
                className="text-ink-soft hover:text-ink text-xs font-mono"
              >
                Dismiss
              </button>
            </div>
          )}

          {!fileAnalysis ? (
            <div
              onDragEnter={(e) => {
                e.preventDefault();
                e.stopPropagation();
                dropZoneDragCounter.current += 1;
                setIsOverDropZone(true);
                setIsDragging(true);
                motionBus.emit('pressroom:state', 'dragover');
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                e.dataTransfer.dropEffect = 'copy';
                if (!isOverDropZone) {
                  setIsOverDropZone(true);
                }
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
                dropZoneDragCounter.current -= 1;
                if (dropZoneDragCounter.current <= 0) {
                  dropZoneDragCounter.current = 0;
                  setIsOverDropZone(false);
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                windowDragCounter.current = 0;
                dropZoneDragCounter.current = 0;
                setIsDragging(false);
                setIsOverDropZone(false);
                setIsThunking(true);
                setTimeout(() => setIsThunking(false), 220);
                motionBus.emit('audio:play', 'thunk');
                motionBus.emit('pressroom:state', 'dropped');
                setTimeout(() => {
                  motionBus.emit('pressroom:state', 'idle');
                }, 200);
                if (e.dataTransfer?.files?.length) {
                  handleFilesChosen(e.dataTransfer.files);
                }
              }}
              className={`group relative p-5 sm:p-6 rounded-[8px] border transition-all duration-200 select-none ${
                isOverDropZone
                  ? 'bg-[#F4E8D8] border-red ring-4 ring-red/25 -translate-y-1.5 scale-[1.015] shadow-ink-drag'
                  : isDragging
                  ? 'bg-kraft/60 border-red/60 -translate-y-0.5 shadow-ink-lift'
                  : 'bg-vellum border-rule hover:border-rule-strong hover:shadow-subtle'
              } ${isThunking ? 'animate-thunk' : ''}`}
            >
              {/* Registration "+" marks in four corners (rotates 45deg & turns red when active) */}
              <span
                className={`absolute top-2.5 left-2.5 font-mono text-xs select-none leading-none transition-all duration-200 ease-out ${
                  isOverDropZone
                    ? 'text-red rotate-45 scale-125 font-bold'
                    : isDragging
                    ? 'text-red rotate-45 scale-110'
                    : 'text-rule-strong group-hover:rotate-45 group-hover:scale-110 group-hover:text-ink'
                }`}
                aria-hidden="true"
              >
                +
              </span>
              <span
                className={`absolute top-2.5 right-2.5 font-mono text-xs select-none leading-none transition-all duration-200 ease-out ${
                  isOverDropZone
                    ? 'text-red rotate-45 scale-125 font-bold'
                    : isDragging
                    ? 'text-red rotate-45 scale-110'
                    : 'text-rule-strong group-hover:rotate-45 group-hover:scale-110 group-hover:text-ink'
                }`}
                aria-hidden="true"
              >
                +
              </span>
              <span
                className={`absolute bottom-2.5 left-2.5 font-mono text-xs select-none leading-none transition-all duration-200 ease-out ${
                  isOverDropZone
                    ? 'text-red rotate-45 scale-125 font-bold'
                    : isDragging
                    ? 'text-red rotate-45 scale-110'
                    : 'text-rule-strong group-hover:rotate-45 group-hover:scale-110 group-hover:text-ink'
                }`}
                aria-hidden="true"
              >
                +
              </span>
              <span
                className={`absolute bottom-2.5 right-2.5 font-mono text-xs select-none leading-none transition-all duration-200 ease-out ${
                  isOverDropZone
                    ? 'text-red rotate-45 scale-125 font-bold'
                    : isDragging
                    ? 'text-red rotate-45 scale-110'
                    : 'text-rule-strong group-hover:rotate-45 group-hover:scale-110 group-hover:text-ink'
                }`}
                aria-hidden="true"
              >
                +
              </span>

              {/* Inner Tray Container with animated SVG marching dashed boundary */}
              <div
                className={`relative rounded-[6px] p-4 sm:p-6 flex flex-col items-center gap-3.5 transition-all duration-200 ${
                  isOverDropZone
                    ? 'bg-kraft/60'
                    : isDragging
                    ? 'bg-kraft/30'
                    : 'bg-transparent'
                }`}
              >
                {/* SVG Marching Dashed Border around inner tray */}
                <svg
                  className="absolute inset-0 w-full h-full pointer-events-none rounded-[6px]"
                  aria-hidden="true"
                >
                  <rect
                    x="1.5"
                    y="1.5"
                    width="calc(100% - 3px)"
                    height="calc(100% - 3px)"
                    rx="5"
                    fill="none"
                    stroke={isOverDropZone ? '#D9441F' : isDragging ? '#F25C37' : '#D5C6A8'}
                    strokeWidth={isOverDropZone ? 2 : 1.5}
                    strokeDasharray="6 6"
                    className={isOverDropZone || isDragging ? 'animate-marching-border' : 'group-hover:animate-marching-border'}
                  />
                </svg>

                {isOverDropZone ? (
                  /* Active Drop Target State: Immediate, Unmistakable Awareness */
                  <div className="py-6 px-3 flex flex-col items-center justify-center text-center gap-3 animate-fade-rise pointer-events-none w-full">
                    <div className="w-14 h-14 rounded-full bg-red/15 border-2 border-red/50 flex items-center justify-center text-red shadow-[0_6px_16px_rgba(217,68,31,0.25)] animate-bounce">
                      <UploadCloud className="w-7 h-7 text-red" strokeWidth={2.2} />
                    </div>
                    <div className="space-y-1">
                      <p className="font-display text-xl sm:text-2xl text-red tracking-tight font-semibold leading-tight">
                        Release to drop onto the bench
                      </p>
                      <p className="font-mono text-xs text-ink-soft">
                        PDF folios will be loaded immediately into memory
                      </p>
                    </div>
                    <div className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-mono text-red font-semibold bg-red/10 border border-red/30 px-3 py-1 rounded-full shadow-sm mt-1">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-red"></span>
                      </span>
                      <span>Drop target active — release now</span>
                    </div>
                  </div>
                ) : (
                  /* Standard / Window-drag State */
                  <>
                    {/* Visual Cue: workbench drop zone icon & clear invitation */}
                    <div className="flex flex-col items-center text-center gap-1.5 pt-1 pointer-events-none">
                      <div className={`w-11 h-11 rounded-full border flex items-center justify-center transition-all duration-200 ${
                        isDragging
                          ? 'bg-red/10 border-red/40 text-red animate-bounce'
                          : 'bg-kraft/50 border-rule text-ink-soft group-hover:text-red group-hover:border-red/40 group-hover:bg-red/5'
                      }`}>
                        <UploadCloud className="w-5 h-5 transition-transform duration-200 group-hover:-translate-y-0.5" strokeWidth={1.8} />
                      </div>
                      
                      <div className="space-y-0.5">
                        <p className="font-display text-base sm:text-lg text-ink font-medium tracking-tight">
                          {isDragging ? 'Bring folios here to drop' : 'Drag & drop PDF folios here'}
                        </p>
                        <p className="font-mono text-xs text-ink-soft">
                          {isDragging ? 'Release anywhere within this frame' : 'or click below to choose documents from your device'}
                        </p>
                      </div>

                      {/* Technical Bench Chip */}
                      <div className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-mono text-ink-faint bg-paper px-2.5 py-0.5 rounded border border-rule/60 mt-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-moss inline-block shrink-0"></span>
                        <span>Zero retention · In-memory processing · Up to 100MB</span>
                      </div>
                    </div>

                    {/* Primary Button: Choose PDF files */}
                    <div className={`w-full max-w-sm transition-transform duration-200 ease-out ${isDragging ? 'translate-y-1' : ''}`}>
                      <PrimaryButton
                        onClick={() => {
                          triggerHaptic();
                          fileInputRef.current?.click();
                        }}
                        className="w-full h-13 sm:h-14"
                        icon={UploadCloud}
                      >
                        Choose PDF files
                      </PrimaryButton>
                    </div>

                    {/* Coarse-pointer devices only (touch/mobile): Scan with camera & share copy */}
                    <div className="w-full max-w-sm flex flex-col items-center gap-2.5 pointer-coarse-only">
                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic();
                          cameraInputRef.current?.click();
                        }}
                        className="w-full h-11 flex items-center justify-center gap-2 rounded-[6px] border border-rule-strong bg-vellum hover:bg-kraft/50 active:bg-kraft/70 active:translate-y-0.5 text-ink font-medium text-xs transition-colors focus:outline-none focus:ring-2 focus:ring-cyan touch-target select-none"
                      >
                        <Camera className="w-4 h-4 text-ink-soft" strokeWidth={1.5} />
                        <span>Scan with camera</span>
                      </button>

                      <p className="font-mono text-xs text-ink-soft select-none text-center">
                        or share a PDF to CloudPDF from any app
                      </p>
                    </div>

                    {/* Fine-pointer devices only (desktop): Drag & drop copy */}
                    <div className="w-full flex-col items-center pointer-fine-only">
                      <p className="font-mono text-[11px] text-ink-faint select-none text-center">
                        (release folios directly onto this workbench from File Explorer or Finder)
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>
          ) : (
            /* Selected File Inspection State */
            <div className="p-5 rounded-[6px] border border-rule bg-vellum shadow-[0_1px_3px_rgba(36,27,20,0.04)] space-y-4">
              <div className="flex items-start justify-between border-b border-rule pb-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded border border-rule bg-kraft flex items-center justify-center text-ink shrink-0">
                    <FileCheck className="w-5 h-5 text-moss" strokeWidth={1.5} />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold text-ink truncate">
                      {fileAnalysis.count === 1
                        ? fileAnalysis.name
                        : `${fileAnalysis.count} folios on bench`}
                    </h2>
                    <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-ink-soft mt-0.5">
                      <span className="tabular-nums">
                        <OdometerValue value={formatBytes(fileAnalysis.size || fileAnalysis.totalSize)} />
                      </span>
                      {fileAnalysis.pageCount && (
                        <span className="tabular-nums">
                          • ~<OdometerValue value={fileAnalysis.pageCount} /> pages
                        </span>
                      )}
                      {fileAnalysis.isEncrypted && (
                        <span className="inline-flex items-center text-red font-semibold">
                          <Lock className="w-3 h-3 mr-1" strokeWidth={1.5} /> Sealed
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  onClick={resetDroppedFiles}
                  className="p-1.5 rounded hover:bg-kraft text-ink-soft hover:text-ink transition-colors touch-target flex items-center justify-center"
                  title="Reset bench"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Fast route buttons */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  onClick={() => routeWithFiles('/tools/compress')}
                  className="flex items-center justify-between p-2.5 rounded border border-rule bg-paper hover:bg-tint-compress/40 active:translate-y-0.5 text-left text-xs font-medium text-ink transition-all"
                >
                  <span>Compress</span>
                  <ArrowRight className="w-3.5 h-3.5 text-ink-soft" />
                </button>
                <button
                  onClick={() => routeWithFiles('/tools/protect')}
                  className="flex items-center justify-between p-2.5 rounded border border-rule bg-paper hover:bg-tint-protect/40 active:translate-y-0.5 text-left text-xs font-medium text-ink transition-all"
                >
                  <span>Protect</span>
                  <ArrowRight className="w-3.5 h-3.5 text-ink-soft" />
                </button>
              </div>
            </div>
          )}
        </section>

        {/* =========================================================================
            ITEM 4: SECTION LABEL: "01 - TOOLS"
           ========================================================================= */}
        <section className="space-y-3 animate-fade-rise" style={{ animationDelay: '120ms' }}>
          <div className="flex items-center gap-3">
            <span className="font-mono text-[11px] uppercase tracking-mono text-ink-faint font-semibold">
              01 — TOOLS
            </span>
            <div className="h-px flex-1 bg-rule section-rule-line" />
          </div>

          {/* =========================================================================
              ITEM 5: TOOL TILES, 2x2 GRID, 12px GAP
              - Merge, Split, Compress, Protect
              - Each tile 140px tall, tinted top band, 28px icon, Gloock 20px name,
                mono sub-tag, one-line 13px description, tap = :active press-down
             ========================================================================= */}
          <div className="grid grid-cols-2 gap-3">
            {featuredTools.map((tool, idx) => (
              <div
                key={tool.id}
                className="stagger-reveal"
                style={{ transitionDelay: `${idx * 50}ms` }}
              >
                <ToolCard
                  variant="tile"
                  tool={tool}
                  onClick={() => {
                    if (droppedFiles.length) {
                      routeWithFiles(tool.to);
                    }
                  }}
                />
              </div>
            ))}
          </div>
        </section>

        {/* =========================================================================
            ITEM 6: SECTION LABEL: "02 - MORE TOOLS" + TABLE OF CONTENTS LIST
           ========================================================================= */}
        <section className="space-y-3 pt-2 animate-fade-rise" style={{ animationDelay: '180ms' }}>
          <div className="flex items-center gap-3">
            <span className="font-mono text-[11px] uppercase tracking-mono text-ink-faint font-semibold">
              02 — MORE TOOLS
            </span>
            <div className="h-px flex-1 bg-rule section-rule-line" />
          </div>

          {/* Search Box + Clean Wrapping Filter Chips */}
          <div className="space-y-2.5">
            <div className="relative w-full">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search tools (e.g. watermark, rotate, docx)..."
                className="w-full pl-8 pr-3 py-2 bg-vellum border border-rule rounded-[6px] text-xs text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-cyan"
              />
            </div>

            {/* Clean wrapping filter chips — strictly wraps to prevent any horizontal overflow! */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs select-none">
              {TOOL_CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => {
                    triggerHaptic();
                    setActiveCategory(cat.id);
                  }}
                  className={`px-2.5 py-1 rounded font-mono text-[11px] uppercase tracking-mono transition-colors shrink-0 border active:scale-95 ${
                    activeCategory === cat.id
                      ? 'bg-ink text-vellum border-ink font-semibold'
                      : 'bg-vellum text-ink-soft border-rule hover:text-ink hover:border-rule-strong'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Table of contents style list (56px rows) with stagger-reveal */}
          <div className="space-y-2 pt-1">
            {filteredRemainingTools.map((tool, idx) => (
              <div
                key={tool.id}
                className="stagger-reveal"
                style={{ transitionDelay: `${idx * 40}ms` }}
              >
                <ToolCard
                  variant="toc"
                  tool={tool}
                  onClick={() => {
                    if (droppedFiles.length) {
                      routeWithFiles(tool.to);
                    }
                  }}
                />
              </div>
            ))}
          </div>
        </section>

        {/* =========================================================================
            ITEM 7: FOOTER
            - Small centered mono text + links (Privacy guarantee, Pipelines, Cloud Vault)
           ========================================================================= */}
        <footer className="pt-6 pb-4 text-center space-y-2 border-t border-rule animate-fade-rise" style={{ animationDelay: '240ms' }}>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs font-mono text-ink-soft">
            <button
              onClick={() => {
                triggerHaptic();
                setIsPrivacyOpen(true);
              }}
              className="hover:text-ink underline decoration-rule touch-target py-1"
            >
              Privacy Guarantee
            </button>
            <span className="text-rule-strong">•</span>
            <Link to="/pipelines" className="hover:text-ink underline decoration-rule touch-target py-1">
              Pipelines Studio
            </Link>
            <span className="text-rule-strong">•</span>
            <Link to="/workspace" className="hover:text-ink underline decoration-rule touch-target py-1">
              Cloud Vault
            </Link>
          </div>
          <p className="font-mono text-[10px] tracking-mono uppercase text-ink-faint">
            CloudPDF Studio • The Bindery • RAM Buffer Only
          </p>
        </footer>
      </div>

      {/* Reusable Privacy Bottom Sheet */}
      <PrivacyBottomSheet
        isOpen={isPrivacyOpen}
        onClose={() => setIsPrivacyOpen(false)}
      />
    </div>
  );
}
