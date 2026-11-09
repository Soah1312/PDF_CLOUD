import React, { useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Layers,
  FileText,
  Minimize2,
  Lock,
  RotateCw,
  Sparkles,
  Image as ImageIcon,
  FileCode,
  FileSpreadsheet,
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
  Fingerprint
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
  verifyCanaryDocument
} from '../services/api';

const TOOL_CONFIGS = {
  merge: {
    id: 'merge',
    title: 'Merge PDF Documents',
    description: 'Combine multiple PDF files into a single, cohesive document with custom page ordering.',
    icon: Layers,
    accept: '.pdf',
    multiple: true,
    actionBtn: 'Merge Documents',
    api: processMergePDF,
  },
  split: {
    id: 'split',
    title: 'Split & Extract Pages',
    description: 'Extract specific pages, divide into chapters, or split entire document into individual pages.',
    icon: FileText,
    accept: '.pdf',
    multiple: false,
    actionBtn: 'Split Document',
    api: processSplitPDF,
  },
  rotate: {
    id: 'rotate',
    title: 'Rotate PDF',
    description: 'Rotate PDF pages by 90°, 180°, or 270° clockwise with permanent stream preservation.',
    icon: RotateCw,
    accept: '.pdf',
    multiple: false,
    actionBtn: 'Rotate Document',
    api: processRotatePDF,
  },
  protect: {
    id: 'protect',
    title: 'Protect & Encrypt PDF',
    description: 'Encrypt your PDF with standard AES encryption and a secure user password.',
    icon: Lock,
    accept: '.pdf',
    multiple: false,
    actionBtn: 'Encrypt Document',
    api: processProtectPDF,
  },
  compress: {
    id: 'compress',
    title: 'Compress PDF',
    description: 'Optimize streams and downsample resolution to minimize file size while preserving legibility.',
    icon: Minimize2,
    accept: '.pdf',
    multiple: false,
    actionBtn: 'Compress Document',
    api: processCompressPDF,
  },
  watermark: {
    id: 'watermark',
    title: 'Watermark PDF',
    description: 'Stamp custom text watermarks with full control over opacity, angle, size, and placement.',
    icon: Sparkles,
    accept: '.pdf',
    multiple: false,
    actionBtn: 'Apply Watermark',
    api: processWatermarkPDF,
  },
  'to-images': {
    id: 'to-images',
    title: 'PDF to Images',
    description: 'Render PDF pages into high-resolution PNG or JPEG images bundled in a ZIP archive.',
    icon: ImageIcon,
    accept: '.pdf',
    multiple: false,
    actionBtn: 'Convert to Images',
    api: processPdfToImages,
  },
  'from-images': {
    id: 'from-images',
    title: 'Images to PDF',
    description: 'Combine multiple JPEG or PNG images into a single standardized PDF document.',
    icon: ImageIcon,
    accept: '.jpg,.jpeg,.png',
    multiple: true,
    actionBtn: 'Generate PDF',
    api: processImagesToPdf,
  },
  'to-word': {
    id: 'to-word',
    title: 'PDF to Word DOCX',
    description: 'Convert PDF documents into editable Microsoft Word documents preserving textual structure.',
    icon: FileCode,
    accept: '.pdf',
    multiple: false,
    actionBtn: 'Convert to Word',
    api: processPdfToWord,
  },
  'from-word': {
    id: 'from-word',
    title: 'Word to PDF',
    description: 'Convert DOCX documents into clean, standardized PDF files via serverless engine.',
    icon: FileSpreadsheet,
    accept: '.docx',
    multiple: false,
    actionBtn: 'Convert to PDF',
    api: processWordToPdf,
  },
  canary: {
    id: 'canary',
    title: 'Invisible Canary Watermark',
    description: 'Embed a cryptographically secure, resilient forensic watermark to trace and identify confidential document leaks.',
    icon: ShieldCheck,
    accept: '.pdf',
    multiple: false,
    actionBtn: 'Generate Canary Watermark',
    api: embedCanaryWatermark,
  },
  'verify-canary': {
    id: 'verify-canary',
    title: 'Forensic Document Verifier',
    description: 'Upload a suspected leaked PDF to scan for multi-layer invisible markers, verify cryptographic token integrity, and resolve attribution.',
    icon: ShieldAlert,
    accept: '.pdf',
    multiple: false,
    actionBtn: 'Scan & Verify Document',
    api: verifyCanaryDocument,
  },
};

export const ToolRunner = () => {
  const { toolId } = useParams();
  const { isAuthenticated } = useAuth();
  const config = TOOL_CONFIGS[toolId] || TOOL_CONFIGS.merge;
  const ToolIcon = config.icon;

  // File state
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  // Tool specific options
  const [rotateAngle, setRotateAngle] = useState(90);
  const [protectPassword, setProtectPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [compressLevel, setCompressLevel] = useState('medium');
  const [watermarkText, setWatermarkText] = useState('CONFIDENTIAL');
  const [watermarkOpacity, setWatermarkOpacity] = useState(0.3);
  const [watermarkRotation, setWatermarkRotation] = useState(45);
  const [watermarkColor, setWatermarkColor] = useState('#FF0000');
  const [splitRange, setSplitRange] = useState('');
  const [imageFormat, setImageFormat] = useState('png');
  const [imageDpi, setImageDpi] = useState(150);
  const [canaryRecipientName, setCanaryRecipientName] = useState('');
  const [canaryRecipientEmail, setCanaryRecipientEmail] = useState('');
  const [canaryOrganization, setCanaryOrganization] = useState('');
  const [canaryTrackingNote, setCanaryTrackingNote] = useState('');

  // Execution state
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [resultData, setResultData] = useState(null);

  const handleFiles = (newFiles) => {
    setErrorMessage('');
    const filesArray = Array.from(newFiles);
    if (!filesArray.length) return;

    if (config.multiple) {
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

  const handleExecute = async () => {
    if (!selectedFiles.length) {
      setErrorMessage('Please select at least one document to proceed.');
      return;
    }

    setIsProcessing(true);
    setErrorMessage('');
    setResultData(null);

    try {
      const formData = new FormData();

      if (config.multiple) {
        selectedFiles.forEach((file) => formData.append('files', file));
      } else {
        formData.append('file', selectedFiles[0]);
      }

      if (config.id === 'rotate') {
        formData.append('angle', rotateAngle);
      } else if (config.id === 'protect') {
        if (!protectPassword) {
          throw new Error('Please enter a password to encrypt this document.');
        }
        formData.append('password', protectPassword);
      } else if (config.id === 'compress') {
        formData.append('level', compressLevel);
      } else if (config.id === 'watermark') {
        formData.append('watermark_text', watermarkText);
        formData.append('opacity', watermarkOpacity);
        formData.append('rotation', watermarkRotation);
        formData.append('color', watermarkColor);
      } else if (config.id === 'split') {
        if (splitRange) {
          formData.append('page_ranges', splitRange);
        }
      } else if (config.id === 'to-images') {
        formData.append('format', imageFormat);
        formData.append('dpi', imageDpi);
      } else if (config.id === 'canary') {
        if (canaryRecipientName) formData.append('recipient_name', canaryRecipientName);
        if (canaryRecipientEmail) formData.append('recipient_email', canaryRecipientEmail);
        if (canaryOrganization) formData.append('organization', canaryOrganization);
        if (canaryTrackingNote) formData.append('tracking_note', canaryTrackingNote);
      }

      const res = await config.api(formData);
      setResultData(res);
    } catch (err) {
      console.error('Processing error:', err);
      const detail = err.response?.data?.detail || err.message || 'Operation failed. Please verify file format.';
      setErrorMessage(detail);
    } finally {
      setIsProcessing(false);
    }
  };

  const resetTool = () => {
    setSelectedFiles([]);
    setResultData(null);
    setErrorMessage('');
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Header */}
      <div className="pb-6 border-b border-white/5">
        <Link
          to="/"
          className="inline-flex items-center text-xs font-medium text-[#9E9E98] hover:text-[#E8E8E3] transition-colors mb-3 active:scale-[0.97]"
        >
          <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back to tools
        </Link>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center">
              <ToolIcon className="w-5 h-5 mr-2.5 text-[#E8E8E3] stroke-[1.75]" />
              {config.title}
            </h1>
            <p className="mt-1.5 text-xs text-[#9E9E98] leading-relaxed max-w-xl">
              {config.description}
            </p>
          </div>
        </div>
      </div>

      {/* Main Workspace Area */}
      {!resultData ? (
        <div className="mt-8 space-y-6">
          {/* Dropzone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-200 ${
              isDragging
                ? 'border-white/40 bg-white/10 scale-[1.01]'
                : 'border-white/10 bg-[#121214] hover:border-white/20 hover:bg-[#151518]'
            }`}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => handleFiles(e.target.files)}
              accept={config.accept}
              multiple={config.multiple}
              className="hidden"
            />
            <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-[#E8E8E3]">
              <UploadCloud className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-semibold text-white">
              Choose or drop {config.multiple ? 'files' : 'a file'} here
            </h3>
            <p className="mt-1 text-xs text-[#9E9E98]">
              Browse your device or drag documents directly into this area
            </p>
            <p className="mt-2 text-[11px] text-[#666662]">
              Accepts {config.accept.toUpperCase()} up to 100 MB
            </p>
          </div>

          {/* Selected File List */}
          {selectedFiles.length > 0 && (
            <div className="rounded-2xl border border-white/10 bg-[#121214] p-5 space-y-3">
              <div className="flex items-center justify-between text-xs text-[#9E9E98] pb-2 border-b border-white/5">
                <span className="font-semibold text-white">
                  Queued Files ({selectedFiles.length})
                </span>
                {config.multiple && (
                  <span className="text-[11px] text-[#666662]">
                    Use arrows to reorder
                  </span>
                )}
              </div>

              <div className="space-y-1.5">
                {selectedFiles.map((file, idx) => (
                  <div
                    key={`${file.name}-${idx}`}
                    className="flex items-center justify-between p-2.5 rounded-xl border border-white/5 bg-[#161619] text-xs"
                  >
                    <div className="flex items-center space-x-2.5 truncate">
                      <span className="text-[11px] font-mono text-[#666662] w-5 text-right shrink-0">
                        {idx + 1}.
                      </span>
                      <div className="truncate">
                        <p className="font-medium text-[#E8E8E3] truncate">{file.name}</p>
                        <p className="text-[11px] text-[#666662]">{(file.size / 1024).toFixed(1)} KB</p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-1 shrink-0 ml-3">
                      {config.multiple && (
                        <>
                          <button
                            onClick={(e) => { e.stopPropagation(); moveFile(idx, -1); }}
                            disabled={idx === 0}
                            className="p-1 rounded hover:bg-white/10 text-[#9E9E98] hover:text-white disabled:opacity-20 active:scale-[0.95]"
                            title="Move Up"
                          >
                            <MoveUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); moveFile(idx, 1); }}
                            disabled={idx === selectedFiles.length - 1}
                            className="p-1 rounded hover:bg-white/10 text-[#9E9E98] hover:text-white disabled:opacity-20 active:scale-[0.95]"
                            title="Move Down"
                          >
                            <MoveDown className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); removeFile(idx); }}
                        className="p-1 rounded hover:bg-rose-950/30 text-[#9E9E98] hover:text-rose-400 transition-colors active:scale-[0.95]"
                        title="Remove Document"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Options Panel */}
          {config.id === 'rotate' && (
            <div className="p-5 rounded-2xl border border-white/10 bg-[#121214]">
              <label className="block text-xs font-semibold text-[#E8E8E3] mb-2.5">
                Rotation Angle
              </label>
              <div className="grid grid-cols-3 gap-2.5 max-w-xs">
                {[90, 180, 270].map((deg) => (
                  <button
                    key={deg}
                    type="button"
                    onClick={() => setRotateAngle(deg)}
                    className={`py-2 px-3 rounded-xl text-xs font-medium border transition-all active:scale-[0.97] ${
                      rotateAngle === deg
                        ? 'bg-[#E8E8E3] border-white text-[#111113] font-semibold'
                        : 'bg-white/5 border-white/10 text-[#9E9E98] hover:text-white'
                    }`}
                  >
                    {deg}° Clockwise
                  </button>
                ))}
              </div>
            </div>
          )}

          {config.id === 'protect' && (
            <div className="p-5 rounded-2xl border border-white/10 bg-[#121214] max-w-md">
              <label className="block text-xs font-semibold text-[#E8E8E3] mb-2">
                Set Document Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={protectPassword}
                  onChange={(e) => setProtectPassword(e.target.value)}
                  placeholder="Enter a secure password..."
                  className="w-full pl-3 pr-10 py-2 bg-[#161619] border border-white/10 rounded-xl text-xs text-white placeholder-[#666662] focus:outline-none focus:border-white/30"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-[#9E9E98] hover:text-white"
                >
                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              <p className="mt-2 text-[11px] text-[#666662]">
                Protected with standard AES encryption. Your password is never stored.
              </p>
            </div>
          )}

          {config.id === 'compress' && (
            <div className="p-5 rounded-2xl border border-white/10 bg-[#121214]">
              <label className="block text-xs font-semibold text-[#E8E8E3] mb-2.5">
                Compression Level
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { id: 'low', label: 'Low', desc: 'Preserves maximum resolution' },
                  { id: 'medium', label: 'Balanced', desc: 'Recommended optimization' },
                  { id: 'high', label: 'High', desc: 'Smallest file size' },
                ].map((lvl) => (
                  <button
                    key={lvl.id}
                    type="button"
                    onClick={() => setCompressLevel(lvl.id)}
                    className={`p-3 text-left rounded-xl border transition-all active:scale-[0.98] ${
                      compressLevel === lvl.id
                        ? 'bg-white/10 border-white/30 text-white'
                        : 'bg-white/5 border-white/10 text-[#9E9E98] hover:text-white'
                    }`}
                  >
                    <p className="text-xs font-semibold">{lvl.label}</p>
                    <p className="text-[11px] text-[#666662] mt-0.5">{lvl.desc}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {config.id === 'watermark' && (
            <div className="p-5 rounded-2xl border border-white/10 bg-[#121214] space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#E8E8E3] mb-1.5">
                  Watermark Text
                </label>
                <input
                  type="text"
                  value={watermarkText}
                  onChange={(e) => setWatermarkText(e.target.value)}
                  className="w-full max-w-md px-3 py-2 bg-[#161619] border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-white/30"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-lg">
                <div>
                  <label className="block text-xs text-[#9E9E98] mb-1">
                    Opacity ({Math.round(watermarkOpacity * 100)}%)
                  </label>
                  <input
                    type="range"
                    min="0.1"
                    max="1.0"
                    step="0.05"
                    value={watermarkOpacity}
                    onChange={(e) => setWatermarkOpacity(parseFloat(e.target.value))}
                    className="w-full accent-[#E8E8E3]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#9E9E98] mb-1">
                    Angle ({watermarkRotation}°)
                  </label>
                  <input
                    type="range"
                    min="-90"
                    max="90"
                    step="15"
                    value={watermarkRotation}
                    onChange={(e) => setWatermarkRotation(parseInt(e.target.value))}
                    className="w-full accent-[#E8E8E3]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#9E9E98] mb-1">Color</label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="color"
                      value={watermarkColor}
                      onChange={(e) => setWatermarkColor(e.target.value)}
                      className="w-7 h-7 rounded bg-transparent cursor-pointer"
                    />
                    <span className="text-xs font-mono text-[#DCDCD6]">{watermarkColor}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {config.id === 'split' && (
            <div className="p-5 rounded-2xl border border-white/10 bg-[#121214] max-w-md">
              <label className="block text-xs font-semibold text-[#E8E8E3] mb-1.5">
                Page Range
              </label>
              <input
                type="text"
                value={splitRange}
                onChange={(e) => setSplitRange(e.target.value)}
                placeholder="e.g. 1-3, 5, 8-12 (Leave blank for all pages)"
                className="w-full px-3 py-2 bg-[#161619] border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-white/30"
              />
              <p className="mt-1.5 text-[11px] text-[#666662]">
                Leave empty to separate all pages into individual files in a ZIP archive.
              </p>
            </div>
          )}

          {config.id === 'to-images' && (
            <div className="p-5 rounded-2xl border border-white/10 bg-[#121214] flex flex-wrap gap-6">
              <div>
                <label className="block text-xs font-semibold text-[#E8E8E3] mb-2">Format</label>
                <div className="flex space-x-2">
                  {['png', 'jpeg'].map((fmt) => (
                    <button
                      key={fmt}
                      type="button"
                      onClick={() => setImageFormat(fmt)}
                      className={`px-3 py-1.5 rounded-xl text-xs uppercase border transition-all active:scale-[0.97] ${
                        imageFormat === fmt
                          ? 'bg-[#E8E8E3] border-white text-[#111113] font-semibold'
                          : 'bg-white/5 border-white/10 text-[#9E9E98] hover:text-white'
                      }`}
                    >
                      {fmt}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#E8E8E3] mb-2">Resolution</label>
                <div className="flex space-x-2">
                  {[100, 150, 300].map((dpi) => (
                    <button
                      key={dpi}
                      type="button"
                      onClick={() => setImageDpi(dpi)}
                      className={`px-3 py-1.5 rounded-xl text-xs border transition-all active:scale-[0.97] ${
                        imageDpi === dpi
                          ? 'bg-[#E8E8E3] border-white text-[#111113] font-semibold'
                          : 'bg-white/5 border-white/10 text-[#9E9E98] hover:text-white'
                      }`}
                    >
                      {dpi} DPI
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {config.id === 'canary' && (
            <div className="p-5 rounded-2xl border border-white/10 bg-[#121214] space-y-4">
              <div className="flex items-center space-x-2 pb-2 border-b border-white/5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-semibold text-white">Forensic Recipient Tracking (Optional)</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-[11px] text-[#9E9E98] mb-1">Recipient Name</label>
                  <input
                    type="text"
                    value={canaryRecipientName}
                    onChange={(e) => setCanaryRecipientName(e.target.value)}
                    placeholder="e.g. Jane Doe"
                    className="w-full px-3 py-2 bg-[#161619] border border-white/10 rounded-xl text-xs text-white placeholder-[#666662] focus:outline-none focus:border-white/30"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[#9E9E98] mb-1">Recipient Email</label>
                  <input
                    type="email"
                    value={canaryRecipientEmail}
                    onChange={(e) => setCanaryRecipientEmail(e.target.value)}
                    placeholder="e.g. jane@partner.com"
                    className="w-full px-3 py-2 bg-[#161619] border border-white/10 rounded-xl text-xs text-white placeholder-[#666662] focus:outline-none focus:border-white/30"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[#9E9E98] mb-1">Organization / Department</label>
                  <input
                    type="text"
                    value={canaryOrganization}
                    onChange={(e) => setCanaryOrganization(e.target.value)}
                    placeholder="e.g. External Legal Counsel"
                    className="w-full px-3 py-2 bg-[#161619] border border-white/10 rounded-xl text-xs text-white placeholder-[#666662] focus:outline-none focus:border-white/30"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[#9E9E98] mb-1">Tracking Note / Classification</label>
                  <input
                    type="text"
                    value={canaryTrackingNote}
                    onChange={(e) => setCanaryTrackingNote(e.target.value)}
                    placeholder="e.g. Confidential M&A Board Deck"
                    className="w-full px-3 py-2 bg-[#161619] border border-white/10 rounded-xl text-xs text-white placeholder-[#666662] focus:outline-none focus:border-white/30"
                  />
                </div>
              </div>
              <p className="text-[11px] text-[#9E9E98]">
                An invisible multi-layer forensic token will be embedded into content streams and catalog structures. Recipient details are encrypted and only accessible to you.
              </p>
            </div>
          )}

          {/* Error Banner */}
          {errorMessage && (
            <div className="p-3.5 rounded-2xl border border-rose-900/60 bg-rose-950/20 text-xs text-rose-300 flex items-start space-x-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
              <div>
                <p className="font-semibold">Unable to process document</p>
                <p className="mt-0.5 text-[#9E9E98]">{errorMessage}</p>
              </div>
            </div>
          )}

          {/* Action Row */}
          <div className="pt-2 flex items-center justify-between">
            <span className="text-xs text-[#666662]">
              {selectedFiles.length} {selectedFiles.length === 1 ? 'file selected' : 'files selected'}
            </span>

            <button
              onClick={handleExecute}
              disabled={isProcessing || selectedFiles.length === 0}
              className="px-5 py-2.5 rounded-full bg-[#E8E8E3] hover:bg-white disabled:opacity-30 text-[#111113] font-semibold text-xs tracking-tight flex items-center transition-all duration-150 active:scale-[0.97] shadow-sm"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  {config.actionBtn} <ArrowRight className="w-3.5 h-3.5 ml-1.5 stroke-[2.2]" />
                </>
              )}
            </button>
          </div>
        </div>
      ) : config.id === 'verify-canary' ? (
        /* Forensic Verification Result State */
        <div className="mt-8 rounded-2xl border border-white/10 bg-[#121214] p-8 text-center space-y-6">
          <div
            className={`w-12 h-12 mx-auto rounded-full flex items-center justify-center border ${
              resultData.status === 'VERIFIED'
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                : resultData.status === 'REVOKED'
                ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                : resultData.status === 'NOT_FOUND'
                ? 'bg-zinc-500/10 border-zinc-500/20 text-zinc-400'
                : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
            }`}
          >
            {resultData.status === 'VERIFIED' ? (
              <ShieldCheck className="w-6 h-6 stroke-[2]" />
            ) : resultData.status === 'REVOKED' ? (
              <AlertCircle className="w-6 h-6 stroke-[2]" />
            ) : resultData.status === 'NOT_FOUND' ? (
              <Fingerprint className="w-6 h-6 stroke-[2]" />
            ) : (
              <AlertCircle className="w-6 h-6 stroke-[2]" />
            )}
          </div>

          <div>
            <h2 className="text-xl font-bold tracking-tight text-white">
              {resultData.status === 'VERIFIED'
                ? 'Authentic Canary Token Verified'
                : resultData.status === 'REVOKED'
                ? 'Canary Token Has Been Revoked'
                : resultData.status === 'NOT_FOUND'
                ? 'No Forensic Markers Detected'
                : resultData.status === 'INVALID_OR_CORRUPTED'
                ? 'Corrupted Canary Marker'
                : 'Verification Inconclusive'}
            </h2>
            <p className="mt-1 text-xs text-[#9E9E98] max-w-md mx-auto">
              {resultData.message}
            </p>
          </div>

          <div className="max-w-md mx-auto p-4 rounded-xl border border-white/5 bg-[#161619] text-xs text-left space-y-2.5">
            <div className="flex justify-between items-center">
              <span className="text-[#9E9E98]">Registry Status</span>
              <span
                className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                  resultData.status === 'VERIFIED'
                    ? 'bg-emerald-950/40 text-emerald-400 border-emerald-800/40'
                    : resultData.status === 'REVOKED'
                    ? 'bg-amber-950/40 text-amber-400 border-amber-800/40'
                    : 'bg-white/5 text-[#E8E8E3] border-white/10'
                }`}
              >
                {resultData.status}
              </span>
            </div>

            {(resultData.token_id || resultData.token_masked) && (
              <div className="flex justify-between items-center border-t border-white/5 pt-2">
                <span className="text-[#9E9E98]">Token Identifier</span>
                <span className="font-mono text-[#E8E8E3] text-[11px] truncate max-w-[220px]">
                  {resultData.token_id || resultData.token_masked}
                </span>
              </div>
            )}

            {resultData.organization && (
              <div className="flex justify-between items-center border-t border-white/5 pt-2">
                <span className="text-[#9E9E98]">Organization</span>
                <span className="text-white font-medium">{resultData.organization}</span>
              </div>
            )}

            {resultData.recipient_name && (
              <div className="flex justify-between items-center border-t border-white/5 pt-2">
                <span className="text-[#9E9E98]">Assigned Recipient</span>
                <span className="text-white font-medium">
                  {resultData.recipient_name}
                  {resultData.recipient_email ? ` (${resultData.recipient_email})` : ''}
                </span>
              </div>
            )}

            {resultData.creator_email && (
              <div className="flex justify-between items-center border-t border-white/5 pt-2">
                <span className="text-[#9E9E98]">Originating Issuer</span>
                <span className="text-white font-mono text-[11px]">{resultData.creator_email}</span>
              </div>
            )}

            {resultData.tracking_note && (
              <div className="flex justify-between items-center border-t border-white/5 pt-2">
                <span className="text-[#9E9E98]">Tracking Note</span>
                <span className="text-[#E8E8E3] italic">{resultData.tracking_note}</span>
              </div>
            )}

            {resultData.markers_detected && resultData.markers_detected.length > 0 && (
              <div className="border-t border-white/5 pt-2">
                <span className="text-[#9E9E98] block mb-1">Detected Markers</span>
                <div className="flex flex-wrap gap-1.5">
                  {resultData.markers_detected.map((m) => (
                    <span
                      key={m}
                      className="px-2 py-0.5 rounded-md bg-white/5 text-[10px] text-[#DCDCD6] font-mono border border-white/5"
                    >
                      {m}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {resultData.file_sha256 && (
              <div className="border-t border-white/5 pt-2">
                <span className="text-[#9E9E98] block mb-0.5">Uploaded File SHA-256</span>
                <span className="font-mono text-[10px] text-[#666662] break-all">
                  {resultData.file_sha256}
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              onClick={resetTool}
              className="px-5 py-2.5 rounded-full bg-[#E8E8E3] hover:bg-white text-[#111113] font-semibold text-xs tracking-tight flex items-center transition-all duration-150 active:scale-[0.97] shadow-sm"
            >
              <RefreshCw className="w-3.5 h-3.5 mr-2" /> Verify Another Document
            </button>
          </div>
        </div>
      ) : config.id === 'canary' ? (
        /* Canary Generation Result State */
        <div className="mt-8 rounded-2xl border border-white/10 bg-[#121214] p-8 text-center space-y-6">
          <div className="w-12 h-12 mx-auto rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <ShieldCheck className="w-6 h-6 stroke-[2]" />
          </div>

          <div>
            <h2 className="text-xl font-bold tracking-tight text-white">Canary Watermark Embedded</h2>
            <p className="mt-1 text-xs text-[#9E9E98]">
              Your document has been forensically marked across content streams and catalog structures.
            </p>
          </div>

          <div className="max-w-md mx-auto p-4 rounded-xl border border-white/5 bg-[#161619] text-xs text-left space-y-2.5">
            <div className="flex justify-between items-center">
              <span className="text-[#9E9E98]">Canary Token ID</span>
              <span className="text-emerald-400 font-mono text-[11px] font-semibold">
                {resultData.token_id}
              </span>
            </div>

            {resultData.recipient_name && (
              <div className="flex justify-between border-t border-white/5 pt-2">
                <span className="text-[#9E9E98]">Recipient</span>
                <span className="text-white font-medium">{resultData.recipient_name}</span>
              </div>
            )}

            {resultData.organization && (
              <div className="flex justify-between border-t border-white/5 pt-2">
                <span className="text-[#9E9E98]">Organization</span>
                <span className="text-white">{resultData.organization}</span>
              </div>
            )}

            <div className="border-t border-white/5 pt-2">
              <span className="text-[#9E9E98] block mb-0.5">Watermarked SHA-256</span>
              <span className="font-mono text-[10px] text-[#666662] break-all">
                {resultData.watermarked_sha256}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <a
              href={resultData.download_url}
              download="canary_protected.pdf"
              className="px-5 py-2.5 rounded-full bg-[#E8E8E3] hover:bg-white text-[#111113] font-semibold text-xs tracking-tight flex items-center transition-all duration-150 active:scale-[0.97] shadow-sm"
            >
              <Download className="w-3.5 h-3.5 mr-2 stroke-[2.2]" /> Download Protected PDF
            </a>

            <button
              onClick={resetTool}
              className="px-4 py-2.5 rounded-full bg-white/5 hover:bg-white/10 text-[#E8E8E3] font-medium text-xs border border-white/10 flex items-center transition-all duration-150 active:scale-[0.97]"
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Protect Another
            </button>

            {isAuthenticated && (
              <Link
                to="/workspace"
                className="px-4 py-2.5 rounded-full bg-white/5 hover:bg-white/10 text-[#E8E8E3] font-medium text-xs border border-white/10 flex items-center transition-all duration-150 active:scale-[0.97]"
              >
                <FolderLock className="w-3.5 h-3.5 mr-1.5" /> View Tokens in Vault
              </Link>
            )}
          </div>
        </div>
      ) : (
        /* Standard Result State */
        <div className="mt-8 rounded-2xl border border-white/10 bg-[#121214] p-8 text-center space-y-6">
          <div className="w-12 h-12 mx-auto rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <CheckCircle2 className="w-6 h-6 stroke-[2]" />
          </div>

          <div>
            <h2 className="text-xl font-bold tracking-tight text-white">Your document is ready</h2>
            <p className="mt-1 text-xs text-[#9E9E98]">
              Successfully processed and available for immediate download.
            </p>
          </div>

          <div className="max-w-md mx-auto p-4 rounded-xl border border-white/5 bg-[#161619] text-xs text-left space-y-2">
            <div className="flex justify-between">
              <span className="text-[#9E9E98]">File Name</span>
              <span className="text-white truncate max-w-[220px]" title={resultData.output_filename}>
                {resultData.output_filename}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#9E9E98]">File Size</span>
              <span className="text-emerald-400 font-mono">
                {(resultData.output_file_size_bytes / 1024).toFixed(1)} KB
              </span>
            </div>
            {resultData.stats?.compression_ratio_pct !== undefined && (
              <div className="flex justify-between border-t border-white/5 pt-2">
                <span className="text-[#9E9E98]">Space Saved</span>
                <span className="text-[#E8E8E3] font-mono">
                  {resultData.stats.compression_ratio_pct}%
                </span>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <a
              href={resultData.download_url}
              download={resultData.output_filename}
              className="px-5 py-2.5 rounded-full bg-[#E8E8E3] hover:bg-white text-[#111113] font-semibold text-xs tracking-tight flex items-center transition-all duration-150 active:scale-[0.97] shadow-sm"
            >
              <Download className="w-3.5 h-3.5 mr-2 stroke-[2.2]" /> Download File
            </a>

            <button
              onClick={resetTool}
              className="px-4 py-2.5 rounded-full bg-white/5 hover:bg-white/10 text-[#E8E8E3] font-medium text-xs border border-white/10 flex items-center transition-all duration-150 active:scale-[0.97]"
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Process Another
            </button>

            {isAuthenticated && (
              <Link
                to="/workspace"
                className="px-4 py-2.5 rounded-full bg-white/5 hover:bg-white/10 text-[#E8E8E3] font-medium text-xs border border-white/10 flex items-center transition-all duration-150 active:scale-[0.97]"
              >
                <FolderLock className="w-3.5 h-3.5 mr-1.5" /> View in Vault
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ToolRunner;
