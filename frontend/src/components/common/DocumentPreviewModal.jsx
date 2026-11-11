import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Download,
  Trash2,
  Share2,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  FileText,
  Loader2,
  AlertCircle,
  ExternalLink,
  ShieldCheck,
  Calendar,
  HardDrive,
  Check,
} from 'lucide-react';
import { loadPdfDocument, renderPdfPageToCanvas } from '../../utils/pdfThumbnails';

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export default function DocumentPreviewModal({ file, onClose, onDelete }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pdfDoc, setPdfDoc] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [numPages, setNumPages] = useState(1);
  const [zoomScale, setZoomScale] = useState(1.0);
  const [shareSuccess, setShareSuccess] = useState(false);
  const [showMetadata, setShowMetadata] = useState(false);

  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const touchStartXRef = useRef(null);

  const filename = file?.original_filename || 'document.pdf';
  const isPdf = filename.toLowerCase().endsWith('.pdf') || file?.action_type !== 'to-word';
  const isImage = /\.(png|jpe?g|webp|gif)$/i.test(filename);
  const isDocx = /\.docx?$/i.test(filename);

  // Compute best download/preview URL
  const resolvedUrl = file?.download_url || (file?.id ? `/api/v1/files/${file.id}/download` : null);

  // Keyboard navigation & Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        goToPrevPage();
      } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        goToNextPage();
      } else if (e.key === '+' || e.key === '=') {
        zoomIn();
      } else if (e.key === '-') {
        zoomOut();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [numPages, currentPage, onClose]);

  // Load PDF Document when modal opens
  useEffect(() => {
    let isCancelled = false;

    async function initPreview() {
      if (!isPdf || !resolvedUrl) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError('');
      try {
        const doc = await loadPdfDocument(resolvedUrl);
        if (isCancelled) return;

        if (!doc) {
          setError('Could not decode PDF document stream. You can still download the file directly.');
          setLoading(false);
          return;
        }

        setPdfDoc(doc);
        setNumPages(doc.numPages);
        setCurrentPage(1);
        setLoading(false);
      } catch (err) {
        if (!isCancelled) {
          console.warn('PDF preview load failed:', err);
          setError('Preview could not be rendered in-browser. Please download the folio to view.');
          setLoading(false);
        }
      }
    }

    initPreview();

    return () => {
      isCancelled = true;
    };
  }, [resolvedUrl, isPdf]);

  // Render current page to canvas whenever currentPage or zoomScale or pdfDoc changes
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;

    let isCancelled = false;

    async function renderPage() {
      try {
        await renderPdfPageToCanvas(pdfDoc, currentPage, canvasRef.current, zoomScale);
      } catch (err) {
        if (!isCancelled) {
          console.warn(`Render page ${currentPage} error:`, err);
        }
      }
    }

    renderPage();

    return () => {
      isCancelled = true;
    };
  }, [pdfDoc, currentPage, zoomScale]);

  const goToPrevPage = () => {
    setCurrentPage((p) => Math.max(1, p - 1));
  };

  const goToNextPage = () => {
    setCurrentPage((p) => Math.min(numPages, p + 1));
  };

  const zoomIn = () => {
    setZoomScale((s) => Math.min(2.5, +(s + 0.25).toFixed(2)));
  };

  const zoomOut = () => {
    setZoomScale((s) => Math.max(0.6, +(s - 0.25).toFixed(2)));
  };

  const resetZoom = () => {
    setZoomScale(1.0);
  };

  // Mobile touch swipe gestures (left/right)
  const handleTouchStart = (e) => {
    touchStartXRef.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e) => {
    if (touchStartXRef.current === null) return;
    const diffX = e.changedTouches[0].clientX - touchStartXRef.current;
    touchStartXRef.current = null;
    if (diffX > 60) {
      goToPrevPage();
    } else if (diffX < -60) {
      goToNextPage();
    }
  };

  // Native Web Share API integration
  const handleShare = async () => {
    if (navigator.share && resolvedUrl) {
      try {
        await navigator.share({
          title: filename,
          text: `CloudPDF Vault Document: ${filename}`,
          url: resolvedUrl,
        });
        setShareSuccess(true);
        setTimeout(() => setShareSuccess(false), 2500);
      } catch (err) {
        // User cancelled or share dismissed
      }
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(resolvedUrl);
      setShareSuccess(true);
      setTimeout(() => setShareSuccess(false), 2500);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Document preview for ${filename}`}
      className="fixed inset-0 z-50 bg-ink/70 backdrop-blur-xs flex items-center justify-center p-0 sm:p-4 md:p-6 animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="relative flex flex-col w-full h-[100dvh] sm:h-[92vh] sm:max-w-5xl rounded-none sm:rounded-md bg-paper border-0 sm:border sm:border-rule shadow-elevation overflow-hidden"
        style={{
          paddingTop: 'env(safe-area-inset-top, 0px)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        {/* Top Folio Header Bar */}
        <div className="flex items-center justify-between px-3 sm:px-5 py-2.5 sm:py-3 border-b border-rule bg-vellum shrink-0 gap-2 sm:gap-4">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="w-8 h-8 rounded border border-rule bg-paper flex items-center justify-center shrink-0 text-ink-soft">
              <FileText className="w-4 h-4" strokeWidth={1.5} />
            </div>
            <div className="min-w-0 flex-1">
              <h2
                className="font-display text-sm sm:text-base font-semibold text-ink truncate leading-tight"
                title={filename}
              >
                {filename}
              </h2>
              <div className="flex items-center gap-2 text-[10px] font-mono text-ink-soft tracking-mono mt-0.5">
                <span className="uppercase px-1.5 py-0.2 rounded bg-kraft border border-rule">
                  {file?.action_type || 'ARCHIVE'}
                </span>
                <span className="tabular-nums">
                  {formatBytes(file?.output_file_size_bytes || file?.file_size_bytes)}
                </span>
                <span className="hidden sm:inline-block">
                  • {file?.created_at ? new Date(file.created_at).toLocaleDateString() : 'Archived'}
                </span>
              </div>
            </div>
          </div>

          {/* Quick Header Actions */}
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            {/* Toggle Metadata Drawer */}
            <button
              onClick={() => setShowMetadata((v) => !v)}
              className={`p-2 rounded border transition-colors min-w-[40px] min-h-[40px] flex items-center justify-center text-xs font-mono ${
                showMetadata
                  ? 'border-ink bg-ink text-paper font-semibold'
                  : 'border-rule bg-paper hover:bg-kraft text-ink-soft hover:text-ink'
              }`}
              title="Document Details"
            >
              <ShieldCheck className="w-4 h-4" strokeWidth={1.5} />
            </button>

            {/* Native Share */}
            {typeof navigator !== 'undefined' && (navigator.share || navigator.clipboard) && (
              <button
                onClick={handleShare}
                className="p-2 rounded border border-rule bg-paper hover:bg-kraft text-ink-soft hover:text-ink transition-colors min-w-[40px] min-h-[40px] flex items-center justify-center"
                title="Share or copy link"
              >
                {shareSuccess ? (
                  <Check className="w-4 h-4 text-moss" strokeWidth={1.5} />
                ) : (
                  <Share2 className="w-4 h-4" strokeWidth={1.5} />
                )}
              </button>
            )}

            {/* Direct Download */}
            {resolvedUrl && (
              <a
                href={resolvedUrl}
                download={filename}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-red text-vellum hover:bg-red-dark text-xs font-semibold font-mono tracking-mono transition-colors shadow-ink-button min-h-[40px]"
                title="Download Folio"
              >
                <Download className="w-3.5 h-3.5" strokeWidth={1.75} />
                <span className="hidden sm:inline">Download</span>
              </a>
            )}

            {/* Close Button */}
            <button
              onClick={onClose}
              className="p-2 rounded border border-rule bg-paper hover:bg-kraft text-ink-soft hover:text-ink transition-colors min-w-[40px] min-h-[40px] flex items-center justify-center"
              aria-label="Close preview"
            >
              <X className="w-4 h-4" strokeWidth={1.5} />
            </button>
          </div>
        </div>

        {/* Floating Page Controls Toolbar (when viewing PDF) */}
        {isPdf && numPages > 0 && !loading && !error && (
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-rule bg-kraft/40 shrink-0 text-xs font-mono">
            {/* Page navigation */}
            <div className="flex items-center gap-1">
              <button
                onClick={goToPrevPage}
                disabled={currentPage <= 1}
                className="p-1.5 rounded border border-rule bg-paper hover:bg-kraft text-ink disabled:opacity-40 transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
                aria-label="Previous Page"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <div className="px-2 text-ink tabular-nums text-xs">
                Folio <span className="font-semibold">{currentPage}</span> of{' '}
                <span className="font-semibold">{numPages}</span>
              </div>
              <button
                onClick={goToNextPage}
                disabled={currentPage >= numPages}
                className="p-1.5 rounded border border-rule bg-paper hover:bg-kraft text-ink disabled:opacity-40 transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
                aria-label="Next Page"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Zoom controls */}
            <div className="flex items-center gap-1">
              <button
                onClick={zoomOut}
                disabled={zoomScale <= 0.6}
                className="p-1.5 rounded border border-rule bg-paper hover:bg-kraft text-ink disabled:opacity-40 transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
                title="Zoom Out (-)"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={resetZoom}
                className="px-2 py-1 rounded border border-rule bg-paper hover:bg-kraft text-ink text-[11px] tabular-nums transition-colors min-h-[36px] flex items-center"
                title="Reset Zoom"
              >
                {Math.round(zoomScale * 100)}%
              </button>
              <button
                onClick={zoomIn}
                disabled={zoomScale >= 2.5}
                className="p-1.5 rounded border border-rule bg-paper hover:bg-kraft text-ink disabled:opacity-40 transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
                title="Zoom In (+)"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Main Preview Workspace */}
        <div className="relative flex-1 flex overflow-hidden bg-kraft/30">
          {/* Scrollable Viewport */}
          <div
            ref={containerRef}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            className="flex-1 overflow-auto p-4 sm:p-6 md:p-8 flex items-center justify-center"
          >
            {loading && (
              <div className="p-8 text-center space-y-3">
                <Loader2 className="w-6 h-6 animate-spin text-ink-soft mx-auto" />
                <p className="font-mono text-xs text-ink-soft">
                  Rendering folio pages from secure stream...
                </p>
              </div>
            )}

            {error && (
              <div className="max-w-md p-6 rounded border border-rule bg-vellum text-center space-y-3 shadow-subtle">
                <AlertCircle className="w-8 h-8 text-red mx-auto" strokeWidth={1.5} />
                <h3 className="font-display text-base text-ink font-semibold">
                  In-Browser Preview Unavailable
                </h3>
                <p className="text-xs text-ink-soft leading-relaxed">{error}</p>
                {resolvedUrl && (
                  <div className="pt-2">
                    <a
                      href={resolvedUrl}
                      download={filename}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded bg-red text-vellum hover:bg-red-dark text-xs font-semibold transition-colors"
                    >
                      <Download className="w-4 h-4" />
                      <span>Download Folio File</span>
                    </a>
                  </div>
                )}
              </div>
            )}

            {!loading && !error && isPdf && (
              <div className="relative transition-transform duration-150 ease-out">
                {/* Paper sheet backing */}
                <div className="p-2 sm:p-3 bg-paper border border-rule shadow-paper rounded">
                  <canvas
                    ref={canvasRef}
                    className="block max-w-full h-auto bg-vellum mx-auto"
                  />
                </div>
              </div>
            )}

            {!loading && !error && isImage && (
              <div className="max-w-full max-h-full p-2 bg-paper border border-rule shadow-paper rounded flex items-center justify-center">
                <img
                  src={resolvedUrl}
                  alt={filename}
                  className="max-w-full max-h-[75vh] object-contain rounded"
                />
              </div>
            )}

            {!loading && !error && isDocx && (
              <div className="max-w-md p-8 rounded border border-rule bg-vellum text-center space-y-4 shadow-subtle">
                <div className="w-12 h-12 rounded border border-rule bg-paper mx-auto flex items-center justify-center text-ink-soft">
                  <FileText className="w-6 h-6" strokeWidth={1.5} />
                </div>
                <div className="space-y-1">
                  <h3 className="font-display text-base text-ink font-semibold">
                    Word Manuscript Document
                  </h3>
                  <p className="text-xs text-ink-soft leading-relaxed">
                    This folio is stored as a Microsoft Word DOCX archive. Use the Typeset (Word to PDF) tool or download to view in Word.
                  </p>
                </div>
                {resolvedUrl && (
                  <div className="pt-2">
                    <a
                      href={resolvedUrl}
                      download={filename}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded bg-red text-vellum hover:bg-red-dark text-xs font-semibold transition-colors"
                    >
                      <Download className="w-4 h-4" />
                      <span>Download DOCX Folio</span>
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Collapsible Metadata Drawer */}
          {showMetadata && (
            <aside className="w-72 border-l border-rule bg-vellum p-4 overflow-y-auto space-y-4 text-xs font-mono shrink-0 shadow-subtle animate-fade-in">
              <div className="flex items-center justify-between border-b border-rule pb-2">
                <span className="font-semibold text-ink uppercase tracking-mono">
                  ARCHIVAL RECORD
                </span>
                <button
                  onClick={() => setShowMetadata(false)}
                  className="p-1 hover:text-ink text-ink-soft"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <div className="text-[10px] text-ink-faint uppercase">Document ID</div>
                  <div className="text-[11px] text-ink truncate mt-0.5 select-all font-mono">
                    {file?.id || 'N/A'}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] text-ink-faint uppercase">Original Filename</div>
                  <div className="text-xs text-ink break-words mt-0.5 font-semibold">
                    {filename}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] text-ink-faint uppercase">Bench Action</div>
                  <div className="text-xs text-ink mt-0.5">
                    <span className="px-1.5 py-0.5 rounded bg-kraft border border-rule uppercase text-[10px]">
                      {file?.action_type || 'Preserved'}
                    </span>
                  </div>
                </div>

                <div>
                  <div className="text-[10px] text-ink-faint uppercase">File Size</div>
                  <div className="text-xs text-ink mt-0.5 tabular-nums">
                    {formatBytes(file?.output_file_size_bytes || file?.file_size_bytes)}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] text-ink-faint uppercase">Archived Timestamp</div>
                  <div className="text-xs text-ink mt-0.5">
                    {file?.created_at ? new Date(file.created_at).toLocaleString() : 'N/A'}
                  </div>
                </div>

                <div className="pt-2 border-t border-rule space-y-1.5">
                  <div className="flex items-center gap-1.5 text-moss text-[11px]">
                    <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                    <span>AES-256 Encrypted Cloud Storage</span>
                  </div>
                  <p className="text-[10px] text-ink-soft leading-normal">
                    Isolated client storage protected by cryptographic token authentication and end-to-end encryption.
                  </p>
                </div>

                {onDelete && (
                  <div className="pt-4 border-t border-rule">
                    <button
                      onClick={() => {
                        if (window.confirm(`Permanently remove '${filename}' from your vault?`)) {
                          onDelete(file);
                          onClose();
                        }
                      }}
                      className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded border border-red/40 bg-red/10 text-red hover:bg-red/20 text-xs font-semibold transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete Document</span>
                    </button>
                  </div>
                )}
              </div>
            </aside>
          )}
        </div>

        {/* Mobile Sticky Footer */}
        <div className="flex sm:hidden items-center justify-between px-4 py-3 border-t border-rule bg-vellum shrink-0 gap-2">
          {resolvedUrl && (
            <a
              href={resolvedUrl}
              download={filename}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded bg-red text-vellum font-semibold text-xs transition-colors shadow-ink-button min-h-[44px]"
            >
              <Download className="w-4 h-4" />
              <span>Download File</span>
            </a>
          )}
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded border border-rule bg-paper text-ink font-semibold text-xs min-h-[44px]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

