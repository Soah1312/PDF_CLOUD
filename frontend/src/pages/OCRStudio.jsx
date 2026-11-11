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
  Cpu,
  Layers,
  Sparkles,
  Eye,
  Check,
  AlertTriangle,
  ArrowLeft,
  Clock,
  ExternalLink,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  inspectPdfOcr,
  createSearchablePdf,
  getOcrJobStatus,
  downloadOcrPdf,
  fetchOcrJobs,
} from '../services/api';

const STAGE_LABELS = {
  QUEUED: 'Queued in Processing Pipeline...',
  VALIDATING: 'Validating Document Geometry & Integrity...',
  STORING_ORIGINAL: 'Transferring to Encrypted Private S3 Bucket...',
  OCR_PROCESSING: 'OCRmyPDF + Tesseract Recognizing Glyphs & Layout...',
  VERIFYING_OUTPUT: 'Verifying Injected Text Layer & PDF Structure...',
  STORING_OUTPUT: 'Finalizing Searchable PDF in S3 Storage...',
  COMPLETED: 'Searchable PDF Ready!',
  FAILED: 'Processing Failed',
};

export const OCRStudio = () => {
  const { user, isAuthenticated } = useAuth();
  const fileInputRef = useRef(null);

  // File & Inspection State
  const [file, setFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isInspecting, setIsInspecting] = useState(false);
  const [inspectionResult, setInspectionResult] = useState(null);
  const [forceOcr, setForceOcr] = useState(false);

  // Execution & Progress State
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentJob, setCurrentJob] = useState(null);
  const [pollErrorCount, setPollErrorCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);

  // Recent Jobs State
  const [recentJobs, setRecentJobs] = useState([]);
  const [loadingRecent, setLoadingRecent] = useState(false);

  // Format bytes
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

    // Pre-flight inspection for existing digital text
    setIsInspecting(true);
    try {
      const inspectData = await inspectPdfOcr(selectedFile);
      setInspectionResult(inspectData);
    } catch (err) {
      console.warn('[OCRStudio] Inspection failed:', err);
      // Non-blocking: user can still proceed with OCR
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

  // Reset tool to upload another file
  const handleReset = () => {
    setFile(null);
    setInspectionResult(null);
    setCurrentJob(null);
    setErrorMessage('');
    setForceOcr(false);
    setIsProcessing(false);
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
        // Digital text detected and force_ocr was false
        setInspectionResult((prev) => ({
          ...prev,
          has_digital_text: true,
          message: resp.message,
        }));
        setIsProcessing(false);
        return;
      }

      setCurrentJob({
        job_id: resp.job_id,
        status: resp.status || 'PENDING',
        processing_stage: resp.processing_stage || 'QUEUED',
        progress: resp.progress || 5,
        original_filename: file.name,
      });

      // Start polling
      startPolling(resp.job_id);
    } catch (err) {
      console.error('[OCRStudio] Submission failed:', err);
      const detail = err.response?.data?.detail || err.message || 'Failed to initiate OCR job.';
      setErrorMessage(detail);
      setIsProcessing(false);
    }
  };

  // Polling loop for async OCR job
  const startPolling = (jobId) => {
    let attempts = 0;
    const maxAttempts = 120; // Up to 4-5 minutes max

    const interval = setInterval(async () => {
      attempts += 1;
      try {
        const statusData = await getOcrJobStatus(jobId);
        setCurrentJob(statusData);

        if (statusData.status === 'COMPLETED') {
          clearInterval(interval);
          setIsProcessing(false);
          loadRecentJobs();
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

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Back link */}
      <div className="mb-6">
        <Link
          to="/"
          className="inline-flex items-center text-xs font-mono uppercase tracking-wider text-ink-soft hover:text-ink transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5 mr-1.5" /> Return to Bench
        </Link>
      </div>

      {/* Header */}
      <div className="border-b border-rule pb-8 mb-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-cyan/10 border border-cyan/20 text-cyan text-xs font-semibold mb-3">
              <Cpu className="w-3.5 h-3.5 mr-1" />
              <span>BENCH TOOL 15 • OCRmyPDF + TESSERACT OCR</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-ink tracking-tight font-serif">
              OCR Studio — Make PDF Searchable
            </h1>
            <p className="mt-2 text-sm sm:text-base text-ink-soft max-w-3xl leading-relaxed">
              Upload scanned documents, invoices, or books. OCRmyPDF and Tesseract perform high-accuracy Optical Character
              Recognition, embedding an invisible machine-readable text layer while preserving original scanned page image
              appearance, dimensions, and visual clarity—enabling instant text selection, clipboard copying, and Ctrl+F keyboard search.
            </p>
          </div>

          <div className="flex flex-col items-end text-xs font-mono text-ink-faint">
            <span className="flex items-center text-moss font-semibold">
              <ShieldCheck className="w-4 h-4 mr-1 text-moss" /> Private S3 Storage
            </span>
            <span className="mt-1">Engine: OCRmyPDF + Tesseract</span>
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {errorMessage && (
        <div className="mb-6 p-4 rounded-xl bg-red/10 border border-red/30 text-xs sm:text-sm text-red-dark flex items-start space-x-3 shadow-sm">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-red" />
          <div className="flex-1">
            <span className="font-semibold block mb-0.5">Processing Notification:</span>
            <span>{errorMessage}</span>
          </div>
          <button
            onClick={() => setErrorMessage('')}
            className="text-xs text-red font-semibold hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* MAIN WORKBENCH: Upload, Inspection, Processing, Completion */}
      <div className="bg-vellum border border-rule rounded-2xl p-6 sm:p-8 shadow-sm">
        {/* VIEW 1: UPLOAD & PRE-FLIGHT INSPECTION */}
        {!isProcessing && (!currentJob || currentJob.status !== 'COMPLETED') && (
          <div>
            {/* Hidden native input */}
            <input
              type="file"
              ref={fileInputRef}
              accept=".pdf,application/pdf"
              onChange={(e) => handleFileSelect(e.target.files[0])}
              className="hidden"
            />

            {!file ? (
              // Empty Dropzone
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-10 sm:p-14 text-center cursor-pointer transition-all ${
                  isDragging
                    ? 'border-cyan bg-cyan/5 scale-[0.99]'
                    : 'border-rule hover:border-ink-soft bg-paper/50'
                }`}
              >
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-kraft/70 border border-rule flex items-center justify-center text-cyan shadow-sm">
                  <UploadCloud className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-bold text-ink">
                  Select or drag a scanned PDF document here
                </h3>
                <p className="mt-1.5 text-xs text-ink-soft max-w-md mx-auto leading-relaxed">
                  Supports multipage scanned documents, invoices, receipts, and archived records up to 100 MB.
                </p>
                <div className="mt-5 inline-flex items-center px-4 py-2 rounded-lg bg-ink text-paper text-xs font-semibold shadow hover:bg-ink-soft transition-colors">
                  Browse Files
                </div>
              </div>
            ) : (
              // File Selected & Inspected
              <div className="space-y-6">
                {/* File Overview Card */}
                <div className="p-4 rounded-xl bg-paper border border-rule flex items-center justify-between">
                  <div className="flex items-center space-x-3.5 truncate">
                    <div className="w-10 h-10 rounded-lg bg-kraft border border-rule flex items-center justify-center text-ink shrink-0">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div className="truncate">
                      <h4 className="text-sm font-bold text-ink truncate" title={file.name}>
                        {file.name}
                      </h4>
                      <p className="text-xs text-ink-faint font-mono">
                        {formatBytes(file.size)} • {inspectionResult?.page_count ? `${inspectionResult.page_count} pages` : 'Analyzing page count...'}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={handleReset}
                    className="p-2 text-ink-soft hover:text-red transition-colors"
                    title="Remove file and choose another"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Digital Text Pre-Flight Inspection Status */}
                {isInspecting ? (
                  <div className="p-4 rounded-xl bg-cyan/5 border border-cyan/20 flex items-center space-x-3 text-xs text-cyan">
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                    <span>Analyzing document structure for existing digital text...</span>
                  </div>
                ) : inspectionResult ? (
                  inspectionResult.has_digital_text ? (
                    // Document ALREADY contains text!
                    <div className="p-5 rounded-xl bg-marigold/15 border border-marigold/40 text-xs text-ink space-y-3">
                      <div className="flex items-start space-x-2.5">
                        <AlertTriangle className="w-5 h-5 text-marigold shrink-0 mt-0.5" />
                        <div>
                          <p className="font-bold text-sm text-ink">
                            Searchable Text Already Detected
                          </p>
                          <p className="text-ink-soft mt-1 leading-relaxed">
                            {inspectionResult.message}
                          </p>
                        </div>
                      </div>

                      {/* Force OCR Checkbox */}
                      <label className="flex items-center space-x-2.5 pt-2 border-t border-marigold/30 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={forceOcr}
                          onChange={(e) => setForceOcr(e.target.checked)}
                          className="w-4 h-4 rounded border-rule text-cyan focus:ring-cyan"
                        />
                        <span className="font-semibold text-xs text-ink">
                          Force OCR: Proceed with full OCRmyPDF + Tesseract re-scan anyway (useful for mixed handwriting or faded scans)
                        </span>
                      </label>
                    </div>
                  ) : (
                    // Scanned document without text
                    <div className="p-4 rounded-xl bg-moss/10 border border-moss/30 text-xs text-moss flex items-center space-x-2.5">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>
                        Verified Scanned Document: No embedded digital text detected. Ready for OCRmyPDF + Tesseract OCR.
                      </span>
                    </div>
                  )
                ) : null}

                {/* Submit Action */}
                <div className="flex items-center justify-between pt-4 border-t border-rule">
                  <button
                    onClick={handleReset}
                    className="text-xs font-semibold text-ink-soft hover:text-ink transition-colors"
                  >
                    Cancel
                  </button>

                  <button
                    onClick={handleStartOCR}
                    disabled={isInspecting}
                    className="inline-flex items-center px-6 py-3 rounded-xl bg-cyan hover:bg-cyan/90 text-white font-bold text-sm shadow-md transition-all disabled:opacity-50"
                  >
                    <Sparkles className="w-4 h-4 mr-2" />
                    Make PDF Searchable
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* VIEW 2: ACTIVE PROCESSING PIPELINE */}
        {isProcessing && currentJob && (
          <div className="py-8 px-4 text-center space-y-6">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-cyan/10 border border-cyan/30 flex items-center justify-center text-cyan shadow-sm">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>

            <div>
              <span className="text-xs font-mono uppercase tracking-wider text-cyan font-bold">
                STAGE: {currentJob.processing_stage}
              </span>
              <h3 className="text-xl font-bold text-ink mt-1 font-serif">
                {STAGE_LABELS[currentJob.processing_stage] || 'Processing with OCRmyPDF + Tesseract...'}
              </h3>
              <p className="text-xs text-ink-soft mt-1.5 font-mono">
                Document: {file?.name || currentJob.original_filename}
              </p>
            </div>

            {/* Progress Bar */}
            <div className="max-w-md mx-auto space-y-2">
              <div className="w-full bg-kraft h-2.5 rounded-full overflow-hidden">
                <div
                  className="bg-cyan h-full rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${Math.max(8, currentJob.progress || 10)}%` }}
                />
              </div>
              <div className="flex justify-between text-[11px] font-mono text-ink-faint">
                <span>OCR Pipeline</span>
                <span>{currentJob.progress || 10}%</span>
              </div>
            </div>

            {/* 4 Pipeline Milestones */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-2xl mx-auto pt-6 text-left">
              <div className={`p-3 rounded-lg border text-xs ${
                currentJob.progress >= 20 ? 'bg-moss/10 border-moss/30 text-moss' : 'bg-paper border-rule text-ink-faint'
              }`}>
                <div className="font-bold flex items-center">
                  {currentJob.progress >= 20 ? <Check className="w-3.5 h-3.5 mr-1" /> : <span className="w-3.5 h-3.5 mr-1">1.</span>}
                  S3 Ingestion
                </div>
                <div className="text-[10px] mt-0.5 opacity-80">Encrypted raw upload</div>
              </div>

              <div className={`p-3 rounded-lg border text-xs ${
                currentJob.progress >= 40 ? 'bg-cyan/10 border-cyan/30 text-cyan' : 'bg-paper border-rule text-ink-faint'
              }`}>
                <div className="font-bold flex items-center">
                  {currentJob.progress >= 75 ? <Check className="w-3.5 h-3.5 mr-1" /> : <span className="w-3.5 h-3.5 mr-1">2.</span>}
                  Tesseract OCR
                </div>
                <div className="text-[10px] mt-0.5 opacity-80">OCRmyPDF engine</div>
              </div>

              <div className={`p-3 rounded-lg border text-xs ${
                currentJob.progress >= 80 ? 'bg-cyan/10 border-cyan/30 text-cyan' : 'bg-paper border-rule text-ink-faint'
              }`}>
                <div className="font-bold flex items-center">
                  {currentJob.progress >= 90 ? <Check className="w-3.5 h-3.5 mr-1" /> : <span className="w-3.5 h-3.5 mr-1">3.</span>}
                  Invisible Layer
                </div>
                <div className="text-[10px] mt-0.5 opacity-80">Searchable PDF/A</div>
              </div>

              <div className={`p-3 rounded-lg border text-xs ${
                currentJob.progress >= 100 ? 'bg-moss/10 border-moss/30 text-moss' : 'bg-paper border-rule text-ink-faint'
              }`}>
                <div className="font-bold flex items-center">
                  {currentJob.progress >= 100 ? <Check className="w-3.5 h-3.5 mr-1" /> : <span className="w-3.5 h-3.5 mr-1">4.</span>}
                  Ready
                </div>
                <div className="text-[10px] mt-0.5 opacity-80">Downloadable PDF</div>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 3: COMPLETION & DOWNLOAD */}
        {currentJob && currentJob.status === 'COMPLETED' && (
          <div className="space-y-6 py-2">
            <div className="p-6 rounded-xl bg-moss/10 border border-moss/30 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center space-x-3.5">
                <div className="w-12 h-12 rounded-xl bg-moss text-paper flex items-center justify-center shrink-0 shadow-md">
                  <CheckCircle2 className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-ink">
                    Searchable PDF Successfully Generated!
                  </h3>
                  <p className="text-xs text-ink-soft mt-0.5">
                    Original scanned pages preserved. Machine-readable invisible text layer injected via OCRmyPDF + Tesseract.
                  </p>
                </div>
              </div>

              <button
                onClick={() => handleDownload(currentJob.job_id, currentJob.original_filename)}
                disabled={isDownloading}
                className="inline-flex items-center px-6 py-3 rounded-xl bg-moss hover:bg-moss/90 text-paper font-bold text-sm shadow-md transition-all shrink-0"
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

            {/* Verification Specs Table */}
            <div className="p-5 rounded-xl bg-paper border border-rule grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-mono">
              <div>
                <span className="text-ink-faint block text-[10px] uppercase">Original File</span>
                <span className="font-bold text-ink truncate block mt-0.5" title={currentJob.original_filename}>
                  {currentJob.original_filename}
                </span>
                <span className="text-ink-soft text-[11px]">{formatBytes(currentJob.file_size_bytes)}</span>
              </div>

              <div>
                <span className="text-ink-faint block text-[10px] uppercase">Searchable PDF</span>
                <span className="font-bold text-ink truncate block mt-0.5">
                  searchable_{currentJob.original_filename}
                </span>
                <span className="text-ink-soft text-[11px]">{formatBytes(currentJob.output_file_size_bytes)}</span>
              </div>

              <div>
                <span className="text-ink-faint block text-[10px] uppercase">Page Count</span>
                <span className="font-bold text-ink block mt-0.5">
                  {currentJob.page_count} Pages
                </span>
                <span className="text-moss font-semibold text-[11px]">100% OCR Processed</span>
              </div>

              <div>
                <span className="text-ink-faint block text-[10px] uppercase">Search Capabilities</span>
                <span className="font-bold text-cyan block mt-0.5">
                  Ctrl+F & Select Ready
                </span>
                <span className="text-ink-soft text-[11px]">Invisible Mode 3</span>
              </div>
            </div>

            {/* Action to process another file */}
            <div className="flex justify-between items-center pt-2">
              <span className="text-xs text-ink-faint">
                {isAuthenticated ? 'Saved in your member vault.' : 'Guest file expires in 24 hours.'}
              </span>
              <button
                onClick={handleReset}
                className="text-xs font-bold text-cyan hover:underline inline-flex items-center"
              >
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Process Another Document
              </button>
            </div>
          </div>
        )}
      </div>

      {/* RECENT OCR LEDGER */}
      {recentJobs.length > 0 && (
        <div className="mt-12">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-ink font-serif uppercase tracking-wider flex items-center">
              <Clock className="w-4 h-4 mr-2 text-cyan" /> Recent OCR History
            </h3>
            <button
              onClick={loadRecentJobs}
              className="text-xs text-ink-soft hover:text-ink font-mono"
            >
              Refresh
            </button>
          </div>

          <div className="bg-vellum border border-rule rounded-xl overflow-hidden shadow-sm">
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
                    <td className="py-3 px-4 text-ink font-sans font-medium truncate max-w-[200px]" title={j.filename}>
                      {j.filename}
                    </td>
                    <td className="py-3 px-4 text-ink-soft">{j.page_count}</td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        j.status === 'COMPLETED'
                          ? 'bg-moss/10 text-moss border border-moss/20'
                          : j.status === 'FAILED'
                          ? 'bg-red/10 text-red border border-red/20'
                          : 'bg-cyan/10 text-cyan border border-cyan/20 animate-pulse'
                      }`}>
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
    </div>
  );
};

export default OCRStudio;
