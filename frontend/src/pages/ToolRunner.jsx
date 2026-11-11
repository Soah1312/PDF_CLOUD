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
  Share2,
  Check,
  CheckSquare,
  Square,
  LayoutGrid,
  List,
  ArrowUpDown,
  MoveLeft,
  MoveRight,
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
  extractErrorMessage,
} from '../services/api';
import { BINDERY_TOOLS } from '../config/tools';
import { renderPdfThumbnail, getPdfPageCount } from '../utils/pdfThumbnails';
import { motionBus } from '../utils/motion';
import PrimaryButton from '../components/common/PrimaryButton';
import OdometerValue from '../components/common/OdometerValue';
import { updateTabProgress, restoreTabProgress } from '../utils/tabProgress';

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
  const [isThunking, setIsThunking] = useState(false);
  const [collapsingIds, setCollapsingIds] = useState(new Set());
  const fileInputRef = useRef(null);

  // Split-specific page state
  const [splitPageCount, setSplitPageCount] = useState(1);
  const [cutPoints, setCutPoints] = useState(new Set()); // Cuts after page N
  const [splitMode, setSplitMode] = useState('ranges'); // 'ranges', 'every_n', 'selected'
  const [everyNPages, setEveryNPages] = useState(1);
  const [splitRange, setSplitRange] = useState('');
  const [splitInteraction, setSplitInteraction] = useState('cut'); // 'cut' | 'select'
  const [selectedPages, setSelectedPages] = useState(new Set());

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

  // Images to PDF specific state
  const [imageLayoutView, setImageLayoutView] = useState('grid'); // 'grid' | 'list'
  const [imageOrientation, setImageOrientation] = useState('auto'); // 'auto' | 'portrait' | 'landscape'
  const [imageMarginMode, setImageMarginMode] = useState('none'); // 'none' | 'framed'

  // Password-protected PDF prompt state
  const [pdfPasswordPrompt, setPdfPasswordPrompt] = useState(false);
  const [unlockPassword, setUnlockPassword] = useState('');

  // Execution & Progress state
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStage, setProcessingStage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [progressMetrics, setProgressMetrics] = useState({
    phase: 'idle',
    pct: 0,
    loadedBytes: 0,
    totalBytes: 0,
    speed: '',
    timeLeft: '',
    elapsed: '0.0s',
  });
  const [resultData, setResultData] = useState(null);

  // Restore tab title/favicon when processing stops
  useEffect(() => {
    if (!isProcessing) {
      restoreTabProgress();
    }
  }, [isProcessing]);
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
        motionBus.emit('pressroom:state', 'error');
        setTimeout(() => motionBus.emit('pressroom:state', 'idle'), 400);
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
          motionBus.emit('pressroom:state', 'error');
          setTimeout(() => motionBus.emit('pressroom:state', 'idle'), 400);
          return;
        }
      }
    }

    motionBus.emit('pressroom:state', 'dropped');
    setTimeout(() => {
      motionBus.emit('pressroom:state', 'idle');
    }, 200);

    if (currentTool.multiple) {
      setSelectedFiles((prev) => [...prev, ...filesArray]);
    } else {
      setSelectedFiles([filesArray[0]]);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    setIsThunking(true);
    setTimeout(() => setIsThunking(false), 220);
    motionBus.emit('audio:play', 'thunk');
    motionBus.emit('pressroom:state', 'dropped');
    setTimeout(() => {
      motionBus.emit('pressroom:state', 'idle');
    }, 200);
    if (e.dataTransfer?.files) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const removeFile = (index, key) => {
    const collapseKey = key || `${index}`;
    setCollapsingIds((prev) => new Set(prev).add(collapseKey));
    setTimeout(() => {
      setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
      setCollapsingIds((prev) => {
        const next = new Set(prev);
        next.delete(collapseKey);
        return next;
      });
    }, 200);
  };

  const moveFile = (index, direction) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(10);
    }
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

  const moveFileToEdge = (index, toTop = false) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(10);
    }
    setSelectedFiles((prev) => {
      const updated = [...prev];
      const [item] = updated.splice(index, 1);
      if (toTop) {
        updated.unshift(item);
      } else {
        updated.push(item);
      }
      return updated;
    });
  };

  const sortImagesByName = (ascending = true) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(10);
    }
    setSelectedFiles((prev) => {
      const sorted = [...prev].sort((a, b) => {
        const cmp = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
        return ascending ? cmp : -cmp;
      });
      return sorted;
    });
  };

  const reverseImageOrder = () => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(10);
    }
    setSelectedFiles((prev) => [...prev].reverse());
  };

  // Convert Set of page numbers into comma-separated ranges e.g. "1, 3, 5-8"
  const formatRangesFromSet = (setOfNumbers) => {
    const sorted = Array.from(setOfNumbers).sort((a, b) => a - b);
    if (!sorted.length) return '';
    const ranges = [];
    let start = sorted[0];
    let end = sorted[0];

    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] === end + 1) {
        end = sorted[i];
      } else {
        ranges.push(start === end ? `${start}` : `${start}-${end}`);
        start = sorted[i];
        end = sorted[i];
      }
    }
    ranges.push(start === end ? `${start}` : `${start}-${end}`);
    return ranges.join(', ');
  };

  const toggleSelectPage = (pageNum) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(10);
    }
    setSelectedPages((prev) => {
      const next = new Set(prev);
      if (next.has(pageNum)) {
        next.delete(pageNum);
      } else {
        next.add(pageNum);
      }
      setSplitRange(formatRangesFromSet(next));
      return next;
    });
  };

  const quickSelectPages = (mode) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(10);
    }
    const all = Array.from({ length: splitPageCount }, (_, i) => i + 1);
    let chosen = new Set();
    if (mode === 'all') {
      chosen = new Set(all);
    } else if (mode === 'none') {
      chosen = new Set();
    } else if (mode === 'odd') {
      chosen = new Set(all.filter((p) => p % 2 !== 0));
    } else if (mode === 'even') {
      chosen = new Set(all.filter((p) => p % 2 === 0));
    }
    setSelectedPages(chosen);
    setSplitRange(formatRangesFromSet(chosen));
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
    restoreTabProgress();
    setProcessingStage('Operation aborted by user.');
    setProgressMetrics((prev) => ({
      ...prev,
      phase: 'idle',
      pct: 0,
      timeLeft: 'Cancelled',
    }));
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
    const initialStage =
      currentTool.id === 'compress'
        ? 'Compressing content streams & font subsets...'
        : currentTool.id === 'merge'
        ? 'Binding and interleaving folios...'
        : currentTool.id === 'from-images'
        ? `Compiling ${selectedFiles.length} image plates into PDF booklet...`
        : currentTool.id === 'canary'
        ? 'Computing SHA-256 and embedding invisible markers...'
        : `Preparing ${currentTool.title}...`;

    setProcessingStage(initialStage);
    setErrorMessage('');
    setResultData(null);

    const startTime = performance.now();
    let serverTicker = null;

    setProgressMetrics({
      phase: 'upload',
      pct: 0,
      loadedBytes: 0,
      totalBytes: totalBytes,
      speed: 'Measuring...',
      timeLeft: 'Starting upload...',
      elapsed: '0.0s',
    });
    updateTabProgress(0);

    abortControllerRef.current = new AbortController();

    let wakeLock = null;
    if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
      try {
        wakeLock = await navigator.wakeLock.request('screen');
      } catch (e) {
        // WakeLock request ignored or failed
      }
    }

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
        const textToUse = (watermarkText || 'CONFIDENTIAL').trim();
        formData.append('text', textToUse);
        formData.append('watermark_text', textToUse);
        formData.append('opacity', watermarkOpacity);
        formData.append('rotation', watermarkRotation);
        formData.append('color', watermarkColor);
        formData.append('position', 'center');
        formData.append('font_size', 40);
      } else if (currentTool.id === 'split') {
        if (splitRange) {
          formData.append('page_ranges', splitRange);
        }
      } else if (currentTool.id === 'to-images') {
        formData.append('format', imageFormat);
        formData.append('img_format', imageFormat);
        formData.append('dpi', imageDpi);
      } else if (currentTool.id === 'canary') {
        if (canaryRecipientName) formData.append('recipient_name', canaryRecipientName);
        if (canaryRecipientEmail) formData.append('recipient_email', canaryRecipientEmail);
        if (canaryOrganization) formData.append('organization', canaryOrganization);
        if (canaryTrackingNote) formData.append('tracking_note', canaryTrackingNote);
      } else if (currentTool.id === 'from-images') {
        formData.append('file_order', JSON.stringify(selectedFiles.map((f) => f.name)));
        formData.append('orientation', imageOrientation);
        formData.append('margin_mode', imageMarginMode);
      }

      let procState = 'processing:generic';
      if (currentTool.id === 'merge' || currentTool.id === 'from-images') procState = 'processing:merge';
      else if (currentTool.id === 'split') procState = 'processing:split';
      else if (currentTool.id === 'compress') procState = 'processing:compress';
      motionBus.emit('pressroom:state', procState);

      const config = {
        signal: abortControllerRef.current.signal,
        onUploadProgress: (progressEvent) => {
          const loaded = progressEvent.loaded || 0;
          const total = progressEvent.total || totalBytes || 1;
          const now = performance.now();
          const elapsedSec = Math.max(0.05, (now - startTime) / 1000);
          const pct = Math.min(100, Math.round((loaded / total) * 100));
          const bytesPerSec = loaded / elapsedSec;
          const speedMb = (bytesPerSec / (1024 * 1024)).toFixed(1);
          const remBytes = Math.max(0, total - loaded);
          const remSec = bytesPerSec > 0 ? Math.ceil(remBytes / bytesPerSec) : 0;

          updateTabProgress(pct);

          if (pct < 100) {
            setProgressMetrics({
              phase: 'upload',
              pct,
              loadedBytes: loaded,
              totalBytes: total,
              speed: `${speedMb} MB/s`,
              timeLeft: remSec > 0 ? `${remSec}s left` : '<1s left',
              elapsed: `${elapsedSec.toFixed(1)}s`,
            });
          } else {
            setProgressMetrics((prev) => ({
              ...prev,
              phase: 'processing',
              pct: 100,
              loadedBytes: total,
              totalBytes: total,
              speed: `${speedMb} MB/s (Upload Complete)`,
              timeLeft: 'Executing...',
              elapsed: `${elapsedSec.toFixed(1)}s`,
            }));
            setProcessingStage('Server executing operation in memory...');
          }
        },
      };

      // Ticker to keep elapsed seconds live during server execution
      serverTicker = setInterval(() => {
        const now = performance.now();
        const elapsedSec = ((now - startTime) / 1000).toFixed(1);
        setProgressMetrics((prev) => {
          if (prev.phase === 'processing') {
            return {
              ...prev,
              elapsed: `${elapsedSec}s`,
            };
          }
          return prev;
        });
      }, 100);

      const apiFunc = getToolApi();
      const res = await apiFunc(formData, config);

      clearInterval(serverTicker);

      setProgressMetrics({
        phase: 'done',
        pct: 100,
        loadedBytes: totalBytes,
        totalBytes: totalBytes,
        speed: 'Completed',
        timeLeft: 'Done',
        elapsed: `${((performance.now() - startTime) / 1000).toFixed(1)}s`,
      });
      updateTabProgress(100);

      // Trigger slight haptic pulse on devices that support it
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(15);
      }

      motionBus.emit('audio:play', 'thunk');
      motionBus.emit('pressroom:state', 'success');
      setTimeout(() => {
        motionBus.emit('pressroom:state', 'idle');
      }, 700);

      setResultData(res);
    } catch (err) {
      clearInterval(serverTicker);
      motionBus.emit('pressroom:state', 'error');
      setTimeout(() => {
        motionBus.emit('pressroom:state', 'idle');
      }, 400);

      if (err.name === 'CanceledError' || err.name === 'AbortError') {
        setErrorMessage('Execution cancelled.');
      } else {
        console.error('Processing error:', err);
        const detail = extractErrorMessage(err);
        if (typeof detail === 'string' && detail.toLowerCase().includes('password')) {
          setPdfPasswordPrompt(true);
        }
        setErrorMessage(detail);
      }
    } finally {
      clearInterval(serverTicker);
      if (wakeLock) {
        try {
          await wakeLock.release();
        } catch (e) {}
      }
      setIsProcessing(false);
      restoreTabProgress();
    }
  };

  const handleShareResult = async () => {
    if (!resultData?.download_url) return;
    const filename = resultData.output_filename || 'document.pdf';
    const url = resultData.download_url;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: filename,
          text: `Processed folio: ${filename}`,
          url,
        });
      } catch (err) {}
    } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(url);
      alert('Download link copied to clipboard.');
    }
  };

  const getOptionsSummary = () => {
    switch (currentTool.id) {
      case 'compress':
        return `${compressLevel === 'low' ? 'Low' : compressLevel === 'high' ? 'High' : 'Balanced'} (~${compressLevel === 'low' ? '20%' : compressLevel === 'high' ? '75%' : '50%'})`;
      case 'split':
        return splitInteraction === 'cut'
          ? `${cutPoints.size} cuts • ${splitPageCount} folios`
          : `${selectedPages.size} folios selected`;
      case 'rotate':
        return `${rotateAngle}° clockwise`;
      case 'protect':
        return protectPassword ? 'Passphrase active' : 'Password required';
      case 'watermark':
        return `"${watermarkText}" • ${Math.round(watermarkOpacity * 100)}%`;
      case 'to-images':
        return `${imageFormat.toUpperCase()} • ${imageDpi} DPI`;
      case 'from-images':
        return `${selectedFiles.length} image plates • ${imageOrientation === 'auto' ? 'Auto orientation' : imageOrientation}`;
      case 'canary':
        return canaryRecipientName ? `${canaryRecipientName}` : 'Forensic SHA-256';
      default:
        return 'Standard configuration';
    }
  };

  const resetBench = () => {
    setSelectedFiles([]);
    setResultData(null);
    setErrorMessage('');
    setCutPoints(new Set());
    setSelectedPages(new Set());
    setSplitRange('');
    motionBus.emit('pressroom:state', 'idle');
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

  const renderOptionsContent = () => (
    <>
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
                className={`p-3 rounded border cursor-pointer transition-colors min-h-[44px] ${
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
                className="w-full pl-3 pr-9 py-2 rounded border border-rule bg-paper text-sm sm:text-xs text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-cyan min-h-[44px]"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-ink-faint hover:text-ink min-w-[40px] min-h-[40px] justify-center"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
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
              className="w-full px-3 py-2 rounded border border-rule bg-paper text-sm sm:text-xs text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-cyan min-h-[44px]"
            />
          </div>

          <div className="pt-2 border-t border-rule space-y-2">
            <label className="block text-xs font-semibold text-ink">
              Permission Controls
            </label>
            <label className="flex items-center gap-2 text-xs text-ink-soft cursor-pointer min-h-[36px]">
              <input
                type="checkbox"
                checked={allowPrinting}
                onChange={(e) => setAllowPrinting(e.target.checked)}
                className="rounded border-rule text-red focus:ring-cyan w-4 h-4"
              />
              <span>Allow document printing</span>
            </label>
            <label className="flex items-center gap-2 text-xs text-ink-soft cursor-pointer min-h-[36px]">
              <input
                type="checkbox"
                checked={allowCopying}
                onChange={(e) => setAllowCopying(e.target.checked)}
                className="rounded border-rule text-red focus:ring-cyan w-4 h-4"
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
            className="w-full px-3 py-2 rounded border border-rule bg-paper text-sm sm:text-xs text-ink font-mono placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-cyan min-h-[44px]"
          />
          <p className="text-[11px] text-ink-soft font-mono">
            Synced with visual cutter: click dividers or toggle selection mode to choose pages.
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
                className={`py-2 px-2 text-xs font-mono rounded border transition-colors min-h-[44px] ${
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
              className="w-full px-3 py-2 rounded border border-rule bg-paper text-sm sm:text-xs text-ink font-mono min-h-[44px]"
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
              className="w-full accent-red h-8"
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
              className="w-full accent-red h-8"
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
                className="w-9 h-9 rounded border border-rule cursor-pointer"
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
                  className={`py-2 text-xs font-mono uppercase rounded border min-h-[44px] ${
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
                  className={`py-2 text-xs font-mono rounded border min-h-[44px] ${
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
            className="w-full px-3 py-2 rounded border border-rule bg-paper text-sm sm:text-xs text-ink min-h-[44px]"
          />
          <input
            type="email"
            value={canaryRecipientEmail}
            onChange={(e) => setCanaryRecipientEmail(e.target.value)}
            placeholder="Recipient email address"
            className="w-full px-3 py-2 rounded border border-rule bg-paper text-sm sm:text-xs text-ink min-h-[44px]"
          />
          <input
            type="text"
            value={canaryOrganization}
            onChange={(e) => setCanaryOrganization(e.target.value)}
            placeholder="Organization or team"
            className="w-full px-3 py-2 rounded border border-rule bg-paper text-sm sm:text-xs text-ink min-h-[44px]"
          />
          <input
            type="text"
            value={canaryTrackingNote}
            onChange={(e) => setCanaryTrackingNote(e.target.value)}
            placeholder="Classification note (e.g. M&A Draft)"
            className="w-full px-3 py-2 rounded border border-rule bg-paper text-sm sm:text-xs text-ink min-h-[44px]"
          />
        </div>
      )}

      {/* 8. FROM-IMAGES OPTIONS */}
      {currentTool.id === 'from-images' && (
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-ink mb-1.5">
              Page Orientation
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { id: 'auto', label: 'Auto' },
                { id: 'portrait', label: 'Portrait' },
                { id: 'landscape', label: 'Landscape' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setImageOrientation(opt.id)}
                  className={`py-2 px-1 text-xs font-mono rounded border transition-colors min-h-[40px] ${
                    imageOrientation === opt.id
                      ? 'bg-kraft border-rule-strong text-ink font-semibold'
                      : 'bg-paper border-rule text-ink-soft hover:bg-kraft/50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink mb-1.5">
              Page Margins
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'none', label: 'Full Bleed' },
                { id: 'framed', label: 'Framed Margin' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setImageMarginMode(opt.id)}
                  className={`py-2 px-1 text-xs font-mono rounded border transition-colors min-h-[40px] ${
                    imageMarginMode === opt.id
                      ? 'bg-kraft border-rule-strong text-ink font-semibold'
                      : 'bg-paper border-rule text-ink-soft hover:bg-kraft/50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="pt-2 border-t border-rule space-y-2 text-xs font-mono text-ink-soft">
            <div className="flex justify-between">
              <span className="text-ink-faint">Total Folios:</span>
              <span className="font-semibold text-ink">{selectedFiles.length} Pages</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-faint">Combined Size:</span>
              <span className="font-semibold text-ink">{formatBytes(totalBytes)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-faint">Fidelity:</span>
              <span className="font-semibold text-moss">100% Original DPI</span>
            </div>
          </div>
        </div>
      )}
    </>
  );

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
                if (!isDragging) {
                  setIsDragging(true);
                  motionBus.emit('pressroom:state', 'dragover');
                }
              }}
              onDragLeave={() => {
                setIsDragging(false);
                motionBus.emit('pressroom:state', 'idle');
              }}
              onDrop={handleDrop}
              className={`group relative cursor-pointer p-12 sm:p-16 rounded-md border-2 transition-all duration-200 text-center select-none ${
                isDragging
                  ? 'border-solid border-red bg-kraft/70 -translate-y-0.5 shadow-ink-drag'
                  : 'border-dashed border-rule hover:border-rule-strong bg-vellum hover:bg-kraft/30 shadow-subtle'
              } ${isThunking ? 'animate-thunk' : ''}`}
            >
              {/* Corner Registration Marks (+) (rotates 45deg & moves 2px inward on hover) */}
              <span
                className="absolute top-2 left-2 font-mono text-xs text-rule-strong select-none transition-transform duration-200 ease-out group-hover:rotate-45 group-hover:translate-x-0.5 group-hover:translate-y-0.5"
                aria-hidden="true"
              >
                +
              </span>
              <span
                className="absolute top-2 right-2 font-mono text-xs text-rule-strong select-none transition-transform duration-200 ease-out group-hover:rotate-45 group-hover:-translate-x-0.5 group-hover:translate-y-0.5"
                aria-hidden="true"
              >
                +
              </span>
              <span
                className="absolute bottom-2 left-2 font-mono text-xs text-rule-strong select-none transition-transform duration-200 ease-out group-hover:rotate-45 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                aria-hidden="true"
              >
                +
              </span>
              <span
                className="absolute bottom-2 right-2 font-mono text-xs text-rule-strong select-none transition-transform duration-200 ease-out group-hover:rotate-45 group-hover:-translate-x-0.5 group-hover:-translate-y-0.5"
                aria-hidden="true"
              >
                +
              </span>

              <div className="max-w-md mx-auto space-y-3">
                {/* Icon drops into small tray on dragover */}
                <div
                  className={`w-12 h-12 rounded border border-rule mx-auto flex items-center justify-center text-ink shadow-sm transition-transform duration-200 ease-out ${
                    isDragging ? 'translate-y-1.5' : ''
                  }`}
                  style={{ backgroundColor: currentTool.tint || 'var(--paper)' }}
                >
                  <UploadCloud className="w-6 h-6 text-ink-soft" strokeWidth={1.5} />
                </div>

                <div>
                  <p className="font-display text-xl text-ink">
                    {isDragging
                      ? 'Release to add'
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
              <div className="p-3.5 rounded border border-red/40 bg-red/10 text-xs text-ink flex items-start justify-between gap-2.5 animate-invalid-shake">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red" />
                  <div>
                    <p className="font-semibold text-red">Document issue</p>
                    <p className="text-ink-soft mt-0.5">
                      {typeof errorMessage === 'string' ? errorMessage : JSON.stringify(errorMessage)}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setErrorMessage('');
                    fileInputRef.current?.click();
                  }}
                  className="px-2.5 py-1 text-xs font-mono font-medium rounded bg-red text-vellum hover:bg-red-dark transition-opacity duration-200 shrink-0"
                >
                  Retry
                </button>
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

              {/* Collapsed Mobile Options Summary Bar (< lg) */}
              <div className="block lg:hidden p-3 rounded border border-rule bg-vellum shadow-subtle">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <SlidersHorizontal className="w-4 h-4 text-ink-soft shrink-0" />
                    <span className="text-xs font-semibold text-ink shrink-0">Options:</span>
                    <span className="font-mono text-xs text-ink-soft truncate">
                      {getOptionsSummary()}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsMobileOptionsOpen(true)}
                    className="px-3 py-1.5 rounded border border-rule bg-paper hover:bg-kraft text-xs font-mono font-semibold text-ink min-h-[36px] shrink-0 active:scale-[0.98]"
                  >
                    Configure
                  </button>
                </div>
              </div>

              {/* Large File Warning Banner */}
              {totalBytes > 50 * 1024 * 1024 && (
                <div className="p-3 rounded border border-rule bg-kraft/60 text-xs font-mono text-ink flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-marigold shrink-0" />
                  <span>Large folio footprint ({formatBytes(totalBytes)}). Processing memory-mapped streams.</span>
                </div>
              )}

              {/* Prominent Live Execution Banner (Active when processing) */}
              {isProcessing && (
                <div className="p-4 sm:p-5 rounded-md border-2 border-cyan/40 bg-vellum shadow-ink-lift space-y-3 animate-fade-in">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-rule">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded border border-cyan/30 bg-cyan/10 flex items-center justify-center text-cyan shrink-0">
                        <Loader2 className="w-5 h-5 animate-spin" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded bg-kraft border border-rule text-[10px] font-mono font-semibold uppercase tracking-mono text-cyan">
                            {progressMetrics.phase === 'upload' ? 'Upload Phase' : 'Execution Phase'}
                          </span>
                          <span className="text-xs font-mono text-ink-faint">
                            Elapsed: {progressMetrics.elapsed}
                          </span>
                        </div>
                        <h3 className="font-display text-base font-semibold text-ink mt-0.5">
                          {processingStage || `Executing ${currentTool.title}...`}
                        </h3>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-auto">
                      <button
                        type="button"
                        onClick={handleCancel}
                        className="px-3 py-1.5 rounded border border-rule bg-paper hover:bg-red/10 hover:text-red text-xs font-mono text-ink-soft transition-colors"
                      >
                        Cancel Operation
                      </button>
                    </div>
                  </div>

                  {/* Real Metrics Row & Progress Bar */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold text-ink tabular-nums">
                          {progressMetrics.pct}%
                        </span>
                        <span className="text-ink-soft">
                          ({formatBytes(progressMetrics.loadedBytes)} / {formatBytes(progressMetrics.totalBytes || totalBytes)})
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] font-mono">
                        <span className="text-ink font-semibold">{progressMetrics.speed}</span>
                        <span className="text-moss font-semibold">{progressMetrics.timeLeft}</span>
                      </div>
                    </div>

                    <div className="w-full bg-kraft border border-rule/70 h-3 rounded-full overflow-hidden shadow-inner">
                      <div
                        className={`h-full rounded-full transition-all duration-150 ${
                          progressMetrics.phase === 'processing'
                            ? 'bg-moss animate-pulse'
                            : 'bg-red'
                        }`}
                        style={{ width: `${progressMetrics.pct}%` }}
                      />
                    </div>
                  </div>
                </div>
              )}

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
                      const isCollapsing = collapsingIds.has(thumbKey);
                      return (
                        <div
                          key={`${file.name}-${idx}`}
                          className={`relative flex items-center justify-between p-3 rounded border border-rule bg-vellum hover:border-rule-strong hover:shadow-subtle transition-all duration-200 group ${
                            isCollapsing ? 'file-card-collapsing' : ''
                          }`}
                          style={{ animationDelay: `${idx * 40}ms` }}
                        >
                          {/* Corner Curl on hover */}
                          <div className="file-corner-curl" aria-hidden="true" />

                          <div className="flex items-center gap-3 min-w-0">
                            {/* Sequence number */}
                            <span className="font-mono text-xs font-semibold text-ink-faint w-5 text-right shrink-0">
                              {idx + 1}.
                            </span>

                            {/* Thumbnail with shimmer skeleton and fade-in */}
                            <div className="w-12 h-16 rounded border border-rule bg-paper flex items-center justify-center overflow-hidden shrink-0 shadow-sm relative">
                              <div className="absolute inset-0 skeleton-shimmer" />
                              {thumb ? (
                                <img
                                  src={thumb}
                                  alt={`Folio ${idx + 1}`}
                                  className="w-full h-full object-cover relative z-10 transition-opacity duration-300 opacity-100"
                                />
                              ) : (
                                <div className="p-1 text-center relative z-10">
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
                                <OdometerValue value={formatBytes(file.size)} />
                              </p>
                            </div>
                          </div>

                          {/* Reorder & Remove Controls (44px touch-friendly) */}
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => moveFileToEdge(idx, true)}
                              disabled={idx === 0}
                              className="px-2 py-1 rounded border border-rule hover:bg-kraft text-ink-soft disabled:opacity-30 min-h-[36px] flex items-center justify-center text-[10px] font-mono"
                              title="Move to top"
                            >
                              Top
                            </button>
                            <button
                              type="button"
                              onClick={() => moveFile(idx, -1)}
                              disabled={idx === 0}
                              className="p-2 sm:p-1.5 rounded border border-rule hover:bg-kraft text-ink-soft disabled:opacity-30 min-w-[36px] min-h-[36px] flex items-center justify-center"
                              title="Move folio up"
                            >
                              <MoveUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => moveFile(idx, 1)}
                              disabled={idx === selectedFiles.length - 1}
                              className="p-2 sm:p-1.5 rounded border border-rule hover:bg-kraft text-ink-soft disabled:opacity-30 min-w-[36px] min-h-[36px] flex items-center justify-center"
                              title="Move folio down"
                            >
                              <MoveDown className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => removeFile(idx, thumbKey)}
                              className="p-2 sm:p-1.5 rounded border border-rule hover:bg-red/10 text-red ml-1 min-w-[36px] min-h-[36px] flex items-center justify-center transition-all duration-200 group-hover:rotate-90"
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

              {/* 2. SPLIT: Visual Page Picker with Cut Lines & Scissors & Tap Mode */}
              {currentTool.id === 'split' && (
                <div className="space-y-4">
                  {/* Split Mode Switcher: Cut (Scissors) vs Tap to Select */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-rule pb-3">
                    <div className="flex items-center gap-1.5 p-1 rounded bg-paper border border-rule">
                      <button
                        type="button"
                        onClick={() => setSplitInteraction('cut')}
                        className={`px-3 py-1.5 rounded text-xs font-mono transition-colors min-h-[36px] flex items-center gap-1.5 ${
                          splitInteraction === 'cut'
                            ? 'bg-ink text-paper font-semibold'
                            : 'text-ink-soft hover:text-ink'
                        }`}
                      >
                        <Scissors className="w-3.5 h-3.5" />
                        <span>Cut Mode</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setSplitInteraction('select')}
                        className={`px-3 py-1.5 rounded text-xs font-mono transition-colors min-h-[36px] flex items-center gap-1.5 ${
                          splitInteraction === 'select'
                            ? 'bg-ink text-paper font-semibold'
                            : 'text-ink-soft hover:text-ink'
                        }`}
                      >
                        <CheckSquare className="w-3.5 h-3.5" />
                        <span>Select Pages</span>
                      </button>
                    </div>

                    {splitInteraction === 'select' && (
                      <div className="flex items-center gap-1 text-[11px] font-mono">
                        <span className="text-ink-faint mr-1">Select:</span>
                        <button
                          type="button"
                          onClick={() => quickSelectPages('all')}
                          className="px-2 py-1 rounded border border-rule bg-paper hover:bg-kraft text-ink"
                        >
                          All
                        </button>
                        <button
                          type="button"
                          onClick={() => quickSelectPages('none')}
                          className="px-2 py-1 rounded border border-rule bg-paper hover:bg-kraft text-ink"
                        >
                          None
                        </button>
                        <button
                          type="button"
                          onClick={() => quickSelectPages('odd')}
                          className="px-2 py-1 rounded border border-rule bg-paper hover:bg-kraft text-ink"
                        >
                          Odd
                        </button>
                        <button
                          type="button"
                          onClick={() => quickSelectPages('even')}
                          className="px-2 py-1 rounded border border-rule bg-paper hover:bg-kraft text-ink"
                        >
                          Even
                        </button>
                      </div>
                    )}

                    <span className="text-xs font-mono text-ink font-semibold">
                      Total Folios: {splitPageCount}
                    </span>
                  </div>

                  {/* Grid of visual pages with cut dividers */}
                  <div className="p-4 rounded border border-rule bg-vellum flex flex-wrap gap-4 items-center">
                    {Array.from({ length: Math.min(splitPageCount, 32) }).map((_, pIdx) => {
                      const pageNum = pIdx + 1;
                      const hasCut = cutPoints.has(pageNum);
                      const isSelected = selectedPages.has(pageNum);
                      const file = selectedFiles[0];
                      const thumb = thumbnails[`${file?.name}-${file?.size}`];

                      return (
                        <React.Fragment key={pageNum}>
                          {/* Page Thumbnail */}
                          <div
                            onClick={() => {
                              if (splitInteraction === 'select') {
                                toggleSelectPage(pageNum);
                              }
                            }}
                            className={`flex flex-col items-center gap-1 ${
                              splitInteraction === 'select' ? 'cursor-pointer' : ''
                            }`}
                          >
                            <div
                              className={`w-16 h-22 rounded border shadow-sm flex items-center justify-center overflow-hidden relative group transition-all ${
                                splitInteraction === 'select' && isSelected
                                  ? 'border-red bg-red/10 ring-2 ring-red/30'
                                  : 'border-rule bg-paper'
                              }`}
                            >
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

                              {splitInteraction === 'select' && isSelected && (
                                <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-red text-vellum flex items-center justify-center">
                                  <Check className="w-3 h-3 stroke-[3]" />
                                </div>
                              )}

                              <span className="absolute bottom-1 right-1 text-[9px] font-mono px-1 rounded bg-ink/70 text-vellum">
                                {pageNum}
                              </span>
                            </div>
                          </div>

                          {/* Cut Separator Line (44px hit-target for touch) */}
                          {splitInteraction === 'cut' && pageNum < splitPageCount && (
                            <button
                              type="button"
                              onClick={() => toggleCut(pageNum)}
                              className={`h-22 min-w-[44px] px-2 flex flex-col items-center justify-center group relative cursor-pointer focus:outline-none transition-colors active:scale-95 ${
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

              {/* 3. FROM-IMAGES: Multi-Image Sequencing Desk (Grid & List View) */}
              {currentTool.id === 'from-images' && (
                <div className="space-y-4">
                  {/* Sequence Helper Bar */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded border border-rule bg-paper text-xs">
                    <div>
                      <p className="font-semibold text-ink">
                        Sequence of Image Plates ({selectedFiles.length} pages in compiled PDF)
                      </p>
                      <p className="text-[11px] text-ink-soft mt-0.5 font-mono">
                        Each image becomes 1 page in order. Reorder using arrows or quick sort buttons.
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {/* Quick Sort Actions */}
                      <button
                        type="button"
                        onClick={() => sortImagesByName(true)}
                        className="px-2.5 py-1 text-[11px] font-mono rounded border border-rule bg-vellum hover:bg-kraft text-ink transition-colors flex items-center gap-1"
                        title="Sort images alphabetically (A to Z)"
                      >
                        <ArrowUpDown className="w-3 h-3" />
                        <span>Sort A–Z</span>
                      </button>

                      <button
                        type="button"
                        onClick={reverseImageOrder}
                        className="px-2.5 py-1 text-[11px] font-mono rounded border border-rule bg-vellum hover:bg-kraft text-ink transition-colors"
                        title="Reverse image sequence"
                      >
                        Reverse
                      </button>

                      {/* View Mode Switcher */}
                      <div className="flex items-center rounded border border-rule bg-vellum p-0.5 ml-1">
                        <button
                          type="button"
                          onClick={() => setImageLayoutView('grid')}
                          className={`p-1 rounded transition-colors ${
                            imageLayoutView === 'grid'
                              ? 'bg-ink text-paper shadow-sm'
                              : 'text-ink-soft hover:text-ink'
                          }`}
                          title="Grid View"
                        >
                          <LayoutGrid className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setImageLayoutView('list')}
                          className={`p-1 rounded transition-colors ${
                            imageLayoutView === 'list'
                              ? 'bg-ink text-paper shadow-sm'
                              : 'text-ink-soft hover:text-ink'
                          }`}
                          title="List View"
                        >
                          <List className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* GRID VIEW */}
                  {imageLayoutView === 'grid' ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
                      {selectedFiles.map((file, idx) => {
                        const thumbKey = `${file.name}-${file.size}`;
                        const thumb = thumbnails[thumbKey];
                        const isCollapsing = collapsingIds.has(thumbKey);

                        return (
                          <div
                            key={`${file.name}-${idx}`}
                            className={`relative flex flex-col justify-between p-3 rounded border border-rule bg-vellum hover:border-rule-strong hover:shadow-subtle transition-all duration-200 group ${
                              isCollapsing ? 'file-card-collapsing' : ''
                            }`}
                            style={{ animationDelay: `${idx * 25}ms` }}
                          >
                            {/* Header: Page Badge & Delete Button */}
                            <div className="flex items-center justify-between mb-2">
                              <span className="px-2 py-0.5 rounded bg-kraft border border-rule text-[11px] font-mono font-semibold text-ink">
                                Page {idx + 1}
                              </span>

                              <button
                                type="button"
                                onClick={() => removeFile(idx, thumbKey)}
                                className="p-1 rounded border border-transparent hover:border-red/30 hover:bg-red/10 text-ink-faint hover:text-red transition-colors"
                                title="Remove image plate"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            {/* Thumbnail Frame */}
                            <div className="aspect-[4/3] rounded border border-rule bg-paper overflow-hidden flex items-center justify-center relative shadow-sm">
                              {thumb ? (
                                <img
                                  src={thumb}
                                  alt={file.name}
                                  className="w-full h-full object-contain p-1"
                                />
                              ) : (
                                <div className="flex flex-col items-center justify-center p-2 text-ink-faint">
                                  <FileImage className="w-6 h-6 mb-1" />
                                  <span className="text-[9px] font-mono">Loading...</span>
                                </div>
                              )}
                            </div>

                            {/* Title & Metadata */}
                            <div className="mt-2.5 truncate">
                              <p className="text-xs font-medium text-ink truncate" title={file.name}>
                                {file.name}
                              </p>
                              <p className="text-[10px] font-mono text-ink-soft tabular-nums mt-0.5">
                                {formatBytes(file.size)}
                              </p>
                            </div>

                            {/* Reorder Arrows Footer */}
                            <div className="flex items-center justify-between pt-2 mt-2 border-t border-rule/60 text-[10px] font-mono text-ink-soft">
                              <button
                                type="button"
                                onClick={() => moveFile(idx, -1)}
                                disabled={idx === 0}
                                className="px-2 py-1 rounded border border-rule bg-paper hover:bg-kraft text-ink disabled:opacity-30 flex items-center gap-1 transition-colors"
                                title="Move earlier in sequence"
                              >
                                <MoveLeft className="w-3 h-3" />
                                <span>Prev</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => moveFile(idx, 1)}
                                disabled={idx === selectedFiles.length - 1}
                                className="px-2 py-1 rounded border border-rule bg-paper hover:bg-kraft text-ink disabled:opacity-30 flex items-center gap-1 transition-colors"
                                title="Move later in sequence"
                              >
                                <span>Next</span>
                                <MoveRight className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    /* LIST VIEW */
                    <div className="space-y-2">
                      {selectedFiles.map((file, idx) => {
                        const thumbKey = `${file.name}-${file.size}`;
                        const thumb = thumbnails[thumbKey];
                        const isCollapsing = collapsingIds.has(thumbKey);

                        return (
                          <div
                            key={`${file.name}-${idx}`}
                            className={`relative flex items-center justify-between p-3 rounded border border-rule bg-vellum hover:border-rule-strong hover:shadow-subtle transition-all duration-200 group ${
                              isCollapsing ? 'file-card-collapsing' : ''
                            }`}
                            style={{ animationDelay: `${idx * 25}ms` }}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <span className="font-mono text-xs font-semibold text-ink-faint w-6 text-right shrink-0">
                                {idx + 1}.
                              </span>

                              <div className="w-12 h-14 rounded border border-rule bg-paper flex items-center justify-center overflow-hidden shrink-0 shadow-sm">
                                {thumb ? (
                                  <img
                                    src={thumb}
                                    alt={file.name}
                                    className="w-full h-full object-contain p-0.5"
                                  />
                                ) : (
                                  <FileImage className="w-5 h-5 text-ink-faint" />
                                )}
                              </div>

                              <div className="truncate">
                                <p className="text-xs font-medium text-ink truncate" title={file.name}>
                                  {file.name}
                                </p>
                                <p className="text-[11px] font-mono text-ink-soft tabular-nums mt-0.5">
                                  {formatBytes(file.size)} • Page {idx + 1} of {selectedFiles.length}
                                </p>
                              </div>
                            </div>

                            {/* Controls */}
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => moveFileToEdge(idx, true)}
                                disabled={idx === 0}
                                className="px-2 py-1 rounded border border-rule hover:bg-kraft text-ink-soft disabled:opacity-30 text-[10px] font-mono"
                                title="Move to first page"
                              >
                                Top
                              </button>
                              <button
                                type="button"
                                onClick={() => moveFile(idx, -1)}
                                disabled={idx === 0}
                                className="p-1.5 rounded border border-rule hover:bg-kraft text-ink-soft disabled:opacity-30"
                                title="Move up"
                              >
                                <MoveUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => moveFile(idx, 1)}
                                disabled={idx === selectedFiles.length - 1}
                                className="p-1.5 rounded border border-rule hover:bg-kraft text-ink-soft disabled:opacity-30"
                                title="Move down"
                              >
                                <MoveDown className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => removeFile(idx, thumbKey)}
                                className="p-1.5 rounded border border-rule hover:bg-red/10 text-red ml-1"
                                title="Remove image"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Generic Single Document Presentation for other tools */}
              {currentTool.id !== 'merge' && currentTool.id !== 'split' && currentTool.id !== 'from-images' && (
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
                      Ready for {currentTool.verb} operation.
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
                      <p className="text-ink-soft mt-0.5">
                        {typeof errorMessage === 'string' ? errorMessage : JSON.stringify(errorMessage)}
                      </p>
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
            <div className="hidden lg:block lg:col-span-4 sticky top-20 space-y-4">
              <div className="p-5 rounded-md border border-rule bg-vellum shadow-subtle space-y-5">
                <div className="flex items-center justify-between border-b border-rule pb-3">
                  <span className="font-display text-base text-ink font-semibold">
                    Bench Configuration
                  </span>
                  <span className="font-mono text-[10px] uppercase text-ink-soft bg-kraft px-1.5 py-0.5 rounded border border-rule">
                    {currentTool.badgeText || 'Bench'}
                  </span>
                </div>

                {renderOptionsContent()}
              </div>
            </div>
          </div>
        )}

        {/* MOBILE OPTIONS BOTTOM SHEET (< lg) */}
        {isMobileOptionsOpen && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Bench Configuration Options"
            className="fixed inset-0 z-50 bg-ink/70 backdrop-blur-xs flex flex-col justify-end lg:hidden animate-fade-in"
            onClick={(e) => {
              if (e.target === e.currentTarget) setIsMobileOptionsOpen(false);
            }}
          >
            <div
              className="bg-paper border-t border-rule rounded-t-xl shadow-elevation p-5 max-h-[85vh] overflow-y-auto space-y-5 animate-slide-up"
              style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}
            >
              <div className="flex items-center justify-between border-b border-rule pb-3">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="w-4 h-4 text-ink-soft" />
                  <span className="font-display text-base text-ink font-semibold">
                    Bench Configuration
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsMobileOptionsOpen(false)}
                  className="p-1 rounded text-ink-soft hover:text-ink min-w-[36px] min-h-[36px] flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {renderOptionsContent()}

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setIsMobileOptionsOpen(false)}
                  className="w-full py-2.5 rounded bg-ink text-paper text-xs font-semibold font-mono min-h-[44px]"
                >
                  Done Configuring
                </button>
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
                <div className="relative">
                  <div className="animate-stamp-bindery border-2 border-moss px-3.5 py-1.5 rounded text-moss font-mono text-xs font-bold tracking-mono uppercase transform -rotate-6 shadow-xs">
                    {currentTool.id === 'verify-canary'
                      ? resultData.status
                      : currentTool.id === 'protect'
                      ? 'SEALED'
                      : currentTool.id === 'merge'
                      ? 'MERGED'
                      : 'DONE'}
                  </div>
                  <span
                    className="absolute inset-0 rounded border-2 border-moss opacity-35 animate-ping pointer-events-none"
                    style={{ animationDuration: '650ms', animationIterationCount: 1 }}
                  />
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
                      <OdometerValue value={formatBytes(resultData.output_file_size_bytes)} />
                    </span>
                  </div>
                )}

                {resultData.stats?.compression_ratio_pct !== undefined && (
                  <div className="border-t border-rule/60 pt-2 space-y-1.5">
                    <div className="flex justify-between text-ink-soft">
                      <span>Space Saved:</span>
                      <span className="text-moss font-semibold tabular-nums">
                        <OdometerValue value={resultData.stats.compression_ratio_pct} />%
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

              {/* Action Buttons: Download + Share + Vault + Start Over */}
              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                {resultData.download_url && (
                  <a
                    href={resultData.download_url}
                    download={resultData.output_filename || 'document.pdf'}
                    className="btn-sweep-container bindery-press-btn attention-pulse-once inline-flex items-center gap-2 px-6 py-2.5 rounded bg-red text-vellum font-semibold text-xs tracking-tight hover:bg-red-dark transition-all duration-120 shadow-[0_2px_0_#982c12] active:translate-y-px min-h-[44px]"
                  >
                    <Download className="w-4 h-4" strokeWidth={2} />
                    <span>Download Folio</span>
                    <ArrowRight className="w-3.5 h-3.5 ml-1 transition-transform group-hover:translate-x-1" />
                  </a>
                )}

                {resultData.download_url && (
                  <button
                    type="button"
                    onClick={handleShareResult}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded border border-rule bg-paper hover:bg-kraft active:bg-kraft/70 text-ink font-semibold text-xs font-mono transition-colors min-h-[44px]"
                    title="Share folio or copy download link"
                  >
                    <Share2 className="w-4 h-4 text-ink-soft" strokeWidth={1.75} />
                    <span>Share Folio</span>
                  </button>
                )}

                <button
                  onClick={resetBench}
                  className="px-4 py-2.5 rounded border border-rule bg-paper hover:bg-kraft text-ink text-xs font-mono transition-colors min-h-[44px]"
                >
                  Start Over
                </button>

                {isAuthenticated && (
                  <Link
                    to="/workspace"
                    className="px-4 py-2.5 rounded border border-rule bg-paper hover:bg-kraft text-ink text-xs font-mono transition-colors flex items-center gap-1.5 min-h-[44px]"
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
        <div
          className="fixed bottom-0 inset-x-0 z-30 bg-vellum/95 backdrop-blur-md border-t border-rule py-3 px-4 sm:px-6 shadow-ink-lift"
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}
        >
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4">
            <div className="flex items-center gap-2 sm:gap-3 shrink-0 w-full sm:w-auto justify-between sm:justify-start">
              <span className="text-xs font-semibold text-ink">
                {selectedFiles.length} {selectedFiles.length === 1 ? 'folio' : 'folios'}
              </span>
              <span className="text-xs font-mono text-ink-soft tabular-nums">
                [{formatBytes(totalBytes)}]
              </span>
            </div>

            {/* Prominent Progress Center Column */}
            {isProcessing && (
              <div className="flex-1 w-full max-w-xl mx-0 sm:mx-4 space-y-1.5 animate-fade-in">
                <div className="flex items-center justify-between text-xs font-mono">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-ink tabular-nums">
                      {progressMetrics.pct}%
                    </span>
                    <span className="text-ink-soft text-[11px]">
                      {progressMetrics.phase === 'upload'
                        ? `${formatBytes(progressMetrics.loadedBytes)} / ${formatBytes(progressMetrics.totalBytes || totalBytes)}`
                        : 'Server assembling folios in memory...'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5 text-[11px]">
                    <span className="text-ink font-semibold">{progressMetrics.speed}</span>
                    <span className="text-moss font-semibold">{progressMetrics.timeLeft}</span>
                  </div>
                </div>

                <div className="w-full bg-kraft border border-rule/70 h-2.5 rounded-full overflow-hidden shadow-inner">
                  <div
                    className={`h-full rounded-full transition-all duration-150 ${
                      progressMetrics.phase === 'processing'
                        ? 'bg-moss animate-pulse'
                        : 'bg-red'
                    }`}
                    style={{ width: `${progressMetrics.pct}%` }}
                  />
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
              {isProcessing && (
                <button
                  type="button"
                  onClick={handleCancel}
                  className="px-3 py-2 rounded border border-rule bg-paper text-ink-soft hover:text-ink text-xs font-mono transition-colors min-h-[44px]"
                >
                  Cancel
                </button>
              )}

              <PrimaryButton
                onClick={handleExecute}
                loading={isProcessing}
                loadingText={
                  progressMetrics.phase === 'upload'
                    ? `Uploading ${progressMetrics.pct}%...`
                    : `${currentTool.title}...`
                }
                className="px-5 sm:px-6 min-h-[44px]"
              >
                <span>{currentTool.actionBtn || `Execute ${currentTool.title}`}</span>
              </PrimaryButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
