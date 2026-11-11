import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  fetchCurrentUser,
  fetchSessionContext,
  fetchFiles,
  uploadFile,
  deleteFile,
  fetchCanaryTokens,
  revokeCanaryToken,
} from '../services/api';
import {
  FolderLock,
  HardDrive,
  UploadCloud,
  FileText,
  Plus,
  RefreshCw,
  Lock,
  Download,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Layers,
  ShieldCheck,
  ShieldAlert,
  Ban,
  Fingerprint,
  Search,
  ArrowUpDown,
  RotateCcw,
  CheckSquare,
  Square,
  ExternalLink,
  X,
  FileCheck,
  Eye,
  Archive,
} from 'lucide-react';
import { renderPdfThumbnail } from '../utils/pdfThumbnails';
import DocumentPreviewModal from '../components/common/DocumentPreviewModal';

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function resolveDownloadFilename(file) {
  if (!file) return 'document.pdf';
  const name = file.original_filename || 'document';
  const action = (file.action_type || '').toUpperCase();
  const base = name.replace(/\.[^/.]+$/, '');
  if (action === 'PDF_TO_IMAGES' || action === 'TO-IMAGES' || name.toLowerCase().endsWith('.zip')) {
    return name.toLowerCase().endsWith('.zip') ? name : `${base}_images.zip`;
  }
  if (action === 'TO_WORD' || action === 'PDF_TO_WORD' || action === 'TO-WORD' || name.toLowerCase().endsWith('.docx')) {
    return name.toLowerCase().endsWith('.docx') ? name : `${base}.docx`;
  }
  return name;
}

const ACTION_LABELS = {
  upload: { label: 'Uploaded Folio', verb: 'upload' },
  protect: { label: 'Archival Seal (AES-256)', verb: 'seal' },
  canary_embed: { label: 'Forensic Canary Watermark', verb: 'trace' },
  compress: { label: 'Stream Press', verb: 'press' },
  merge: { label: 'Bound Volume', verb: 'bind' },
  split: { label: 'Trimmed Pages', verb: 'cut' },
  rotate: { label: 'Aligned Folio', verb: 'turn' },
  watermark: { label: 'Translucent Stamp', verb: 'stamp' },
  'to-images': { label: 'Image Plates', verb: 'render' },
  'from-images': { label: 'Compiled PDF', verb: 'compile' },
  'to-word': { label: 'Extracted Word DOCX', verb: 'extract' },
  'from-word': { label: 'Typeset PDF', verb: 'bind' },
};

export default function Workspace() {
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [sessionCtx, setSessionCtx] = useState(null);
  const [files, setFiles] = useState([]);
  const [canaryTokens, setCanaryTokens] = useState([]);
  const [activeTab, setActiveTab] = useState('vault'); // 'vault' | 'canary'
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  // Search & Sort state
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('date_desc'); // 'date_desc', 'date_asc', 'size_desc', 'name_asc'
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [previewFile, setPreviewFile] = useState(null);

  // Optimistic deletion with undo toast state
  const [undoToast, setUndoToast] = useState(null); // { item, timerId, countdown }
  const fileInputRef = useRef(null);

  const loadData = async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const [userData, contextData, fileData, tokenData] = await Promise.all([
        fetchCurrentUser(),
        fetchSessionContext(),
        fetchFiles().catch(() => ({ files: [], storage_used_bytes: 0 })),
        fetchCanaryTokens().catch(() => []),
      ]);
      setProfile(userData);
      setSessionCtx(contextData);
      setFiles(fileData.files || []);
      setCanaryTokens(tokenData || []);
    } catch (err) {
      console.error('Failed to load workspace data:', err);
      setErrorMessage('Could not synchronize your workspace. Please refresh.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Handle Drag-and-drop file upload directly onto the Vault
  const handleDrop = async (e) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer?.files?.[0];
    if (!dropped) return;
    await uploadSingleFile(dropped);
  };

  const uploadSingleFile = async (file) => {
    setIsUploading(true);
    setMessage('');
    setErrorMessage('');
    try {
      await uploadFile(file);
      setMessage(`Successfully archived '${file.name}' to Vault.`);
      await loadData();
    } catch (err) {
      setErrorMessage(err.response?.data?.detail || 'Failed to upload document.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Optimistic Delete with 5-second Undo Toast
  const handleDeleteWithUndo = (file) => {
    // 1. Remove from local state immediately
    setFiles((prev) => prev.filter((f) => f.id !== file.id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(file.id);
      return next;
    });

    // 2. Set 5-second timer
    const timerId = setTimeout(async () => {
      try {
        await deleteFile(file.id);
        setUndoToast(null);
      } catch (err) {
        console.error('Failed to delete file on server:', err);
        setErrorMessage('Failed to delete file from remote vault.');
        loadData();
      }
    }, 5000);

    setUndoToast({
      file,
      timerId,
      expiresAt: Date.now() + 5000,
    });
  };

  const handleUndoDelete = () => {
    if (undoToast) {
      clearTimeout(undoToast.timerId);
      // Restore file
      setFiles((prev) => [undoToast.file, ...prev]);
      setUndoToast(null);
      setMessage(`Restored '${undoToast.file.original_filename}'.`);
    }
  };

  // Multi-select toggle
  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredFiles.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredFiles.map((f) => f.id)));
    }
  };

  // Bulk actions
  const handleBulkDownload = () => {
    const selectedFiles = files.filter((f) => selectedIds.has(f.id));
    selectedFiles.forEach((f) => {
      if (f.download_url) {
        const a = document.createElement('a');
        a.href = f.download_url;
        a.download = f.original_filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    });
  };

  const handleBulkDelete = () => {
    const selectedFiles = files.filter((f) => selectedIds.has(f.id));
    if (
      !window.confirm(
        `Are you sure you want to remove ${selectedFiles.length} files from your vault?`
      )
    ) {
      return;
    }
    selectedFiles.forEach((file) => handleDeleteWithUndo(file));
  };

  const handleRevokeCanary = async (tokenId) => {
    if (
      !window.confirm(
        `Revoke forensic canary token '${tokenId}'? Future verifications of this document will reflect that it was revoked.`
      )
    ) {
      return;
    }
    try {
      await revokeCanaryToken(tokenId);
      setMessage(`Successfully revoked canary token '${tokenId}'.`);
      await loadData();
    } catch (err) {
      setErrorMessage(err.response?.data?.detail || 'Failed to revoke canary token.');
    }
  };

  // Filter & sort files
  const filteredFiles = files
    .filter((f) => {
      const match =
        f.original_filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (f.action_type && f.action_type.toLowerCase().includes(searchQuery.toLowerCase()));
      return match;
    })
    .sort((a, b) => {
      if (sortBy === 'date_desc') return new Date(b.created_at) - new Date(a.created_at);
      if (sortBy === 'date_asc') return new Date(a.created_at) - new Date(b.created_at);
      if (sortBy === 'size_desc') {
        const sA = a.output_file_size_bytes || a.file_size_bytes || 0;
        const sB = b.output_file_size_bytes || b.file_size_bytes || 0;
        return sB - sA;
      }
      if (sortBy === 'name_asc') return a.original_filename.localeCompare(b.original_filename);
      return 0;
    });

  const MAX_STORAGE_BYTES = 524288000; // 500 MB member tier
  const storageUsed = profile?.storage_used_bytes || 0;
  const storagePercentage = Math.min(100, Math.round((storageUsed / MAX_STORAGE_BYTES) * 100));

  return (
    <div
      className="min-h-screen bg-paper text-ink pb-24 relative"
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.relatedTarget) setIsDragging(false);
      }}
      onDrop={handleDrop}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-8 space-y-6">
        {/* Workspace Masthead */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-rule gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] uppercase tracking-mono text-ink-soft bg-kraft border border-rule px-2 py-0.5 rounded font-semibold">
                Private Vault
              </span>
              <span className="font-mono text-[11px] text-ink-faint">
                Client-Isolated AES-256 Storage
              </span>
            </div>
            <h1 className="font-display text-2xl sm:text-3xl tracking-tight text-ink mt-1">
              Cloud Document Vault
            </h1>
            <p className="text-xs text-ink-soft mt-0.5">
              Encrypted persistence, forensic watermark ledger, and multi-file downloads.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => {
                if (e.target.files?.[0]) uploadSingleFile(e.target.files[0]);
              }}
              accept=".pdf,.docx,.png,.jpg,.jpeg"
              className="hidden"
            />

            <button
              onClick={loadData}
              disabled={loading}
              className="p-2 rounded border border-rule bg-vellum hover:bg-kraft text-ink-soft hover:text-ink transition-colors"
              title="Refresh ledger"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded bg-red text-vellum font-semibold text-xs tracking-tight hover:bg-red-dark transition-all duration-120 shadow-ink-button active:translate-y-px disabled:opacity-50"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Archiving...</span>
                </>
              ) : (
                <>
                  <UploadCloud className="w-3.5 h-3.5" strokeWidth={2} />
                  <span>Upload Document</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Notifications */}
        {message && (
          <div className="p-3 rounded border border-moss/40 bg-moss/10 text-xs text-ink flex items-center justify-between">
            <span className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-moss shrink-0" />
              <span>{message}</span>
            </span>
            <button onClick={() => setMessage('')} className="text-ink-soft hover:text-ink">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {errorMessage && (
          <div className="p-3 rounded border border-red/40 bg-red/10 text-xs text-ink flex items-center justify-between">
            <span className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red shrink-0" />
              <span>{errorMessage}</span>
            </span>
            <button onClick={() => setErrorMessage('')} className="text-ink-soft hover:text-ink">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Drag Over Overlay Alert */}
        {isDragging && (
          <div className="p-4 rounded border-2 border-dashed border-red bg-kraft/80 text-center font-display text-sm text-ink animate-pulse">
            Release folio to archive directly into your Cloud Vault
          </div>
        )}

        {/* Overview Telemetry Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* 1. Account Identity */}
          <div className="p-4 rounded border border-rule bg-vellum space-y-1">
            <div className="flex items-center justify-between text-ink-faint text-xs font-mono">
              <span>MEMBER IDENTITY</span>
              <Lock className="w-3 h-3 text-ink-soft" />
            </div>
            <div className="text-sm font-semibold text-ink truncate font-mono" title={user?.email}>
              {user?.email || 'Authenticated Member'}
            </div>
            <div className="text-[11px] font-mono text-moss flex items-center gap-1.5 pt-1">
              <span className="w-1.5 h-1.5 rounded-full bg-moss"></span>
              <span>Encrypted Member Session</span>
            </div>
          </div>

          {/* 2. Storage Quota */}
          <div className="p-4 rounded border border-rule bg-vellum space-y-1">
            <div className="flex items-center justify-between text-ink-faint text-xs font-mono">
              <span>STORAGE UTILIZATION</span>
              <HardDrive className="w-3 h-3 text-ink-soft" />
            </div>
            <div className="text-sm font-semibold text-ink font-mono tabular-nums">
              {(storageUsed / (1024 * 1024)).toFixed(1)} MB{' '}
              <span className="text-xs font-normal text-ink-soft">/ 500 MB</span>
            </div>
            <div className="pt-1.5">
              <div className="w-full h-1.5 rounded bg-kraft overflow-hidden">
                <div
                  className="bg-ink h-full transition-all duration-300"
                  style={{ width: `${Math.max(2, storagePercentage)}%` }}
                />
              </div>
            </div>
          </div>

          {/* 3. Document Count */}
          <div className="p-4 rounded border border-rule bg-vellum space-y-1">
            <div className="flex items-center justify-between text-ink-faint text-xs font-mono">
              <span>SAVED ARCHIVES</span>
              <FileText className="w-3 h-3 text-ink-soft" />
            </div>
            <div className="text-sm font-semibold text-ink font-mono tabular-nums">
              {files.length} {files.length === 1 ? 'document' : 'documents'}
            </div>
            <div className="text-[11px] font-mono text-ink-soft pt-1">
              {canaryTokens.length} active canary tokens
            </div>
          </div>
        </div>

        {/* Section Tabs */}
        <div className="flex items-center justify-between border-b border-rule pb-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('vault')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded font-mono text-xs uppercase tracking-mono transition-colors border ${
                activeTab === 'vault'
                  ? 'bg-ink text-paper border-ink font-semibold'
                  : 'bg-vellum text-ink-soft border-rule hover:text-ink'
              }`}
            >
              <FolderLock className="w-3.5 h-3.5" />
              <span>Saved Documents ({files.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('canary')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded font-mono text-xs uppercase tracking-mono transition-colors border ${
                activeTab === 'canary'
                  ? 'bg-ink text-paper border-ink font-semibold'
                  : 'bg-vellum text-ink-soft border-rule hover:text-ink'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Canary Tokens ({canaryTokens.length})</span>
            </button>
          </div>

          {/* Search bar for active tab */}
          {activeTab === 'vault' && files.length > 0 && (
            <div className="relative w-48 sm:w-64 hidden sm:block">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter saved files..."
                className="w-full pl-8 pr-3 py-1 rounded border border-rule bg-vellum text-xs text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-cyan"
              />
            </div>
          )}
        </div>

        {/* TAB 1: SAVED DOCUMENTS (Library View) */}
        {activeTab === 'vault' ? (
          <div className="space-y-4">
            {/* Multi-select Action Bar */}
            {selectedIds.size > 0 && (
              <div className="p-3 rounded border border-rule bg-kraft/70 flex items-center justify-between gap-4 text-xs font-mono">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-ink tabular-nums">
                    {selectedIds.size} {selectedIds.size === 1 ? 'file' : 'files'} selected
                  </span>
                  <button
                    onClick={() => setSelectedIds(new Set())}
                    className="text-ink-soft hover:text-ink underline text-[11px]"
                  >
                    Deselect
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleBulkDownload}
                    className="px-2.5 py-1 rounded border border-rule bg-vellum hover:bg-paper text-ink font-semibold flex items-center gap-1"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download All</span>
                  </button>
                  <button
                    onClick={handleBulkDelete}
                    className="px-2.5 py-1 rounded border border-red/40 bg-red/10 text-red font-semibold hover:bg-red/20 flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Selected</span>
                  </button>
                </div>
              </div>
            )}

            {filteredFiles.length === 0 ? (
              /* Designed Empty State */
              <div className="p-12 text-center border-2 border-dashed border-rule rounded-md bg-vellum space-y-4">
                <div className="w-12 h-12 rounded border border-rule bg-paper mx-auto flex items-center justify-center text-ink-soft">
                  <FolderLock className="w-6 h-6" strokeWidth={1.5} />
                </div>
                <div className="max-w-md mx-auto space-y-1">
                  <h3 className="font-display text-lg text-ink">
                    Your Vault is currently empty
                  </h3>
                  <p className="text-xs text-ink-soft leading-relaxed">
                    Documents processed on bench tools or uploaded directly while signed in will be permanently preserved here with AES-256 client isolation.
                  </p>
                </div>
                <div className="flex items-center justify-center gap-3 pt-2">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded bg-red text-vellum text-xs font-semibold hover:bg-red-dark transition-colors shadow-ink-button"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Upload First Folio</span>
                  </button>
                  <Link
                    to="/tools/merge"
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded border border-rule bg-paper hover:bg-kraft text-xs text-ink font-mono transition-colors"
                  >
                    <Layers className="w-3.5 h-3.5 text-ink-soft" />
                    <span>Bind (Merge)</span>
                  </Link>
                </div>
              </div>
            ) : (
              /* Library Cards View */
              <div className="space-y-2">
                {/* Header row with Select All */}
                <div className="px-4 py-2 flex items-center justify-between text-[11px] font-mono text-ink-faint border-b border-rule">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={toggleSelectAll}
                      className="p-1 hover:text-ink text-ink-soft focus:outline-none"
                      title="Toggle select all"
                    >
                      {selectedIds.size === filteredFiles.length ? (
                        <CheckSquare className="w-3.5 h-3.5 text-red" />
                      ) : (
                        <Square className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <span>DOCUMENT / REFINED ACTION</span>
                  </div>
                  <div className="flex items-center gap-8">
                    <span>SIZE</span>
                    <span className="hidden sm:inline-block">DATE ARCHIVED</span>
                    <span>ACTIONS</span>
                  </div>
                </div>

                {/* Library File Rows */}
                {filteredFiles.map((file) => {
                  const actionMeta = ACTION_LABELS[file.action_type] || {
                    label: file.action_type || 'Preserved',
                    verb: 'folio',
                  };
                  const isSelected = selectedIds.has(file.id);

                  return (
                    <div
                      key={file.id}
                      className={`flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded border transition-colors gap-3 ${
                        isSelected
                          ? 'border-rule-strong bg-kraft/60 shadow-subtle'
                          : 'border-rule bg-vellum hover:bg-kraft/30 active:bg-kraft/50'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => toggleSelect(file.id)}
                          className="p-1 text-ink-soft hover:text-ink focus:outline-none min-w-[44px] min-h-[44px] flex items-center justify-center shrink-0 touch-target"
                          title={isSelected ? 'Deselect folio' : 'Select folio'}
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-red" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>

                        {/* Page 1 Thumbnail or File Icon - Tap to Preview */}
                        <button
                          type="button"
                          onClick={() => setPreviewFile(file)}
                          className="w-10 h-14 rounded border border-rule bg-paper shadow-sm flex items-center justify-center shrink-0 overflow-hidden hover:border-ink transition-colors cursor-pointer group"
                          title="Click to preview folio"
                        >
                          {(file.action_type || '').toUpperCase().includes('IMAGE') ? (
                            <Archive className="w-4 h-4 text-cyan group-hover:scale-110 transition-transform" />
                          ) : (
                            <FileText className="w-4 h-4 text-ink-faint group-hover:text-ink transition-colors" />
                          )}
                        </button>

                        {/* Document Title & Action Metadata - Tap to Preview */}
                        <div
                          className="min-w-0 flex-1 pr-2 cursor-pointer select-none"
                          onClick={() => setPreviewFile(file)}
                        >
                          <p
                            className="text-xs sm:text-sm font-semibold text-ink truncate hover:text-cyan transition-colors"
                            title={`Click to preview ${file.original_filename}`}
                          >
                            {file.original_filename}
                          </p>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <span className="text-[10px] font-mono tracking-mono uppercase px-1.5 py-0.2 rounded bg-kraft border border-rule text-ink-soft">
                              {actionMeta.label}
                            </span>
                            <span className="text-[10px] font-mono text-cyan hover:underline hidden sm:inline-flex items-center gap-1">
                              <Eye className="w-3 h-3" />
                              <span>Preview</span>
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* File Metrics & Action Buttons */}
                      <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-6 shrink-0 pl-11 sm:pl-0 border-t sm:border-t-0 border-rule/50 pt-2 sm:pt-0">
                        <div className="flex items-center gap-3 font-mono text-xs text-ink-soft">
                          <span className="tabular-nums">
                            {formatBytes(file.output_file_size_bytes || file.file_size_bytes)}
                          </span>
                          <span className="text-[11px] text-ink-faint hidden sm:inline-block">
                            {new Date(file.created_at).toLocaleDateString()}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          {/* Preview Button */}
                          <button
                            type="button"
                            onClick={() => setPreviewFile(file)}
                            className="p-2 sm:p-1.5 rounded border border-rule bg-paper hover:bg-kraft active:bg-kraft/80 text-ink transition-colors min-w-[44px] min-h-[44px] sm:min-w-[34px] sm:min-h-[34px] flex items-center justify-center touch-target"
                            title="Preview Folio"
                          >
                            <Eye className="w-4 h-4" strokeWidth={1.5} />
                          </button>

                          {/* Download Button */}
                          {file.download_url && (
                            <a
                              href={file.download_url}
                              download={resolveDownloadFilename(file)}
                              className="p-2 sm:p-1.5 rounded border border-rule bg-paper hover:bg-kraft active:bg-kraft/80 text-ink transition-colors min-w-[44px] min-h-[44px] sm:min-w-[34px] sm:min-h-[34px] flex items-center justify-center touch-target"
                              title="Download Folio"
                            >
                              <Download className="w-4 h-4" strokeWidth={1.5} />
                            </a>
                          )}

                          {/* Delete Button */}
                          <button
                            type="button"
                            onClick={() => handleDeleteWithUndo(file)}
                            className="p-2 sm:p-1.5 rounded border border-rule hover:border-red/40 bg-paper hover:bg-red/10 active:bg-red/20 text-ink-soft hover:text-red transition-colors min-w-[44px] min-h-[44px] sm:min-w-[34px] sm:min-h-[34px] flex items-center justify-center touch-target"
                            title="Remove from Vault"
                          >
                            <Trash2 className="w-4 h-4" strokeWidth={1.5} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          /* TAB 2: FORENSIC CANARY TOKENS (Ledger View) */
          <div className="space-y-4">
            <div className="p-3.5 rounded border border-rule bg-kraft/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-moss" />
                <span className="font-mono text-ink leading-tight">
                  Canary tokens embed invisible cryptographic markers across document streams to trace recipient leaks.
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Link
                  to="/tools/canary"
                  className="px-3 py-1 rounded bg-red text-vellum font-semibold text-xs hover:bg-red-dark transition-colors shadow-ink-button"
                >
                  Embed New Marker
                </Link>
                <Link
                  to="/tools/verify-canary"
                  className="px-3 py-1 rounded border border-rule bg-paper hover:bg-kraft text-xs text-ink font-mono transition-colors"
                >
                  Audit Document
                </Link>
              </div>
            </div>

            {canaryTokens.length === 0 ? (
              <div className="p-12 text-center border-2 border-dashed border-rule rounded-md bg-vellum space-y-4">
                <div className="w-12 h-12 rounded border border-rule bg-paper mx-auto flex items-center justify-center text-moss">
                  <ShieldCheck className="w-6 h-6" strokeWidth={1.5} />
                </div>
                <div className="max-w-md mx-auto space-y-1">
                  <h3 className="font-display text-lg text-ink">
                    No Canary Tokens Issued Yet
                  </h3>
                  <p className="text-xs text-ink-soft leading-relaxed">
                    Embed invisible forensic markers in confidential folios before distributing them to external recipients to trace who leaks them.
                  </p>
                </div>
                <div className="pt-2">
                  <Link
                    to="/tools/canary"
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded bg-red text-vellum text-xs font-semibold hover:bg-red-dark transition-colors shadow-ink-button"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Generate Canary Watermark</span>
                  </Link>
                </div>
              </div>
            ) : (
              <div className="border border-rule rounded-md bg-vellum overflow-x-auto overscroll-x-contain">
                <table className="w-full text-left border-collapse text-xs font-mono">
                  <thead>
                    <tr className="border-b border-rule bg-paper/60 text-ink-faint text-[10px] uppercase tracking-mono">
                      <th className="py-2.5 px-4 font-medium">Token ID</th>
                      <th className="py-2.5 px-4 font-medium">Assigned Recipient</th>
                      <th className="py-2.5 px-4 font-medium">Tracking Note</th>
                      <th className="py-2.5 px-4 font-medium">Status</th>
                      <th className="py-2.5 px-4 font-medium">Date</th>
                      <th className="py-2.5 px-4 text-right font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-rule/50">
                    {canaryTokens.map((t) => (
                      <tr key={t.token_id} className="hover:bg-kraft/30 transition-colors">
                        <td className="py-3 px-4 text-ink font-semibold">
                          {t.token_id}
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-ink font-medium">
                            {t.recipient_name || 'Unassigned'}
                          </div>
                          {t.organization && (
                            <div className="text-[10px] text-ink-soft">
                              {t.organization}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-ink-soft text-[11px]">
                          {t.tracking_note || '—'}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                              t.status === 'ACTIVE'
                                ? 'bg-moss/10 text-moss border-moss/30'
                                : 'bg-kraft text-ink-soft border-rule'
                            }`}
                          >
                            {t.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-ink-faint text-[11px]">
                          {new Date(t.created_at).toLocaleDateString()}
                        </td>
                        <td className="py-3 px-4 text-right space-x-1.5">
                          {t.download_url && (
                            <a
                              href={t.download_url}
                              download={`canary_${t.token_id}.pdf`}
                              className="p-1.5 rounded border border-rule bg-paper hover:bg-kraft text-ink inline-block"
                              title="Download Protected Document"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </a>
                          )}
                          {t.status === 'ACTIVE' && (
                            <button
                              onClick={() => handleRevokeCanary(t.token_id)}
                              className="p-1.5 rounded border border-rule hover:border-red/40 bg-paper hover:bg-red/10 text-red inline-block"
                              title="Revoke Token"
                            >
                              <Ban className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* OPTIMISTIC DELETION UNDO TOAST (5-second countdown) */}
      {undoToast && (
        <div className="fixed bottom-6 right-6 z-50 p-4 rounded-md border border-rule-strong bg-vellum shadow-ink-drag flex items-center gap-4 animate-in fade-in slide-in-from-bottom duration-200">
          <div className="space-y-0.5">
            <p className="text-xs font-semibold text-ink">
              Archived folio deleted
            </p>
            <p className="text-[11px] font-mono text-ink-soft truncate max-w-[200px]">
              {undoToast.file.original_filename}
            </p>
          </div>

          <button
            onClick={handleUndoDelete}
            className="px-3 py-1.5 rounded bg-ink text-paper text-xs font-mono font-semibold hover:bg-red transition-colors flex items-center gap-1.5 shadow-sm"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Undo (5s)</span>
          </button>
        </div>
      )}

      {/* DOCUMENT INTERACTIVE PREVIEW MODAL */}
      {previewFile && (
        <DocumentPreviewModal
          file={previewFile}
          onClose={() => setPreviewFile(null)}
          onDelete={handleDeleteWithUndo}
        />
      )}
    </div>
  );
}
