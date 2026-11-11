import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  FileText,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Download,
  Trash2,
  RefreshCw,
  Search,
  ArrowRight,
  ShieldCheck,
  Layers,
  Sparkles,
  Eye,
  Check,
  AlertTriangle,
  ArrowLeft,
  Clock,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  RotateCw,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  inspectPdfOcr,
  createSearchablePdf,
  getOcrJobStatus,
  downloadOcrPdf,
  fetchOcrPdfBlob,
  fetchOcrJobs,
  extractErrorMessage,
} from '../services/api';
import { loadPdfDocument, renderPdfPageToCanvas } from '../utils/pdfThumbnails';
import DocumentPreviewModal from '../components/common/DocumentPreviewModal';

const STAGE_LABELS = {
  QUEUED: 'Queued in Processing Pipeline...',
  VALIDATING: 'Validating Document Geometry & Integrity...',
  STORING_ORIGINAL: 'Ingesting Document to Encrypted Storage...',
  OCR_PROCESSING: 'Recognizing Characters, Glyphs & Layout...',
  VERIFYING_OUTPUT: 'Verifying Injected Text Layer & PDF Structure...',
  STORING_OUTPUT: 'Finalizing Searchable Document in Secure Storage...',
  COMPLETED: 'Searchable PDF Ready!',
  FAILED: 'Processing Failed',
};

const OCR_FUN_FACTS = [
  {
    tag: 'Origins',
    title: "Emanuel Goldberg's 1914 Invention",
    fact: 'The earliest ancestor of OCR was patented in 1914 by Emanuel Goldberg, who built a machine that read printed characters and automatically converted them into telegraph code for electrical transmission.',
  },
  {
    tag: 'Assistive Tech',
    title: 'Ray Kurzweil & Blind Literacy (1974)',
    fact: 'In 1974, Ray Kurzweil developed the first omni-font OCR software. Coupled with a flatbed scanner and speech synthesizer, it created the first reading machine that allowed visually impaired people to listen to any printed book.',
  },
  {
    tag: 'Architecture',
    title: 'How Searchable PDFs Actually Work',
    fact: 'Dual-layer searchable PDFs keep your original scanned page 100% untouched as the visible image plate, while embedding an invisible, machine-readable vector text layer directly beneath each word so you can search and select text seamlessly.',
  },
  {
    tag: 'Postal History',
    title: 'Reading Handwritten ZIP Codes',
    fact: 'In November 1965, the United States Postal Service installed the first computerized optical scanner in Detroit. It could read the city, state, and 5-digit ZIP code on up to 36,000 envelopes per hour!',
  },
  {
    tag: 'Banking',
    title: 'Why Bank Check Fonts Look Unusual',
    fact: 'The stylized numbers at the bottom of bank checks use a specialized font called MICR E-13B, engineered in the 1950s with magnetic ink so both early optical scanners and magnetic heads would achieve zero recognition errors.',
  },
  {
    tag: 'Crowdsourcing',
    title: 'The Secret Behind Early reCAPTCHAs',
    fact: 'Early reCAPTCHA puzzles showed two words: one was a known security check, while the second was an illegible word from scanned archives of old books and newspapers that computerized OCR was unable to decipher!',
  },
  {
    tag: 'Typography',
    title: 'Disambiguating "l", "1", and "I"',
    fact: 'Advanced character recognition models analyze ascender heights, serif angles, and typographic x-heights at sub-pixel precision to reliably tell apart visually identical glyphs like lowercase "l", digit "1", and uppercase "I".',
  },
  {
    tag: 'Early Computing',
    title: 'The 1951 Vacuum-Tube "GISMO"',
    fact: 'In 1951, inventor David Shepard built "GISMO", a machine powered by 180 vacuum tubes and a rotating optical disc that could read typewritten letters one-by-one—years before computer monitors or silicon chips existed.',
  },
  {
    tag: 'Libraries',
    title: 'Preserving Centuries of Rare Manuscripts',
    fact: 'National libraries worldwide have scanned millions of fragile historical manuscripts, using dual-layer OCR to make ancient folios instantly keyword-searchable without exposing delicate pages to physical handling.',
  },
  {
    tag: 'Standards',
    title: 'The Magic of PDF Text Mode 3',
    fact: 'Under the official ISO PDF specification, text rendering mode 3 renders glyphs as "neither fill nor stroke"—rendering words completely invisible while keeping them selectable, searchable, and screen-reader accessible.',
  },
];

export const OCRStudio = () => {
  const { user, isAuthenticated } = useAuth();
  const fileInputRef = useRef(null);
  const canvasRef = useRef(null);
  const easelRef = useRef(null);

  // File & Inspection State
  const [file, setFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isInspecting, setIsInspecting] = useState(false);
  const [inspectionResult, setInspectionResult] = useState(null);
  const [forceOcr, setForceOcr] = useState(false);

  // In-Browser PDF Preview State
  const [previewDoc, setPreviewDoc] = useState(null);
  const [searchablePdfDoc, setSearchablePdfDoc] = useState(null);
  const [previewView, setPreviewView] = useState('original'); // 'original' | 'searchable'
  const [currentPage, setCurrentPage] = useState(1);
  const [numPages, setNumPages] = useState(1);
  const [zoomScale, setZoomScale] = useState(1.0);
  const [pageRotation, setPageRotation] = useState(0);
  const [pageInfo, setPageInfo] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [fullscreenModalOpen, setFullscreenModalOpen] = useState(false);

  // Execution & Progress State
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentJob, setCurrentJob] = useState(null);
  const [pollErrorCount, setPollErrorCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Live timer effect during processing
  useEffect(() => {
    if (!isProcessing) {
      setElapsedSeconds(0);
      return;
    }

    const start = Date.now();
    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - start) / 1000));
    }, 500);

    return () => clearInterval(interval);
  }, [isProcessing]);

  // Format timer helper (00:00)
  const formatTimer = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // OCR Fun Facts cycling state
  const [factIndex, setFactIndex] = useState(0);

  useEffect(() => {
    if (!isProcessing) {
      setFactIndex(0);
      return;
    }
    const timer = setInterval(() => {
      setFactIndex((prev) => (prev + 1) % OCR_FUN_FACTS.length);
    }, 6000);
    return () => clearInterval(timer);
  }, [isProcessing]);

  const handlePrevFact = () => {
    setFactIndex((prev) => (prev - 1 + OCR_FUN_FACTS.length) % OCR_FUN_FACTS.length);
  };

  const handleNextFact = () => {
    setFactIndex((prev) => (prev + 1) % OCR_FUN_FACTS.length);
  };

  // Recent Jobs State
  const [recentJobs, setRecentJobs] = useState([]);
  const [loadingRecent, setLoadingRecent] = useState(false);

  // Format bytes helper
  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  // Load recent OCR jobs
  const loadRecentJobs = async () => {
    try {
      setLoadingRecent(true);
      const jobs = await fetchOcrJobs();
      setRecentJobs(jobs || []);
    } catch (err) {
      console.warn('[OCRStudio] Could not load recent OCR jobs:', err);
    } finally {
      setLoadingRecent(false);
    }
  };

  useEffect(() => {
    loadRecentJobs();
  }, [isAuthenticated]);

  // Render active preview page to canvas
  useEffect(() => {
    const activeDoc = previewView === 'searchable' && searchablePdfDoc ? searchablePdfDoc : previewDoc;
    if (!activeDoc || !canvasRef.current) return;

    let isCancelled = false;

    async function renderPage() {
      try {
        setPreviewLoading(true);
        setPreviewError('');
        const info = await renderPdfPageToCanvas(
          activeDoc,
          currentPage,
          canvasRef.current,
          zoomScale,
          easelRef.current,
          pageRotation
        );
        if (info && !isCancelled) {
          setPageInfo(info);
        }
      } catch (err) {
        if (!isCancelled) {
          console.warn(`[OCRStudio] Render page ${currentPage} error:`, err);
          setPreviewError('Unable to render page on canvas.');
        }
      } finally {
        if (!isCancelled) {
          setPreviewLoading(false);
        }
      }
    }

    renderPage();

    return () => {
      isCancelled = true;
    };
  }, [previewDoc, searchablePdfDoc, previewView, currentPage, zoomScale, pageRotation]);

  // Handle file selection
  const handleFileSelect = async (selectedFile) => {
    if (!selectedFile) return;

    if (
      !selectedFile.name.toLowerCase().endsWith('.pdf') &&
      selectedFile.type !== 'application/pdf'
    ) {
      setErrorMessage('Please upload a valid PDF document (.pdf).');
      return;
    }

    setFile(selectedFile);
    setErrorMessage('');
    setCurrentJob(null);
    setInspectionResult(null);
    setForceOcr(false);
    setPreviewDoc(null);
    setSearchablePdfDoc(null);
    setPreviewView('original');
    setCurrentPage(1);
    setZoomScale(1.0);
    setPageRotation(0);
    setPageInfo(null);
    setPreviewLoading(true);

    // 1. Load document in browser for interactive preview
    try {
      const doc = await loadPdfDocument(selectedFile);
      if (doc) {
        setPreviewDoc(doc);
        setNumPages(doc.numPages);
      }
    } catch (docErr) {
      console.warn('[OCRStudio] PDF preview load warning:', docErr);
    } finally {
      setPreviewLoading(false);
    }

    // 2. Pre-flight server inspection for digital text
    setIsInspecting(true);
    try {
      const inspectData = await inspectPdfOcr(selectedFile);
      setInspectionResult(inspectData);
    } catch (err) {
      console.warn('[OCRStudio] Inspection failed:', err);
    } finally {
      setIsInspecting(false);
    }
  };

  // Drag and drop handlers
  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  // Reset tool
  const handleReset = () => {
    setFile(null);
    setPreviewDoc(null);
    setSearchablePdfDoc(null);
    setPreviewView('original');
    setInspectionResult(null);
    setCurrentJob(null);
    setErrorMessage('');
    setForceOcr(false);
    setIsProcessing(false);
    setCurrentPage(1);
    setNumPages(1);
    setZoomScale(1.0);
    setPageRotation(0);
    setPageInfo(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Submit OCR Job
  const handleStartOCR = async () => {
    if (!file) return;

    setErrorMessage('');
    setIsProcessing(true);

    try {
      const resp = await createSearchablePdf(file, forceOcr);

      if (resp.status === 'REQUIRES_CONFIRMATION') {
        setInspectionResult((prev) => ({
          ...prev,
          has_digital_text: true,
          message: resp.message,
        }));
        setIsProcessing(false);
        return;
      }

      if (resp.guest_session_id) {
        sessionStorage.setItem('cloudpdf_guest_session_id', resp.guest_session_id);
      }

      setCurrentJob({
        job_id: resp.job_id,
        status: resp.status || 'PENDING',
        processing_stage: resp.processing_stage || 'QUEUED',
        progress: resp.progress || 5,
        original_filename: file.name,
      });

      startPolling(resp.job_id);
    } catch (err) {
      console.error('[OCRStudio] Submission failed:', err);
      const detail = extractErrorMessage(err, 'Failed to initiate OCR job.');
      setErrorMessage(detail);
      setIsProcessing(false);
    }
  };

  // Polling loop for async OCR job
  const startPolling = (jobId) => {
    let attempts = 0;
    const maxAttempts = 120;

    const interval = setInterval(async () => {
      attempts += 1;
      try {
        const statusData = await getOcrJobStatus(jobId);
        setCurrentJob(statusData);

        if (statusData.status === 'COMPLETED') {
          clearInterval(interval);
          setIsProcessing(false);
          loadRecentJobs();

          // Fetch generated searchable PDF to enable instant in-browser inspection
          try {
            const outBlob = await fetchOcrPdfBlob(jobId);
            if (outBlob) {
              const outDoc = await loadPdfDocument(outBlob);
              if (outDoc) {
                setSearchablePdfDoc(outDoc);
                setPreviewView('searchable');
                setCurrentPage(1);
              }
            }
          } catch (blobErr) {
            console.warn('[OCRStudio] Could not load completed PDF blob for preview:', blobErr);
          }
        } else if (statusData.status === 'FAILED') {
          clearInterval(interval);
          setIsProcessing(false);
          setErrorMessage(statusData.error_message || 'OCR processing failed.');
          loadRecentJobs();
        }

        if (attempts >= maxAttempts) {
          clearInterval(interval);
          setIsProcessing(false);
          setErrorMessage('Job polling reached maximum duration. Check recent jobs ledger.');
        }
      } catch (pollErr) {
        console.warn('[OCRStudio] Polling error:', pollErr);
        setPollErrorCount((prev) => prev + 1);
        if (pollErrorCount > 5) {
          clearInterval(interval);
          setIsProcessing(false);
          setErrorMessage('Lost connection to backend server while polling job status.');
        }
      }
    }, 2000);
  };

  // Download finished searchable PDF
  const handleDownload = async (jobId, originalName) => {
    try {
      setIsDownloading(true);
      const targetName = `searchable_${originalName || 'document.pdf'}`;
      await downloadOcrPdf(jobId, targetName);
    } catch (err) {
      console.error('[OCRStudio] Download error:', err);
      setErrorMessage('Failed to download searchable PDF. The document may have expired.');
    } finally {
      setIsDownloading(false);
    }
  };

  // Preview navigation
  const prevPage = () => setCurrentPage((p) => Math.max(1, p - 1));
  const nextPage = () => setCurrentPage((p) => Math.min(numPages, p + 1));
  const zoomIn = () => setZoomScale((s) => Math.min(2.0, +(s + 0.2).toFixed(2)));
  const zoomOut = () => setZoomScale((s) => Math.max(0.6, +(s - 0.2).toFixed(2)));

  const isCompleted = currentJob && currentJob.status === 'COMPLETED';

  const totalPages = file ? Math.max(1, numPages || 1) : 1;

  // Compute calculated live progress and page completion
  const computeProgressMetrics = () => {
    if (!isProcessing && isCompleted) {
      return {
        progress: 100,
        completedPages: totalPages,
        activePage: totalPages,
        stageLabel: 'Searchable PDF Ready!',
      };
    }

    if (!isProcessing) {
      return {
        progress: 0,
        completedPages: 0,
        activePage: 1,
        stageLabel: 'Ready for processing',
      };
    }

    const backendProgress = currentJob?.progress || 10;
    const backendStage = currentJob?.processing_stage || 'QUEUED';

    // Model dynamic progress across pages:
    // Estimated pace: ~1.2s per page (min 5s total)
    const estTotalTime = Math.max(5, totalPages * 1.2);
    const timeRatio = Math.min(0.92, elapsedSeconds / estTotalTime);
    const virtualProgress = Math.round(15 + timeRatio * 75);
    const effectiveProgress = Math.min(94, Math.max(backendProgress, virtualProgress));

    // Calculate completed pages
    let completed = 0;
    let active = 1;

    if (effectiveProgress < 25) {
      completed = 0;
      active = 1;
    } else if (effectiveProgress >= 90) {
      completed = totalPages;
      active = totalPages;
    } else {
      // Progress between 25% and 90% corresponds to pages 1 through totalPages
      const pageRatio = (effectiveProgress - 25) / 65;
      completed = Math.min(totalPages, Math.max(0, Math.floor(pageRatio * totalPages)));
      active = Math.min(totalPages, completed + 1);
    }

    return {
      progress: effectiveProgress,
      completedPages: completed,
      activePage: active,
      stageLabel: STAGE_LABELS[backendStage] || 'Recognizing Characters, Glyphs & Layout...',
    };
  };

  const { progress: liveProgress, completedPages, activePage, stageLabel } = computeProgressMetrics();

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      {/* Back link */}
      <div className="mb-6">
        <Link
          to="/"
          className="inline-flex items-center text-xs font-mono uppercase tracking-mono text-ink-soft hover:text-ink transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5 mr-1.5" /> Return to Bench
        </Link>
      </div>

      {/* Header */}
      <div className="border-b border-rule pb-6 mb-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center space-x-2 px-2.5 py-0.5 rounded bg-kraft/80 border border-rule text-ink text-xs font-mono tracking-mono mb-2">
              <Layers className="w-3.5 h-3.5 text-cyan" />
              <span>BENCH TOOL 15 • OPTICAL CHARACTER RECOGNITION</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-normal text-ink tracking-tight font-display">
              Make PDF Searchable
            </h1>
            <p className="mt-2 text-sm sm:text-base text-ink-soft max-w-3xl leading-relaxed">
              Transform scanned folios, archives, and image plates into searchable, selectable documents.
              Embeds an invisible machine-readable text layer behind original page imagery—enabling text selection,
              clipboard copying, and full-text keyword search while preserving exact scan clarity and geometry.
            </p>
          </div>

          <div className="flex flex-col items-end text-xs font-mono text-ink-faint">
            <span className="flex items-center text-moss font-semibold">
              <ShieldCheck className="w-4 h-4 mr-1 text-moss" /> Encrypted Vault Storage
            </span>
            <span className="mt-1">1:1 Scan Geometry Fidelity</span>
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {errorMessage && (
        <div className="mb-6 p-4 rounded bg-red/10 border border-red/30 text-xs sm:text-sm text-red-dark flex items-start space-x-3 shadow-subtle animate-fade-in">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-red" />
          <div className="flex-1">
            <span className="font-semibold block mb-0.5">Processing Notification:</span>
            <span>{typeof errorMessage === 'string' ? errorMessage : JSON.stringify(errorMessage)}</span>
          </div>
          <button
            onClick={() => setErrorMessage('')}
            className="text-xs text-red font-semibold hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* MAIN WORKBENCH */}
      {!file ? (
        // VIEW: EMPTY DROPZONE
        <div className="bg-vellum border border-rule rounded-md p-6 sm:p-10 shadow-subtle">
          <input
            type="file"
            ref={fileInputRef}
            accept=".pdf,application/pdf"
            onChange={(e) => handleFileSelect(e.target.files[0])}
            className="hidden"
          />

          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border border-dashed rounded-md p-10 sm:p-14 text-center cursor-pointer transition-all ${
              isDragging
                ? 'border-cyan bg-cyan/5 scale-[0.99]'
                : 'border-rule hover:border-ink-soft bg-paper/60'
            }`}
          >
            <div className="w-14 h-14 mx-auto mb-4 rounded border border-rule bg-kraft/70 flex items-center justify-center text-ink-soft shadow-subtle">
              <UploadCloud className="w-7 h-7 text-cyan" />
            </div>
            <h3 className="font-display text-lg font-semibold text-ink">
              Select or drop a scanned PDF document here
            </h3>
            <p className="mt-1.5 text-xs text-ink-soft max-w-md mx-auto leading-relaxed">
              Supports single and multi-page scanned documents, receipts, ledgers, and books up to 100 MB.
            </p>
            <div className="mt-5 inline-flex items-center px-4 py-2 rounded bg-ink text-paper text-xs font-semibold shadow hover:bg-ink-soft transition-colors">
              Browse Files
            </div>
          </div>
        </div>
      ) : isProcessing ? (
        // SIMPLIFIED PROCESSING STATION: CLEAN PROGRESS BAR & OCR FUN FACTS
        <div className="max-w-2xl mx-auto bg-vellum border border-rule rounded-md p-6 sm:p-9 shadow-subtle space-y-7 animate-fade-in">
          {/* Header Row: Document Info & Elapsed Timer */}
          <div className="flex items-center justify-between gap-4 pb-5 border-b border-rule">
            <div className="flex items-center space-x-3.5 min-w-0">
              <div className="w-10 h-10 rounded border border-rule bg-kraft/80 flex items-center justify-center text-cyan shrink-0 shadow-subtle">
                <FileText className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base sm:text-lg font-display font-semibold text-ink truncate max-w-sm sm:max-w-md" title={file.name}>
                  {file.name}
                </h2>
                <div className="flex items-center gap-2 text-xs font-mono text-ink-soft mt-0.5">
                  <span>{formatBytes(file.size)}</span>
                  <span>•</span>
                  <span>{totalPages} {totalPages === 1 ? 'Folio' : 'Pages'}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-4 shrink-0">
              <div className="text-right">
                <span className="text-[10px] font-mono text-ink-faint block uppercase tracking-mono">TIME</span>
                <span className="text-sm sm:text-base font-mono font-bold text-ink tabular-nums">
                  {formatTimer(elapsedSeconds)}
                </span>
              </div>
              <button
                onClick={() => {
                  setIsProcessing(false);
                  setErrorMessage('Processing paused by user.');
                }}
                className="text-xs font-mono text-ink-soft hover:text-red transition-colors px-2 py-1 rounded hover:bg-red/5 border border-transparent hover:border-red/20"
                title="Cancel OCR Job"
              >
                Cancel
              </button>
            </div>
          </div>

          {/* Simple Clean Progress Bar Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="font-semibold text-ink flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-cyan animate-pulse" />
                {liveProgress >= 90
                  ? 'Finalizing searchable document...'
                  : totalPages > 1
                  ? `Transcribing page ${activePage} of ${totalPages}...`
                  : 'Recognizing text and geometry...'}
              </span>
              <span className="font-bold text-ink font-mono text-base tabular-nums">
                {liveProgress}%
              </span>
            </div>

            {/* Smooth Progress Bar */}
            <div className="w-full bg-kraft h-3 sm:h-3.5 rounded-full overflow-hidden p-0.5 border border-rule relative shadow-inner">
              <div
                className="h-full bg-gradient-to-r from-cyan via-cyan-600 to-cyan rounded-full transition-all duration-300 ease-out shadow-sm flex items-center justify-end"
                style={{ width: `${Math.max(4, liveProgress)}%` }}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-paper/90 shadow mr-1 animate-pulse" />
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] font-mono text-ink-soft">
              <span>Dual-layer invisible text injection</span>
              <span className="tabular-nums">
                {completedPages} of {totalPages} pages completed
              </span>
            </div>
          </div>

          {/* OCR FUN FACTS CARD */}
          <div className="bg-paper border border-rule/80 rounded-md p-5 sm:p-6 relative overflow-hidden shadow-sm transition-all duration-300">
            {/* Card Header with Category Tag and Manual Prev/Next Controls */}
            <div className="flex items-center justify-between gap-3 mb-3 pb-2.5 border-b border-rule/50">
              <div className="flex items-center space-x-2">
                <span className="w-6 h-6 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600">
                  <Sparkles className="w-3.5 h-3.5" />
                </span>
                <span className="text-[11px] font-mono font-bold uppercase tracking-mono text-ink">
                  DID YOU KNOW?
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-kraft text-ink-soft border border-rule">
                  {OCR_FUN_FACTS[factIndex].tag}
                </span>
              </div>

              {/* Prev / Next Buttons */}
              <div className="flex items-center space-x-1">
                <button
                  onClick={handlePrevFact}
                  className="w-6 h-6 rounded flex items-center justify-center text-ink-soft hover:text-ink hover:bg-kraft/80 transition-colors"
                  aria-label="Previous fact"
                  title="Previous fact"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-[11px] font-mono text-ink-faint tabular-nums px-1">
                  {factIndex + 1}/{OCR_FUN_FACTS.length}
                </span>
                <button
                  onClick={handleNextFact}
                  className="w-6 h-6 rounded flex items-center justify-center text-ink-soft hover:text-ink hover:bg-kraft/80 transition-colors"
                  aria-label="Next fact"
                  title="Next fact"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Fact Body */}
            <div className="min-h-[76px] flex flex-col justify-center">
              <h4 className="font-display font-semibold text-base sm:text-lg text-ink leading-snug">
                {OCR_FUN_FACTS[factIndex].title}
              </h4>
              <p className="mt-1.5 text-xs sm:text-sm font-sans text-ink-soft leading-relaxed">
                {OCR_FUN_FACTS[factIndex].fact}
              </p>
            </div>

            {/* Pagination Dots */}
            <div className="flex items-center justify-center gap-1.5 mt-4 pt-2 border-t border-rule/30">
              {OCR_FUN_FACTS.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setFactIndex(idx)}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    idx === factIndex
                      ? 'w-6 bg-cyan'
                      : 'w-1.5 bg-ink/20 hover:bg-ink/40'
                  }`}
                  aria-label={`Go to fact ${idx + 1}`}
                />
              ))}
            </div>
          </div>

          {/* Reassurance Footer */}
          <div className="flex items-center justify-center text-xs font-mono text-ink-faint space-x-2 pt-1">
            <ShieldCheck className="w-3.5 h-3.5 text-moss shrink-0" />
            <span>Preserving 100% original visual fidelity • Private in-memory processing</span>
          </div>
        </div>
      ) : (
        // VIEW: SPLIT WORKBENCH WITH LIVE DOCUMENT PREVIEW DESK
        <div className="space-y-6">
          {/* Top Completion Highlight Banner (Shown when finished) */}
          {isCompleted && (
            <div className="bg-moss/10 border border-moss/30 rounded-md p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4 shadow-subtle animate-fade-in">
              <div className="flex items-start space-x-3.5">
                <div className="w-9 h-9 rounded-full bg-moss/20 flex items-center justify-center text-moss shrink-0 mt-0.5">
                  <CheckCircle2 className="w-5 h-5 text-moss" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-display font-semibold text-ink">
                    Searchable PDF Successfully Generated!
                  </h3>
                  <p className="text-xs text-ink-soft mt-0.5">
                    Original scan plates preserved with invisible, searchable text layer embedded. Ctrl+F and text selection ready.
                  </p>
                </div>
              </div>
              <button
                onClick={() => handleDownload(currentJob.job_id, currentJob.original_filename)}
                disabled={isDownloading}
                className="inline-flex items-center justify-center px-5 py-2.5 rounded bg-moss hover:bg-moss/90 text-paper font-sans font-semibold text-xs shadow-ink-button transition-all shrink-0 min-h-[40px]"
              >
                {isDownloading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Downloading...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 mr-2" /> Download Searchable PDF
                  </>
                )}
              </button>
            </div>
          )}
          {/* Main Workspace Grid: Left = Preview Desk, Right = Controls & Telemetry */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* LEFT COLUMN: LIVE DOCUMENT PREVIEW DESK (7 Cols) */}
            <div className="lg:col-span-7 bg-vellum border border-rule rounded-md p-4 sm:p-5 shadow-subtle flex flex-col space-y-3 min-w-0">
              {/* Preview Desk Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-rule text-xs font-mono">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-ink uppercase tracking-mono">
                    DOCUMENT PROOFING
                  </span>
                  {numPages > 1 && (
                    <span className="px-1.5 py-0.5 rounded bg-kraft border border-rule text-[10px] text-ink-soft">
                      Page {currentPage} of {numPages}
                    </span>
                  )}
                  {pageInfo && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-kraft/90 border border-rule text-[10px] text-ink-soft tracking-tight">
                      {pageInfo.isLandscape ? 'Landscape Folio' : 'Portrait Folio'}
                    </span>
                  )}
                </div>

                {/* Searchable vs Original Toggle (when completed) */}
                {isCompleted && searchablePdfDoc && (
                  <div className="flex items-center rounded border border-rule bg-paper p-0.5">
                    <button
                      onClick={() => setPreviewView('searchable')}
                      className={`px-2 py-1 text-[11px] font-sans font-semibold rounded transition-colors ${
                        previewView === 'searchable'
                          ? 'bg-moss text-paper shadow-sm'
                          : 'text-ink-soft hover:text-ink'
                      }`}
                    >
                      Searchable PDF
                    </button>
                    <button
                      onClick={() => setPreviewView('original')}
                      className={`px-2 py-1 text-[11px] font-sans font-semibold rounded transition-colors ${
                        previewView === 'original'
                          ? 'bg-ink text-paper shadow-sm'
                          : 'text-ink-soft hover:text-ink'
                      }`}
                    >
                      Original Scan
                    </button>
                  </div>
                )}

                {/* Viewport Actions: Zoom, Rotate & Fullscreen */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={zoomOut}
                    className="p-1 rounded border border-rule bg-paper hover:bg-kraft text-ink-soft hover:text-ink transition-colors"
                    title="Zoom Out"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setZoomScale(1.0)}
                    className="px-1.5 py-0.5 rounded text-[10px] text-ink-faint hover:text-ink tabular-nums border border-transparent hover:border-rule"
                    title="Reset Zoom to 100% Fit"
                  >
                    {Math.round(zoomScale * 100)}%
                  </button>
                  <button
                    onClick={zoomIn}
                    className="p-1 rounded border border-rule bg-paper hover:bg-kraft text-ink-soft hover:text-ink transition-colors"
                    title="Zoom In"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setPageRotation((r) => (r + 90) % 360)}
                    className="p-1 rounded border border-rule bg-paper hover:bg-kraft text-ink-soft hover:text-ink transition-colors"
                    title="Rotate View (90° Clockwise)"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setFullscreenModalOpen(true)}
                    className="p-1 ml-0.5 rounded border border-rule bg-paper hover:bg-kraft text-ink-soft hover:text-ink transition-colors"
                    title="Fullscreen Preview"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Folio Easel Mat */}
              <div
                ref={easelRef}
                className="relative bg-kraft/40 border border-rule/70 rounded p-4 sm:p-6 min-h-[380px] sm:min-h-[460px] max-h-[580px] flex items-center justify-center overflow-auto min-w-0 w-full"
              >
                {previewLoading && (
                  <div className="absolute inset-0 z-10 bg-vellum/70 backdrop-blur-xs flex flex-col items-center justify-center gap-2">
                    <Loader2 className="w-6 h-6 animate-spin text-cyan" />
                    <span className="text-xs font-mono text-ink-soft">Rendering folio preview...</span>
                  </div>
                )}

                {previewError ? (
                  <div className="text-center p-6 text-xs text-ink-soft max-w-xs">
                    <AlertTriangle className="w-6 h-6 mx-auto mb-2 text-marigold" />
                    <p>{previewError}</p>
                  </div>
                ) : (
                  <div className="relative max-w-full max-h-full flex items-center justify-center">
                    {/* Rendered Canvas Sheet */}
                    <canvas
                      ref={canvasRef}
                      className="max-w-full max-h-full w-auto h-auto rounded border border-rule/60 bg-white shadow-ink-lift transition-transform duration-150 object-contain"
                    />
                  </div>
                )}
              </div>

              {/* Bottom Page Navigation Controls */}
              {numPages > 1 && (
                <div className="flex items-center justify-between pt-2 border-t border-rule text-xs font-mono text-ink-soft">
                  <button
                    onClick={prevPage}
                    disabled={currentPage <= 1 || isProcessing}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-rule bg-paper hover:bg-kraft disabled:opacity-40 transition-colors"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" /> Previous Page
                  </button>

                  <div className="flex items-center gap-1.5">
                    {Array.from({ length: Math.min(numPages, 7) }, (_, idx) => {
                      const pageIdx = idx + 1;
                      return (
                        <button
                          key={pageIdx}
                          onClick={() => setCurrentPage(pageIdx)}
                          disabled={isProcessing}
                          className={`w-6 h-6 rounded text-[11px] font-mono transition-colors ${
                            currentPage === pageIdx
                              ? 'bg-ink text-paper font-semibold'
                              : 'bg-paper border border-rule hover:bg-kraft text-ink-soft'
                          }`}
                        >
                          {pageIdx}
                        </button>
                      );
                    })}
                    {numPages > 7 && (
                      <span className="text-ink-faint text-[10px] px-1">... {numPages}</span>
                    )}
                  </div>

                  <button
                    onClick={nextPage}
                    disabled={currentPage >= numPages || isProcessing}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-rule bg-paper hover:bg-kraft disabled:opacity-40 transition-colors"
                  >
                    Next Page <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            {/* RIGHT COLUMN: ACTION & TELEMETRY DESK (5 Cols) */}
            <div className="lg:col-span-5 space-y-4 min-w-0">
              {/* 1. Folio Dossier Card */}
              <div className="bg-vellum border border-rule rounded-md p-4 sm:p-5 shadow-subtle space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 truncate">
                    <div className="w-9 h-9 rounded border border-rule bg-kraft/70 flex items-center justify-center text-ink shrink-0 mt-0.5">
                      <FileText className="w-5 h-5 text-cyan" />
                    </div>
                    <div className="truncate">
                      <h3
                        className="font-display font-semibold text-sm text-ink truncate"
                        title={file.name}
                      >
                        {file.name}
                      </h3>
                      <div className="flex items-center gap-2 text-[11px] font-mono text-ink-faint mt-0.5">
                        <span>{formatBytes(file.size)}</span>
                        <span>•</span>
                        <span>
                          {numPages > 1 ? `${numPages} Pages` : `${numPages} Page`}
                        </span>
                      </div>
                    </div>
                  </div>

                  {!isProcessing && (
                    <button
                      onClick={handleReset}
                      className="p-1.5 rounded border border-rule bg-paper hover:bg-red/10 hover:text-red hover:border-red/30 text-ink-soft transition-colors shrink-0"
                      title="Remove folio and choose another"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Pre-Flight Inspection Diagnostic */}
                {isInspecting ? (
                  <div className="p-3 rounded bg-cyan/5 border border-cyan/20 flex items-center space-x-2.5 text-xs text-cyan">
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                    <span className="font-mono text-[11px]">
                      Analyzing page structure for existing digital text...
                    </span>
                  </div>
                ) : inspectionResult ? (
                  inspectionResult.has_digital_text ? (
                    <div className="p-3.5 rounded bg-marigold/15 border border-marigold/40 text-xs text-ink space-y-2.5">
                      <div className="flex items-start space-x-2">
                        <AlertTriangle className="w-4 h-4 text-marigold shrink-0 mt-0.5" />
                        <div>
                          <p className="font-bold text-xs text-ink">
                            Searchable Text Already Detected
                          </p>
                          <p className="text-ink-soft text-[11px] mt-0.5 leading-relaxed">
                            {inspectionResult.message}
                          </p>
                        </div>
                      </div>

                      <label className="flex items-start space-x-2 pt-2 border-t border-marigold/30 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={forceOcr}
                          onChange={(e) => setForceOcr(e.target.checked)}
                          disabled={isProcessing}
                          className="w-4 h-4 rounded border-rule text-cyan focus:ring-cyan mt-0.5"
                        />
                        <span className="font-medium text-[11px] text-ink leading-snug">
                          Force OCR: Proceed with full optical transcription pass (useful for mixed handwriting or faint scans)
                        </span>
                      </label>
                    </div>
                  ) : (
                    <div className="p-3 rounded bg-moss/10 border border-moss/30 text-xs text-moss flex items-center space-x-2">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span className="font-medium text-[11px]">
                        Verified Scanned Document: Pure image plate without text. Perfectly suited for optical character recognition.
                      </span>
                    </div>
                  )
                ) : null}
              </div>

              {/* 2. Processing Pipeline Telemetry (Shown upon completion) */}
              {isCompleted && currentJob && (
                <div className="bg-vellum border border-rule rounded-md p-4 sm:p-5 shadow-subtle space-y-4 animate-fade-in">
                  <div>
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-cyan font-semibold uppercase tracking-mono">
                        {currentJob.status}
                      </span>
                      <span className="text-ink-faint tabular-nums">
                        {currentJob.progress || (isCompleted ? 100 : 10)}%
                      </span>
                    </div>

                    <h4 className="font-display text-base font-semibold text-ink mt-1">
                      {STAGE_LABELS[currentJob.processing_stage] || 'Processing Document...'}
                    </h4>
                  </div>

                  {/* Smooth Progress Bar */}
                  <div className="w-full bg-kraft h-2 rounded overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 ease-out ${
                        isCompleted ? 'bg-moss' : 'bg-cyan'
                      }`}
                      style={{
                        width: `${isCompleted ? 100 : Math.max(8, currentJob.progress || 10)}%`,
                      }}
                    />
                  </div>

                  {/* 4 Pipeline Milestones */}
                  <div className="grid grid-cols-2 gap-2 pt-1 text-left text-xs font-mono">
                    <div
                      className={`p-2.5 rounded border ${
                        currentJob.progress >= 20 || isCompleted
                          ? 'bg-moss/10 border-moss/30 text-moss'
                          : 'bg-paper border-rule text-ink-faint'
                      }`}
                    >
                      <div className="font-bold flex items-center text-[11px]">
                        {currentJob.progress >= 20 || isCompleted ? (
                          <Check className="w-3.5 h-3.5 mr-1" />
                        ) : (
                          <span className="mr-1">1.</span>
                        )}
                        Ingestion
                      </div>
                      <div className="text-[10px] mt-0.5 opacity-80">Encrypted upload</div>
                    </div>

                    <div
                      className={`p-2.5 rounded border ${
                        currentJob.progress >= 40 || isCompleted
                          ? 'bg-cyan/10 border-cyan/30 text-cyan'
                          : 'bg-paper border-rule text-ink-faint'
                      }`}
                    >
                      <div className="font-bold flex items-center text-[11px]">
                        {currentJob.progress >= 75 || isCompleted ? (
                          <Check className="w-3.5 h-3.5 mr-1" />
                        ) : (
                          <span className="mr-1">2.</span>
                        )}
                        Recognition
                      </div>
                      <div className="text-[10px] mt-0.5 opacity-80">Text & layout matrix</div>
                    </div>

                    <div
                      className={`p-2.5 rounded border ${
                        currentJob.progress >= 80 || isCompleted
                          ? 'bg-cyan/10 border-cyan/30 text-cyan'
                          : 'bg-paper border-rule text-ink-faint'
                      }`}
                    >
                      <div className="font-bold flex items-center text-[11px]">
                        {currentJob.progress >= 90 || isCompleted ? (
                          <Check className="w-3.5 h-3.5 mr-1" />
                        ) : (
                          <span className="mr-1">3.</span>
                        )}
                        Text Layer
                      </div>
                      <div className="text-[10px] mt-0.5 opacity-80">Coordinate injection</div>
                    </div>

                    <div
                      className={`p-2.5 rounded border ${
                        isCompleted
                          ? 'bg-moss/10 border-moss/30 text-moss'
                          : 'bg-paper border-rule text-ink-faint'
                      }`}
                    >
                      <div className="font-bold flex items-center text-[11px]">
                        {isCompleted ? (
                          <Check className="w-3.5 h-3.5 mr-1" />
                        ) : (
                          <span className="mr-1">4.</span>
                        )}
                        Ready
                      </div>
                      <div className="text-[10px] mt-0.5 opacity-80">Searchable PDF</div>
                    </div>
                  </div>
                </div>
              )}

              {/* 3. Action Panel: Generate or Download */}
              <div className="bg-vellum border border-rule rounded-md p-4 sm:p-5 shadow-subtle space-y-4">
                {!isProcessing && !isCompleted && (
                  <div className="space-y-4">
                    <div className="space-y-2 text-xs font-mono text-ink-soft">
                      <div className="flex justify-between pb-1.5 border-b border-rule">
                        <span className="text-ink-faint">OUTPUT FORMAT</span>
                        <span className="font-semibold text-ink">Dual-Layer Searchable PDF</span>
                      </div>
                      <div className="flex justify-between pb-1.5 border-b border-rule">
                        <span className="text-ink-faint">PAGE FIDELITY</span>
                        <span className="font-semibold text-ink">100% Unaltered Scan Plate</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-ink-faint">SEARCH CAPABILITY</span>
                        <span className="font-semibold text-cyan">Ctrl+F & Select Ready</span>
                      </div>
                    </div>

                    <button
                      onClick={handleStartOCR}
                      disabled={isInspecting}
                      className="w-full inline-flex items-center justify-center px-5 py-3 rounded bg-red hover:bg-red-dark text-paper font-sans font-semibold text-sm shadow-ink-red transition-all disabled:opacity-50 min-h-[44px]"
                    >
                      <Sparkles className="w-4 h-4 mr-2" />
                      Make PDF Searchable
                    </button>
                  </div>
                )}

                {isCompleted && (
                  <div className="space-y-4">
                    <div className="p-3 rounded bg-moss/10 border border-moss/30 text-xs text-moss space-y-1">
                      <div className="flex items-center gap-1.5 font-bold">
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        <span>Searchable PDF Ready</span>
                      </div>
                      <p className="text-[11px] text-ink-soft leading-normal">
                        Machine-readable invisible text layer has been injected with exact glyph alignment.
                      </p>
                    </div>

                    {/* Download Button */}
                    <button
                      onClick={() => handleDownload(currentJob.job_id, currentJob.original_filename)}
                      disabled={isDownloading}
                      className="w-full inline-flex items-center justify-center px-5 py-3 rounded bg-moss hover:bg-moss/90 text-paper font-sans font-semibold text-sm shadow-ink-button transition-all shrink-0 min-h-[44px]"
                    >
                      {isDownloading ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Downloading...
                        </>
                      ) : (
                        <>
                          <Download className="w-4 h-4 mr-2" /> Download Searchable PDF
                        </>
                      )}
                    </button>

                    <div className="flex items-center justify-between pt-2 border-t border-rule text-xs font-mono">
                      <span className="text-ink-faint text-[11px]">
                        {isAuthenticated ? 'Saved to member vault.' : 'Guest file valid for 24h.'}
                      </span>
                      <button
                        onClick={handleReset}
                        className="text-cyan hover:underline inline-flex items-center text-[11px] font-semibold"
                      >
                        <RefreshCw className="w-3 h-3 mr-1" /> Process Another
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* RECENT OCR HISTORY */}
      {recentJobs.length > 0 && (
        <div className="mt-12">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-ink font-display uppercase tracking-mono flex items-center">
              <Clock className="w-4 h-4 mr-2 text-cyan" /> Recent OCR History
            </h3>
            <button
              onClick={loadRecentJobs}
              className="text-xs text-ink-soft hover:text-ink font-mono"
            >
              Refresh
            </button>
          </div>

          <div className="bg-vellum border border-rule rounded-md overflow-hidden shadow-subtle">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-kraft/60 border-b border-rule text-ink-soft">
                <tr>
                  <th className="py-2.5 px-4 font-semibold">Document</th>
                  <th className="py-2.5 px-4 font-semibold">Pages</th>
                  <th className="py-2.5 px-4 font-semibold">Status</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule/60">
                {recentJobs.map((j) => (
                  <tr key={j.job_id} className="hover:bg-paper/60 transition-colors">
                    <td
                      className="py-3 px-4 text-ink font-sans font-medium truncate max-w-[220px]"
                      title={j.filename}
                    >
                      {j.filename}
                    </td>
                    <td className="py-3 px-4 text-ink-soft">{j.page_count}</td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                          j.status === 'COMPLETED'
                            ? 'bg-moss/10 text-moss border border-moss/20'
                            : j.status === 'FAILED'
                            ? 'bg-red/10 text-red border border-red/20'
                            : 'bg-cyan/10 text-cyan border border-cyan/20 animate-pulse'
                        }`}
                      >
                        {j.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      {j.status === 'COMPLETED' ? (
                        <button
                          onClick={() => handleDownload(j.job_id, j.filename)}
                          className="text-cyan font-bold hover:underline inline-flex items-center"
                        >
                          <Download className="w-3.5 h-3.5 mr-1" /> Download
                        </button>
                      ) : (
                        <span className="text-ink-faint">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* FULLSCREEN MODAL (Opens DocumentPreviewModal when requested) */}
      {fullscreenModalOpen && file && (
        <DocumentPreviewModal
          file={{
            original_filename: isCompleted
              ? `searchable_${file.name}`
              : file.name,
            download_url: isCompleted && currentJob?.job_id
              ? `/api/v1/ocr/jobs/${currentJob.job_id}/download`
              : null,
            file_size_bytes: file.size,
            output_file_size_bytes: currentJob?.output_file_size_bytes,
            created_at: new Date().toISOString(),
          }}
          onClose={() => setFullscreenModalOpen(false)}
        />
      )}
    </div>
  );
};

export default OCRStudio;
