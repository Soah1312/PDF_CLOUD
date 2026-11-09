import React, { useState, useRef, useEffect } from 'react';
import { useParams, Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Layers,
  Scissors,
  Minimize2,
  Lock,
  RotateCw,
  Stamp,
  Image as ImageIcon,
  FileImage,
  FileText,
  FileInput,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
  Download,
  Trash2,
  MoveUp,
  MoveDown,
  RefreshCw,
  Eye,
  EyeOff,
  FolderLock,
  ArrowLeft,
  ShieldCheck,
  ShieldAlert,
  Fingerprint,
  ChevronRight,
  SlidersHorizontal,
  X,
  FileCheck,
  WifiOff,
  CornerDownRight,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  processMergePDF,
  processSplitPDF,
  processRotatePDF,
  processProtectPDF,
  processCompressPDF,
  processWatermarkPDF,
  processPdfToImages,
  processImagesToPdf,
  processPdfToWord,
  processWordToPdf,
  embedCanaryWatermark,
  verifyCanaryDocument,
} from '../services/api';
import { BINDERY_TOOLS } from '../config/tools';
import { renderPdfThumbnail, getPdfPageCount } from '../utils/pdfThumbnails';

const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export default function ToolRunner() {
  const { toolId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  // Find tool specification
  const currentTool =
    BINDERY_TOOLS.find((t) => t.id === toolId) || BINDERY_TOOLS[0];
  const ToolIcon = currentTool.icon;

  // File state
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [thumbnails, setThumbnails] = useState({});
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  // Split-specific page state
  const [splitPageCount, setSplitPageCount] = useState(1);
  const [cutPoints, setCutPoints] = useState(new Set()); // Cuts after page N
  const [splitMode, setSplitMode] = useState('ranges'); // 'ranges', 'every_n', 'selected'
  const [everyNPages, setEveryNPages] = useState(1);
  const [splitRange, setSplitRange] = useState('');

  // Tool specific options
  const [rotateAngle, setRotateAngle] = useState(90);
  const [protectPassword, setProtectPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [allowPrinting, setAllowPrinting] = useState(true);
  const [allowCopying, setAllowCopying] = useState(true);
  const [compressLevel, setCompressLevel] = useState('medium');
  const [watermarkText, setWatermarkText] = useState('CONFIDENTIAL');
  const [watermarkOpacity, setWatermarkOpacity] = useState(0.3);
  const [watermarkRotation, setWatermarkRotation] = useState(45);
  const [watermarkColor, setWatermarkColor] = useState('#D9441F');
  const [imageFormat, setImageFormat] = useState('png');
  const [imageDpi, setImageDpi] = useState(150);
  const [canaryRecipientName, setCanaryRecipientName] = useState('');
  const [canaryRecipientEmail, setCanaryRecipientEmail] = useState('');
  const [canaryOrganization, setCanaryOrganization] = useState('');
  const [canaryTrackingNote, setCanaryTrackingNote] = useState('');

  // Password-protected PDF prompt state
  const [pdfPasswordPrompt, setPdfPasswordPrompt] = useState(false);
  const [unlockPassword, setUnlockPassword] = useState('');

  // Execution & Progress state
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStage, setProcessingStage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [resultData, setResultData] = useState(null);
  const [isMobileOptionsOpen, setIsMobileOptionsOpen] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const abortControllerRef = useRef(null);

  // Detect offline status
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Preload files from Home page navigation
  useEffect(() => {
    if (location.state?.preloadedFiles?.length) {
      handleFiles(location.state.preloadedFiles);
    }
  }, [location.state]);

  // Load thumbnails for selected files
  useEffect(() => {
    let isCancelled = false;

    async function loadThumbnails() {
      for (const file of selectedFiles) {
        const key = `${file.name}-${file.size}`;
        if (!thumbnails[key]) {
          if (file.name.toLowerCase().endsWith('.pdf')) {
            const thumbUrl = await renderPdfThumbnail(file, 1);
            if (!isCancelled && thumbUrl) {
              setThumbnails((prev) => ({ ...prev, [key]: thumbUrl }));
            }
            if (currentTool.id === 'split') {
              const pages = await getPdfPageCount(file);
              if (!isCancelled) setSplitPageCount(pages);
            }
          } else if (file.type.startsWith('image/')) {
            const objectUrl = URL.createObjectURL(file);
            if (!isCancelled) {
              setThumbnails((prev) => ({ ...prev, [key]: objectUrl }));
            }
          }
        }
      }
    }

    if (selectedFiles.length > 0) {
      loadThumbnails();
    }

    return () => {
      isCancelled = true;
    };
  }, [selectedFiles, currentTool.id]);

  // Two-way sync: cut points -> split range string
  const toggleCut = (pageIndex) => {
    setCutPoints((prev) => {
      const next = new Set(prev);
      if (next.has(pageIndex)) {
        next.delete(pageIndex);
      } else {
        next.add(pageIndex);
      }

      // Convert cut points to ranges
      const sorted = Array.from(next).sort((a, b) => a - b);
      let ranges = [];
      let start = 1;
      sorted.forEach((cut) => {
        ranges.push(start === cut ? `${start}` : `${start}-${cut}`);
        start = cut + 1;
      });
      if (start <= splitPageCount) {
        ranges.push(start === splitPageCount ? `${start}` : `${start}-${splitPageCount}`);
      }
      setSplitRange(ranges.join(', '));
      return next;
    });
  };

  const handleFiles = (newFiles) => {
    setErrorMessage('');
    const filesArray = Array.from(newFiles);
    if (!filesArray.length) return;

    // Validate size limit (100 MB)
    for (const f of filesArray) {
      if (f.size > MAX_FILE_SIZE_BYTES) {
        setErrorMessage(
          `Document "${f.name}" exceeds the 100 MB size limit (${formatBytes(f.size)}).`
        );
        return;
      }
    }

    // Validate file type
    if (currentTool.accept) {
      const allowed = currentTool.accept.split(',').map((s) => s.trim().toLowerCase());
      for (const f of filesArray) {
        const ext = '.' + f.name.split('.').pop().toLowerCase();
        const matchesType = allowed.some(
          (type) => type === ext || (type.includes('/') && f.type === type)
        );
        if (!matchesType && allowed.length > 0) {
          setErrorMessage(
            `File "${f.name}" is not supported by ${currentTool.title}. Expected ${currentTool.accept}.`
          );
          return;
        }
      }
    }

    if (currentTool.multiple) {
      setSelectedFiles((prev) => [...prev, ...filesArray]);
    } else {
      setSelectedFiles([filesArray[0]]);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer?.files) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const removeFile = (index) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const moveFile = (index, direction) => {
    setSelectedFiles((prev) => {
      const updated = [...prev];
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= updated.length) return prev;
      const temp = updated[index];
      updated[index] = updated[targetIndex];
      updated[targetIndex] = temp;
      return updated;
    });
  };

  // Bind API method by tool ID
  const getToolApi = () => {
    switch (currentTool.id) {
      case 'merge':
        return processMergePDF;
      case 'split':
        return processSplitPDF;
      case 'rotate':
        return processRotatePDF;
      case 'protect':
        return processProtectPDF;
      case 'compress':
        return processCompressPDF;
      case 'watermark':
        return processWatermarkPDF;
      case 'to-images':
        return processPdfToImages;
      case 'from-images':
        return processImagesToPdf;
      case 'to-word':
        return processPdfToWord;
      case 'from-word':
        return processWordToPdf;
      case 'canary':
        return embedCanaryWatermark;
      case 'verify-canary':
        return verifyCanaryDocument;
      default:
        return processMergePDF;
    }
  };

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsProcessing(false);
    setProcessingStage('Operation aborted by user.');
  };

  const handleExecute = async () => {
    if (!selectedFiles.length) {
      setErrorMessage('Please place at least one document on the bench.');
      return;
    }

    if (currentTool.id === 'protect') {
      if (!protectPassword) {
        setErrorMessage('Please specify an encryption password.');
        return;
      }
      if (confirmPassword && protectPassword !== confirmPassword) {
        setErrorMessage('Passwords do not match.');
        return;
      }
    }

    setIsProcessing(true);
    setProcessingStage('Mounting document stream in RAM...');
    setErrorMessage('');
    setResultData(null);

    abortControllerRef.current = new AbortController();

    try {
      const formData = new FormData();

      if (currentTool.multiple) {
        selectedFiles.forEach((file) => formData.append('files', file));
      } else {
        formData.append('file', selectedFiles[0]);
      }

      if (currentTool.id === 'rotate') {
        formData.append('angle', rotateAngle);
      } else if (currentTool.id === 'protect') {
        formData.append('password', protectPassword);
      } else if (currentTool.id === 'compress') {
        formData.append('level', compressLevel);
      } else if (currentTool.id === 'watermark') {
        formData.append('watermark_text', watermarkText);
        formData.append('opacity', watermarkOpacity);
        formData.append('rotation', watermarkRotation);
        formData.append('color', watermarkColor);
      } else if (currentTool.id === 'split') {
        if (splitRange) {
          formData.append('page_ranges', splitRange);
        }
      } else if (currentTool.id === 'to-images') {
        formData.append('format', imageFormat);
        formData.append('dpi', imageDpi);
      } else if (currentTool.id === 'canary') {
        if (canaryRecipientName) formData.append('recipient_name', canaryRecipientName);
        if (canaryRecipientEmail) formData.append('recipient_email', canaryRecipientEmail);
        if (canaryOrganization) formData.append('organization', canaryOrganization);
        if (canaryTrackingNote) formData.append('tracking_note', canaryTrackingNote);
      }

      setProcessingStage(
        currentTool.id === 'compress'
          ? 'Compressing content streams & font subsets...'
          : currentTool.id === 'merge'
          ? 'Binding and interleaving folios...'
          : currentTool.id === 'canary'
          ? 'Computing SHA-256 and embedding invisible markers...'
          : 'Processing document on bench...'
      );

      const apiFunc = getToolApi();
      const res = await apiFunc(formData);

      // Trigger slight haptic pulse on devices that support it
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(15);
      }

      setResultData(res);
    } catch (err) {
      if (err.name === 'CanceledError' || err.name === 'AbortError') {
        setErrorMessage('Execution cancelled.');
      } else {
        console.error('Processing error:', err);
        const detail =
          err.response?.data?.detail ||
          err.message ||
          'Operation failed. Please verify file integrity.';
        if (typeof detail === 'string' && detail.toLowerCase().includes('password')) {
          setPdfPasswordPrompt(true);
        }
        setErrorMessage(detail);
      }
    } finally {
      setIsProcessing(false);
      setProcessingStage('');
    }
  };

  const resetBench = () => {
    setSelectedFiles([]);
    setResultData(null);
    setErrorMessage('');
    setCutPoints(new Set());
    setSplitRange('');
  };

  // Chain output file into another tool without re-uploading
  const continueWithTool = async (targetToolId) => {
    if (!resultData?.download_url) return;
    try {
      // Fetch resulting blob to pass as preloaded file
      const response = await fetch(resultData.download_url);
      const blob = await response.blob();
      const filename = resultData.output_filename || 'processed.pdf';
      const file = new File([blob], filename, { type: 'application/pdf' });
      navigate(`/tools/${targetToolId}`, {
        state: { preloadedFiles: [file] },
      });
    } catch (err) {
      console.error('Failed to chain document to next tool:', err);
      navigate(`/tools/${targetToolId}`);
    }
  };

  const totalBytes = selectedFiles.reduce((acc, f) => acc + f.size, 0);

  return (
    <div className="min-h-screen bg-paper text-ink pb-28 relative">
      {/* Offline Warning Banner */}
      {isOffline && (
        <div className="bg-kraft border-b border-rule px-4 py-2 text-center text-xs font-mono text-ink flex items-center justify-center gap-2">
          <WifiOff className="w-3.5 h-3.5 text-red" />
          <span>You appear to be offline. Reconnecting to bench origin...</span>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 sm:pt-8 space-y-6">
        {/* Navigation Breadcrumb & Tool Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-rule">
          <div className="space-y-1">
            <Link
              to="/"
              className="inline-flex items-center text-xs font-mono text-ink-soft hover:text-ink transition-colors mb-1"
            >
              <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Return to Bench
            </Link>
            <div className="flex items-center gap-2.5">
              <div
                className="w-8 h-8 rounded border border-rule flex items-center justify-center text-ink shrink-0"
                style={{ backgroundColor: currentTool.tint || 'var(--kraft)' }}
              >
                <ToolIcon className="w-4 h-4" strokeWidth={1.5} />
              </div>
              <h1 className="font-display text-2xl sm:text-3xl tracking-tight text-ink">
                {currentTool.title}
              </h1>
              <span className="font-mono text-[10px] uppercase tracking-mono px-2 py-0.5 rounded border border-rule bg-kraft/70 text-ink-soft">
                {currentTool.verb}
              </span>
            </div>
            <p className="text-xs text-ink-soft max-w-xl">
              {currentTool.description}
            </p>
          </div>

          {/* Phase Indicator Pills */}
          <div className="flex items-center gap-1.5 font-mono text-[11px] self-start sm:self-center">
            <span
              className={`px-2 py-0.5 rounded border ${
                selectedFiles.length === 0
                  ? 'bg-ink text-paper border-ink font-semibold'
                  : 'bg-vellum text-ink-soft border-rule'
              }`}
            >
              1. Add
            </span>
            <ChevronRight className="w-3 h-3 text-rule-strong" />
            <span
              className={`px-2 py-0.5 rounded border ${
                selectedFiles.length > 0 && !resultData
                  ? 'bg-ink text-paper border-ink font-semibold'
                  : 'bg-vellum text-ink-soft border-rule'
              }`}
            >
              2. Configure
            </span>
            <ChevronRight className="w-3 h-3 text-rule-strong" />
            <span
              className={`px-2 py-0.5 rounded border ${
                resultData
                  ? 'bg-red text-vellum border-red font-semibold'
                  : 'bg-vellum text-ink-soft border-rule'
              }`}
            >
              3. Result
            </span>
          </div>
        </div>

        {/* PHASE 1: ADD (Empty State Dropzone) */}
        {selectedFiles.length === 0 && !resultData && (
          <div className="max-w-3xl mx-auto pt-6 space-y-4">
            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => handleFiles(e.target.files)}
              accept={currentTool.accept}
              multiple={currentTool.multiple}
              className="hidden"
            />

            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={`relative cursor-pointer p-12 sm:p-16 rounded-md border-2 border-dashed transition-all duration-150 text-center select-none ${
                isDragging
                  ? 'border-red bg-kraft/70 -translate-y-0.5 shadow-ink-lift'
                  : 'border-rule hover:border-rule-strong bg-vellum hover:bg-kraft/30 shadow-subtle'
              }`}
            >
              {/* Corner Registration Marks (+) */}
              <span className="absolute top-2 left-2 font-mono text-xs text-rule-strong">+</span>
              <span className="absolute top-2 right-2 font-mono text-xs text-rule-strong">+</span>
              <span className="absolute bottom-2 left-2 font-mono text-xs text-rule-strong">+</span>
              <span className="absolute bottom-2 right-2 font-mono text-xs text-rule-strong">+</span>

              <div className="max-w-md mx-auto space-y-3">
                <div
                  className="w-12 h-12 rounded border border-rule mx-auto flex items-center justify-center text-ink shadow-sm"
                  style={{ backgroundColor: currentTool.tint || 'var(--paper)' }}
                >
                  <UploadCloud className="w-6 h-6 text-ink-soft" strokeWidth={1.5} />
                </div>

                <div>
                  <p className="font-display text-xl text-ink">
                    {isDragging
                      ? 'Release to add to workbench'
                      : `Place ${currentTool.multiple ? 'documents' : 'a document'} on the bench`}
                  </p>
                  <p className="text-xs text-ink-soft mt-1">
                    Drag and drop {currentTool.accept.toUpperCase()} or click to select from storage.
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-2 pt-2 text-[11px] font-mono text-ink-faint">
                  <span className="px-2 py-0.5 rounded bg-kraft/60 border border-rule">
                    Maximum limit: 100 MB
                  </span>
                  <span className="px-2 py-0.5 rounded bg-kraft/60 border border-rule">
                    Zero retention guarantee
                  </span>
                </div>
              </div>
            </div>

            {errorMessage && (
              <div className="p-3.5 rounded border border-red/40 bg-red/10 text-xs text-ink flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red" />
                <div>
                  <p className="font-semibold text-red">Document issue</p>
                  <p className="text-ink-soft mt-0.5">{errorMessage}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* PHASE 2: ARRANGE & CONFIGURE (Left: Thumbnails & Page Area | Right: Sticky Panel) */}
        {selectedFiles.length > 0 && !resultData && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Area (8 cols on desktop): File & Page Workspace */}
            <div className="lg:col-span-8 space-y-6">
              {/* Workspace Header Actions */}
              <div className="flex items-center justify-between p-3 rounded border border-rule bg-vellum">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-ink">
                    Folios on Workbench ({selectedFiles.length})
                  </span>
                  <span className="text-xs font-mono text-ink-soft tabular-nums">
                    [{formatBytes(totalBytes)}]
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {currentTool.multiple && (
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="px-2.5 py-1 text-xs font-mono rounded border border-rule bg-paper hover:bg-kraft text-ink transition-colors"
                    >
                      + Add More
                    </button>
                  )}
                  <button
                    onClick={resetBench}
                    className="px-2.5 py-1 text-xs font-mono rounded border border-rule bg-paper hover:bg-red/10 text-red transition-colors"
                  >
                    Clear All
                  </button>
                </div>
              </div>

              {/* Hidden file input for adding more */}
              <input
                type="file"
                ref={fileInputRef}
                onChange={(e) => handleFiles(e.target.files)}
                accept={currentTool.accept}
                multiple={currentTool.multiple}
                className="hidden"
              />

              {/* Tool-Specific Interactive Work Area */}

              {/* 1. MERGE: Reorderable List of Files with Page Count */}
              {currentTool.id === 'merge' && (
                <div className="space-y-3">
                  <p className="text-xs text-ink-soft font-mono">
                    Drag folios or use arrows to adjust collation sequence before binding:
                  </p>
                  <div className="space-y-2">
                    {selectedFiles.map((file, idx) => {
                      const thumbKey = `${file.name}-${file.size}`;
                      const thumb = thumbnails[thumbKey];
                      return (
                        <div
                          key={`${file.name}-${idx}`}
                          className="flex items-center justify-between p-3 rounded border border-rule bg-vellum hover:border-rule-strong hover:shadow-subtle transition-all duration-120 group"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            {/* Sequence number */}
                            <span className="font-mono text-xs font-semibold text-ink-faint w-5 text-right shrink-0">
                              {idx + 1}.
                            </span>

                            {/* Thumbnail or placeholder */}
                            <div className="w-12 h-16 rounded border border-rule bg-paper flex items-center justify-center overflow-hidden shrink-0 shadow-sm relative">
                              {thumb ? (
                                <img
                                  src={thumb}
                                  alt={`Folio ${idx + 1}`}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="p-1 text-center">
                                  <FileText className="w-5 h-5 mx-auto text-ink-faint" />
                                  <span className="text-[8px] font-mono text-ink-faint">
                                    P.1
                                  </span>
                                </div>
                              )}
                            </div>

                            <div className="truncate">
                              <p className="text-xs font-medium text-ink truncate">
                                {file.name}
                              </p>
                              <p className="text-[11px] font-mono text-ink-soft tabular-nums mt-0.5">
                                {formatBytes(file.size)}
                              </p>
                            </div>
                          </div>

                          {/* Reorder & Remove Controls */}
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => moveFile(idx, -1)}
                              disabled={idx === 0}
                              className="p-1 rounded border border-rule hover:bg-kraft text-ink-soft disabled:opacity-30"
                              title="Move folio up"
                            >
                              <MoveUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => moveFile(idx, 1)}
                              disabled={idx === selectedFiles.length - 1}
                              className="p-1 rounded border border-rule hover:bg-kraft text-ink-soft disabled:opacity-30"
                              title="Move folio down"
                            >
                              <MoveDown className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => removeFile(idx)}
                              className="p-1 rounded border border-rule hover:bg-red/10 text-red ml-1"
                              title="Remove folio"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 2. SPLIT: Visual Page Picker with Cut Lines & Scissors */}
              {currentTool.id === 'split' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-ink-soft font-mono">
                      Click between pages to toggle precision cuts, or specify ranges in the panel:
                    </p>
                    <span className="text-xs font-mono text-ink font-semibold">
                      Total Pages: {splitPageCount}
                    </span>
                  </div>

                  {/* Grid of visual pages with cut dividers */}
                  <div className="p-4 rounded border border-rule bg-vellum flex flex-wrap gap-4 items-center">
                    {Array.from({ length: Math.min(splitPageCount, 32) }).map((_, pIdx) => {
                      const pageNum = pIdx + 1;
                      const hasCut = cutPoints.has(pageNum);
                      const file = selectedFiles[0];
                      const thumb = thumbnails[`${file?.name}-${file?.size}`];

                      return (
                        <React.Fragment key={pageNum}>
                          {/* Page Thumbnail */}
                          <div className="flex flex-col items-center gap-1">
                            <div className="w-16 h-22 rounded border border-rule bg-paper shadow-sm flex items-center justify-center overflow-hidden relative group">
                              {thumb ? (
                                <img
                                  src={thumb}
                                  alt={`Page ${pageNum}`}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <span className="font-mono text-xs text-ink-faint">
                                  #{pageNum}
                                </span>
                              )}
                              <span className="absolute bottom-1 right-1 text-[9px] font-mono px-1 rounded bg-ink/70 text-vellum">
                                {pageNum}
                              </span>
                            </div>
                          </div>

                          {/* Cut Separator Line */}
                          {pageNum < splitPageCount && (
                            <button
                              onClick={() => toggleCut(pageNum)}
                              className={`h-22 w-6 flex flex-col items-center justify-center group relative cursor-pointer focus:outline-none transition-colors ${
                                hasCut ? 'text-red' : 'text-rule-strong hover:text-ink'
                              }`}
                              title={
                                hasCut
                                  ? `Cut set after page ${pageNum}. Click to heal.`
                                  : `Click to cut after page ${pageNum}`
                              }
                            >
                              <div
                                className={`w-0.5 h-full transition-colors ${
                                  hasCut
                                    ? 'bg-red border-dashed'
                                    : 'bg-rule group-hover:bg-ink'
                                }`}
                              />
                              <Scissors
                                className={`w-3.5 h-3.5 absolute top-1/2 -translate-y-1/2 transition-transform ${
                                  hasCut
                                    ? 'text-red scale-110'
                                    : 'text-rule-strong group-hover:scale-105'
                                }`}
                              />
                            </button>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Generic Single Document Presentation for other tools */}
              {currentTool.id !== 'merge' && currentTool.id !== 'split' && (
                <div className="p-4 rounded border border-rule bg-vellum flex items-center gap-4">
                  <div className="w-14 h-20 rounded border border-rule bg-paper shadow-sm flex items-center justify-center shrink-0 overflow-hidden">
                    {thumbnails[`${selectedFiles[0]?.name}-${selectedFiles[0]?.size}`] ? (
                      <img
                        src={thumbnails[`${selectedFiles[0]?.name}-${selectedFiles[0]?.size}`]}
                        alt="Preview"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <ToolIcon className="w-6 h-6 text-ink-soft" strokeWidth={1.5} />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-ink truncate">
                      {selectedFiles[0]?.name}
                    </h3>
                    <p className="text-xs font-mono text-ink-soft tabular-nums mt-0.5">
                      {formatBytes(selectedFiles[0]?.size)}
                    </p>
                    <p className="text-[11px] text-ink-faint mt-1 font-mono">
                      Ready for {currentTool.verb} operation on isolated RAM namespace.
                    </p>
                  </div>
                </div>
              )}

              {/* Error Banner with Retry */}
              {errorMessage && (
                <div className="p-4 rounded border border-red/40 bg-red/10 text-xs text-ink flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red" />
                    <div>
                      <p className="font-semibold text-red">Execution Warning</p>
                      <p className="text-ink-soft mt-0.5">{errorMessage}</p>
                    </div>
                  </div>
                  <button
                    onClick={handleExecute}
                    className="px-2.5 py-1 text-xs font-mono font-medium rounded bg-red text-vellum hover:bg-red-dark shrink-0"
                  >
                    Retry
                  </button>
                </div>
              )}
            </div>

            {/* Right Area (4 cols on desktop): Sticky Options Panel */}
            <div className="lg:col-span-4 sticky top-20 space-y-4">
              <div className="p-5 rounded-md border border-rule bg-vellum shadow-subtle space-y-5">
                <div className="flex items-center justify-between border-b border-rule pb-3">
                  <span className="font-display text-base text-ink font-semibold">
                    Bench Configuration
                  </span>
                  <span className="font-mono text-[10px] uppercase text-ink-soft bg-kraft px-1.5 py-0.5 rounded border border-rule">
                    {currentTool.badgeText || 'Bench'}
                  </span>
                </div>

                {/* 1. COMPRESS OPTIONS */}
                {currentTool.id === 'compress' && (
                  <div className="space-y-3">
                    <label className="block text-xs font-semibold text-ink">
                      Compression Calibration
                    </label>
                    <div className="space-y-2">
                      {[
                        {
                          id: 'low',
                          label: 'Low Compression',
                          desc: 'Preserves 300 DPI vectors & image plates',
                          est: '~20% reduction',
                        },
                        {
                          id: 'medium',
                          label: 'Balanced (Standard)',
                          desc: 'Recommended for archiving & email delivery',
                          est: '~50% reduction',
                        },
                        {
                          id: 'high',
                          label: 'High Compression',
                          desc: 'Downsamples to 150 DPI for smallest size',
                          est: '~75% reduction',
                        },
                      ].map((lvl) => (
                        <div
                          key={lvl.id}
                          onClick={() => setCompressLevel(lvl.id)}
                          className={`p-3 rounded border cursor-pointer transition-colors ${
                            compressLevel === lvl.id
                              ? 'bg-kraft border-rule-strong shadow-sm'
                              : 'bg-paper/80 border-rule hover:bg-kraft/40'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-ink">
                              {lvl.label}
                            </span>
                            <span className="text-[10px] font-mono text-moss font-semibold">
                              {lvl.est}
                            </span>
                          </div>
                          <p className="text-[11px] text-ink-soft mt-1 leading-snug">
                            {lvl.desc}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 2. PROTECT OPTIONS */}
                {currentTool.id === 'protect' && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-ink mb-1.5">
                        Set Password
                      </label>
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={protectPassword}
                          onChange={(e) => setProtectPassword(e.target.value)}
                          placeholder="Enter secret passphrase..."
                          className="w-full pl-3 pr-9 py-2 rounded border border-rule bg-paper text-xs text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-cyan"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-ink-faint hover:text-ink"
                        >
                          {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-ink mb-1.5">
                        Confirm Password
                      </label>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Re-enter password to verify..."
                        className="w-full px-3 py-2 rounded border border-rule bg-paper text-xs text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-cyan"
                      />
                    </div>

                    <div className="pt-2 border-t border-rule space-y-2">
                      <label className="block text-xs font-semibold text-ink">
                        Permission Controls
                      </label>
                      <label className="flex items-center gap-2 text-xs text-ink-soft cursor-pointer">
                        <input
                          type="checkbox"
                          checked={allowPrinting}
                          onChange={(e) => setAllowPrinting(e.target.checked)}
                          className="rounded border-rule text-red focus:ring-cyan"
                        />
                        <span>Allow document printing</span>
                      </label>
                      <label className="flex items-center gap-2 text-xs text-ink-soft cursor-pointer">
                        <input
                          type="checkbox"
                          checked={allowCopying}
                          onChange={(e) => setAllowCopying(e.target.checked)}
                          className="rounded border-rule text-red focus:ring-cyan"
                        />
                        <span>Allow text and image extraction</span>
                      </label>
                    </div>
                  </div>
                )}

                {/* 3. SPLIT OPTIONS */}
                {currentTool.id === 'split' && (
                  <div className="space-y-3">
                    <label className="block text-xs font-semibold text-ink">
                      Page Ranges Definition
                    </label>
                    <input
                      type="text"
                      value={splitRange}
                      onChange={(e) => setSplitRange(e.target.value)}
                      placeholder="e.g. 1-3, 5, 8-12"
                      className="w-full px-3 py-2 rounded border border-rule bg-paper text-xs text-ink font-mono placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-cyan"
                    />
                    <p className="text-[11px] text-ink-soft font-mono">
                      Synced with visual cutter: click dividers on the left or type comma-separated ranges.
                    </p>
                  </div>
                )}

                {/* 4. ROTATE OPTIONS */}
                {currentTool.id === 'rotate' && (
                  <div className="space-y-3">
                    <label className="block text-xs font-semibold text-ink">
                      Clockwise Angle
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {[90, 180, 270].map((deg) => (
                        <button
                          key={deg}
                          type="button"
                          onClick={() => setRotateAngle(deg)}
                          className={`py-2 px-2 text-xs font-mono rounded border transition-colors ${
                            rotateAngle === deg
                              ? 'bg-kraft border-rule-strong text-ink font-semibold'
                              : 'bg-paper border-rule text-ink-soft hover:bg-kraft/50'
                          }`}
                        >
                          {deg}°
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* 5. WATERMARK OPTIONS */}
                {currentTool.id === 'watermark' && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-ink mb-1">
                        Stamp Text
                      </label>
                      <input
                        type="text"
                        value={watermarkText}
                        onChange={(e) => setWatermarkText(e.target.value)}
                        className="w-full px-3 py-1.5 rounded border border-rule bg-paper text-xs text-ink font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-ink mb-1">
                        Opacity: {Math.round(watermarkOpacity * 100)}%
                      </label>
                      <input
                        type="range"
                        min="0.1"
                        max="1.0"
                        step="0.05"
                        value={watermarkOpacity}
                        onChange={(e) => setWatermarkOpacity(parseFloat(e.target.value))}
                        className="w-full accent-red"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-ink mb-1">
                        Angle: {watermarkRotation}°
                      </label>
                      <input
                        type="range"
                        min="-90"
                        max="90"
                        step="15"
                        value={watermarkRotation}
                        onChange={(e) => setWatermarkRotation(parseInt(e.target.value))}
                        className="w-full accent-red"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-ink mb-1">
                        Stamp Color
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={watermarkColor}
                          onChange={(e) => setWatermarkColor(e.target.value)}
                          className="w-7 h-7 rounded border border-rule cursor-pointer"
                        />
                        <span className="font-mono text-xs text-ink">{watermarkColor}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* 6. CONVERT OPTIONS */}
                {currentTool.id === 'to-images' && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-ink mb-1.5">
                        Plate Format
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {['png', 'jpeg'].map((fmt) => (
                          <button
                            key={fmt}
                            type="button"
                            onClick={() => setImageFormat(fmt)}
                            className={`py-1.5 text-xs font-mono uppercase rounded border ${
                              imageFormat === fmt
                                ? 'bg-kraft border-rule-strong text-ink font-semibold'
                                : 'bg-paper border-rule text-ink-soft'
                            }`}
                          >
                            {fmt}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-ink mb-1.5">
                        Plate Resolution
                      </label>
                      <div className="grid grid-cols-3 gap-1.5">
                        {[100, 150, 300].map((dpi) => (
                          <button
                            key={dpi}
                            type="button"
                            onClick={() => setImageDpi(dpi)}
                            className={`py-1 text-xs font-mono rounded border ${
                              imageDpi === dpi
                                ? 'bg-kraft border-rule-strong text-ink font-semibold'
                                : 'bg-paper border-rule text-ink-soft'
                            }`}
                          >
                            {dpi} DPI
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* 7. CANARY WATERMARK FORENSICS */}
                {currentTool.id === 'canary' && (
                  <div className="space-y-3">
                    <span className="text-xs font-semibold text-ink flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-moss" />
                      <span>Forensic Attribution</span>
                    </span>
                    <input
                      type="text"
                      value={canaryRecipientName}
                      onChange={(e) => setCanaryRecipientName(e.target.value)}
                      placeholder="Recipient full name"
                      className="w-full px-2.5 py-1.5 rounded border border-rule bg-paper text-xs text-ink"
                    />
                    <input
                      type="email"
                      value={canaryRecipientEmail}
                      onChange={(e) => setCanaryRecipientEmail(e.target.value)}
                      placeholder="Recipient email address"
                      className="w-full px-2.5 py-1.5 rounded border border-rule bg-paper text-xs text-ink"
                    />
                    <input
                      type="text"
                      value={canaryOrganization}
                      onChange={(e) => setCanaryOrganization(e.target.value)}
                      placeholder="Organization or team"
                      className="w-full px-2.5 py-1.5 rounded border border-rule bg-paper text-xs text-ink"
                    />
                    <input
                      type="text"
                      value={canaryTrackingNote}
                      onChange={(e) => setCanaryTrackingNote(e.target.value)}
                      placeholder="Classification note (e.g. M&A Draft)"
                      className="w-full px-2.5 py-1.5 rounded border border-rule bg-paper text-xs text-ink"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* PHASE 3: RESULT (Stamp Motif, Before/After Odometer, Download, Continue With...) */}
        {resultData && (
          <div className="max-w-2xl mx-auto pt-6 space-y-6">
            <div className="p-8 rounded-md border border-rule bg-vellum shadow-ink-lift text-center space-y-6 relative overflow-hidden">
              {/* Rubber Stamp Thump Motif in top right */}
              <div className="absolute top-4 right-6 pointer-events-none select-none">
                <div className="animate-stamp border-2 border-moss px-3 py-1 rounded text-moss font-mono text-xs font-bold tracking-mono uppercase transform -rotate-6">
                  {currentTool.id === 'verify-canary'
                    ? resultData.status
                    : currentTool.id === 'protect'
                    ? 'SEALED'
                    : 'DONE'}
                </div>
              </div>

              {/* Status Header */}
              <div className="space-y-2">
                <div className="w-12 h-12 rounded border border-moss bg-moss/10 mx-auto flex items-center justify-center text-moss">
                  <CheckCircle2 className="w-6 h-6" strokeWidth={1.75} />
                </div>
                <h2 className="font-display text-2xl text-ink">
                  {currentTool.id === 'verify-canary'
                    ? 'Canary Audit Complete'
                    : 'Folio Ready for Collection'}
                </h2>
                <p className="text-xs text-ink-soft">
                  {resultData.message || 'Operation executed cleanly on volatile bench.'}
                </p>
              </div>

              {/* Before/After Size Comparison & Metadata */}
              <div className="p-4 rounded border border-rule bg-paper/70 text-left space-y-3 font-mono text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-ink-soft">Output File:</span>
                  <span className="text-ink font-semibold truncate max-w-[260px]">
                    {resultData.output_filename || 'document.pdf'}
                  </span>
                </div>

                {resultData.output_file_size_bytes !== undefined && (
                  <div className="flex justify-between items-center border-t border-rule/60 pt-2">
                    <span className="text-ink-soft">Final Size:</span>
                    <span className="text-moss font-semibold tabular-nums">
                      {formatBytes(resultData.output_file_size_bytes)}
                    </span>
                  </div>
                )}

                {resultData.stats?.compression_ratio_pct !== undefined && (
                  <div className="border-t border-rule/60 pt-2 space-y-1.5">
                    <div className="flex justify-between text-ink-soft">
                      <span>Space Saved:</span>
                      <span className="text-moss font-semibold tabular-nums">
                        {resultData.stats.compression_ratio_pct}%
                      </span>
                    </div>
                    {/* Fill bar */}
                    <div className="w-full h-2 rounded bg-kraft overflow-hidden">
                      <div
                        className="h-full bg-moss transition-all duration-500 ease-out"
                        style={{
                          width: `${Math.min(100, resultData.stats.compression_ratio_pct)}%`,
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* Canary Verification Specifics */}
                {resultData.token_id && (
                  <div className="flex justify-between items-center border-t border-rule/60 pt-2">
                    <span className="text-ink-soft">Canary Token:</span>
                    <span className="text-ink font-mono text-[11px] truncate max-w-[220px]">
                      {resultData.token_id}
                    </span>
                  </div>
                )}

                {resultData.recipient_name && (
                  <div className="flex justify-between items-center border-t border-rule/60 pt-2">
                    <span className="text-ink-soft">Recipient:</span>
                    <span className="text-ink">{resultData.recipient_name}</span>
                  </div>
                )}
              </div>

              {/* Action Buttons: Download + Vault + Start Over */}
              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                {resultData.download_url && (
                  <a
                    href={resultData.download_url}
                    download={resultData.output_filename || 'document.pdf'}
                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded bg-red text-vellum font-semibold text-xs tracking-tight hover:bg-red-dark transition-all duration-120 shadow-ink-button active:translate-y-px"
                  >
                    <Download className="w-3.5 h-3.5" strokeWidth={2} />
                    <span>Download Folio</span>
                    <ArrowRight className="w-3.5 h-3.5 ml-1 transition-transform group-hover:translate-x-1" />
                  </a>
                )}

                <button
                  onClick={resetBench}
                  className="px-4 py-2.5 rounded border border-rule bg-paper hover:bg-kraft text-ink text-xs font-mono transition-colors"
                >
                  Start Over
                </button>

                {isAuthenticated && (
                  <Link
                    to="/workspace"
                    className="px-4 py-2.5 rounded border border-rule bg-paper hover:bg-kraft text-ink text-xs font-mono transition-colors flex items-center gap-1.5"
                  >
                    <FolderLock className="w-3.5 h-3.5 text-ink-soft" />
                    <span>View in Vault</span>
                  </Link>
                )}
              </div>

              {/* "Continue with..." Chaining Chips */}
              <div className="pt-4 border-t border-rule">
                <span className="text-[11px] font-mono uppercase tracking-mono text-ink-faint block mb-2.5">
                  Chain into next bench tool (zero re-upload)
                </span>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {currentTool.id !== 'compress' && (
                    <button
                      onClick={() => continueWithTool('compress')}
                      className="px-3 py-1 rounded border border-rule bg-paper hover:bg-kraft text-xs text-ink flex items-center gap-1.5 font-mono"
                    >
                      <Minimize2 className="w-3 h-3 text-ink-soft" />
                      <span>Press (Compress)</span>
                    </button>
                  )}
                  {currentTool.id !== 'protect' && (
                    <button
                      onClick={() => continueWithTool('protect')}
                      className="px-3 py-1 rounded border border-rule bg-paper hover:bg-kraft text-xs text-ink flex items-center gap-1.5 font-mono"
                    >
                      <Lock className="w-3 h-3 text-ink-soft" />
                      <span>Seal (Protect)</span>
                    </button>
                  )}
                  {currentTool.id !== 'watermark' && (
                    <button
                      onClick={() => continueWithTool('watermark')}
                      className="px-3 py-1 rounded border border-rule bg-paper hover:bg-kraft text-xs text-ink flex items-center gap-1.5 font-mono"
                    >
                      <Stamp className="w-3 h-3 text-ink-soft" />
                      <span>Stamp (Watermark)</span>
                    </button>
                  )}
                  <Link
                    to="/workspace"
                    className="px-3 py-1 rounded border border-rule bg-paper hover:bg-kraft text-xs text-ink flex items-center gap-1.5 font-mono"
                  >
                    <FolderLock className="w-3 h-3 text-ink-soft" />
                    <span>Store in Vault</span>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* STICKY BOTTOM ACTION BAR (During Phase 2 Configure) */}
      {selectedFiles.length > 0 && !resultData && (
        <div className="fixed bottom-0 inset-x-0 z-30 bg-vellum/95 backdrop-blur-md border-t border-rule py-3 px-4 sm:px-6 shadow-ink-lift">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-ink">
                {selectedFiles.length} {selectedFiles.length === 1 ? 'folio' : 'folios'}
              </span>
              <span className="text-xs font-mono text-ink-soft tabular-nums">
                [{formatBytes(totalBytes)}]
              </span>
              {isProcessing && (
                <span className="hidden sm:inline-block text-xs font-mono text-red animate-pulse">
                  {processingStage || 'Processing in isolated RAM namespace...'}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {isProcessing && (
                <button
                  onClick={handleCancel}
                  className="px-3 py-2 rounded border border-rule bg-paper text-ink-soft hover:text-ink text-xs font-mono transition-colors"
                >
                  Cancel
                </button>
              )}

              <button
                onClick={handleExecute}
                disabled={isProcessing}
                className="px-6 py-2.5 rounded bg-red text-vellum font-semibold text-xs tracking-tight hover:bg-red-dark transition-all duration-120 shadow-ink-button active:translate-y-px flex items-center gap-2 disabled:opacity-50"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Executing...</span>
                  </>
                ) : (
                  <>
                    <span>{currentTool.actionBtn || `Execute ${currentTool.title}`}</span>
                    <ArrowRight className="w-3.5 h-3.5 stroke-[2]" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
