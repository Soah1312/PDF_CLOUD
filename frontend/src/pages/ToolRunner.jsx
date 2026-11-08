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
  FolderLock
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
  processWordToPdf
} from '../services/api';

const TOOL_CONFIGS = {
  merge: {
    id: 'merge',
    title: 'Merge PDF Documents',
    description: 'Combine multiple PDF files into a single, cohesive document with custom page ordering.',
    icon: Layers,
    accept: '.pdf',
    multiple: true,
    actionBtn: 'Merge PDFs',
    api: processMergePDF,
  },
  split: {
    id: 'split',
    title: 'Split & Extract Pages',
    description: 'Extract specific pages, divide into chapters, or split entire document into individual pages.',
    icon: FileText,
    accept: '.pdf',
    multiple: false,
    actionBtn: 'Split PDF',
    api: processSplitPDF,
  },
  rotate: {
    id: 'rotate',
    title: 'Rotate PDF',
    description: 'Rotate PDF pages by 90°, 180°, or 270° clockwise with permanent stream preservation.',
    icon: RotateCw,
    accept: '.pdf',
    multiple: false,
    actionBtn: 'Rotate PDF',
    api: processRotatePDF,
  },
  protect: {
    id: 'protect',
    title: 'Protect & Encrypt PDF',
    description: 'Encrypt your PDF with standard AES encryption and a secure user password.',
    icon: Lock,
    accept: '.pdf',
    multiple: false,
    actionBtn: 'Protect PDF',
    api: processProtectPDF,
  },
  compress: {
    id: 'compress',
    title: 'PDF Compression Engine',
    description: 'Optimize streams and downsample resolution to minimize file size while preserving legibility.',
    icon: Minimize2,
    accept: '.pdf',
    multiple: false,
    actionBtn: 'Compress PDF',
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
};

export const ToolRunner = () => {
  const { toolId } = useParams();
  const { isAuthenticated, user } = useAuth();
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

  const removeFile = (idx) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const moveFile = (idx, direction) => {
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= selectedFiles.length) return;
    const updated = [...selectedFiles];
    const temp = updated[idx];
    updated[idx] = updated[targetIdx];
    updated[targetIdx] = temp;
    setSelectedFiles(updated);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleExecute = async () => {
    if (!selectedFiles.length) {
      setErrorMessage('Please select or upload at least one file.');
      return;
    }

    if (config.id === 'merge' && selectedFiles.length < 2) {
      setErrorMessage('Please select at least two PDF documents to merge.');
      return;
    }

    if (config.id === 'protect' && !protectPassword.trim()) {
      setErrorMessage('Please enter an encryption password.');
      return;
    }

    if (config.id === 'watermark' && !watermarkText.trim()) {
      setErrorMessage('Please enter watermark text.');
      return;
    }

    setIsProcessing(true);
    setErrorMessage('');

    try {
      const formData = new FormData();

      if (config.multiple) {
        selectedFiles.forEach((f) => formData.append('files', f));
        const orderList = selectedFiles.map((f) => f.name);
        formData.append('file_order', JSON.stringify(orderList));
      } else {
        formData.append('file', selectedFiles[0]);
      }

      // Append tool parameters
      if (config.id === 'rotate') {
        formData.append('angle', rotateAngle);
      } else if (config.id === 'protect') {
        formData.append('password', protectPassword);
      } else if (config.id === 'compress') {
        formData.append('level', compressLevel);
      } else if (config.id === 'watermark') {
        formData.append('text', watermarkText);
        formData.append('opacity', watermarkOpacity);
        formData.append('rotation', watermarkRotation);
        formData.append('color', watermarkColor);
      } else if (config.id === 'split') {
        if (splitRange.trim()) {
          formData.append('page_ranges', splitRange.trim());
        }
      } else if (config.id === 'to-images') {
        formData.append('img_format', imageFormat);
        formData.append('dpi', imageDpi);
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
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-slate-800 gap-4">
        <div>
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold mb-2">
            <ToolIcon className="w-3.5 h-3.5" />
            <span>PDF Studio Engine</span>
          </div>
          <h1 className="text-3xl font-bold text-white flex items-center">
            {config.title}
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            {config.description}
          </p>
        </div>

        <div className="flex items-center space-x-2 text-xs">
          {isAuthenticated ? (
            <span className="px-3 py-1.5 rounded-lg bg-indigo-950/60 border border-indigo-500/30 text-indigo-300 font-medium">
              Member S3 Vault
            </span>
          ) : (
            <span className="px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 font-medium">
              Guest Mode (24h Retention)
            </span>
          )}
        </div>
      </div>

      {/* Main Workspace Area */}
      {!resultData ? (
        <div className="mt-8 space-y-6">
          {/* Upload Area */}
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-200 ${
              isDragging
                ? 'border-indigo-500 bg-indigo-500/10 scale-[1.01]'
                : 'border-slate-800 bg-slate-900/40 hover:border-slate-700 hover:bg-slate-900/70'
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
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <UploadCloud className="w-8 h-8" />
            </div>
            <h3 className="text-base font-semibold text-white">
              Drag & Drop your {config.multiple ? 'files' : 'file'} here
            </h3>
            <p className="mt-1 text-xs text-slate-400">
              or <span className="text-indigo-400 font-semibold underline">browse local storage</span> to select
            </p>
            <p className="mt-3 text-[11px] text-slate-500">
              Supported format: <code className="bg-slate-800 px-1 py-0.5 rounded text-slate-300">{config.accept}</code>
            </p>
          </div>

          {/* Selected File List */}
          {selectedFiles.length > 0 && (
            <div className="rounded-2xl glass-panel border border-slate-800 bg-slate-900/60 p-6 space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-400 pb-2 border-b border-slate-800">
                <span className="font-semibold text-white">
                  Selected Documents ({selectedFiles.length})
                </span>
                {config.multiple && (
                  <span>Use arrows to reorder merge priority</span>
                )}
              </div>

              <div className="space-y-2">
                {selectedFiles.map((file, idx) => (
                  <div
                    key={`${file.name}-${idx}`}
                    className="flex items-center justify-between p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-xs"
                  >
                    <div className="flex items-center space-x-3 truncate">
                      <span className="w-6 h-6 rounded-lg bg-indigo-600/20 text-indigo-400 flex items-center justify-center font-bold text-[10px] shrink-0">
                        {idx + 1}
                      </span>
                      <div className="truncate">
                        <p className="font-medium text-slate-200 truncate">{file.name}</p>
                        <p className="text-[11px] text-slate-500">{(file.size / 1024).toFixed(1)} KB</p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-1 shrink-0 ml-3">
                      {config.multiple && (
                        <>
                          <button
                            onClick={(e) => { e.stopPropagation(); moveFile(idx, -1); }}
                            disabled={idx === 0}
                            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-30"
                            title="Move Up"
                          >
                            <MoveUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); moveFile(idx, 1); }}
                            disabled={idx === selectedFiles.length - 1}
                            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-30"
                            title="Move Down"
                          >
                            <MoveDown className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); removeFile(idx); }}
                        className="p-1.5 rounded-lg hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors"
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

          {/* Tool-Specific Options Panel */}
          {config.id === 'rotate' && (
            <div className="p-6 rounded-2xl glass-panel border border-slate-800 bg-slate-900/60">
              <label className="block text-xs font-semibold text-slate-300 mb-3">Rotation Angle</label>
              <div className="grid grid-cols-3 gap-3 max-w-sm">
                {[90, 180, 270].map((deg) => (
                  <button
                    key={deg}
                    type="button"
                    onClick={() => setRotateAngle(deg)}
                    className={`py-2 px-3 rounded-lg text-xs font-semibold border transition-all ${
                      rotateAngle === deg
                        ? 'bg-indigo-600 border-indigo-500 text-white shadow-md'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {deg}° Clockwise
                  </button>
                ))}
              </div>
            </div>
          )}

          {config.id === 'protect' && (
            <div className="p-6 rounded-2xl glass-panel border border-slate-800 bg-slate-900/60 max-w-md">
              <label className="block text-xs font-semibold text-slate-300 mb-2">Set Encryption Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={protectPassword}
                  onChange={(e) => setProtectPassword(e.target.value)}
                  placeholder="Enter strong password..."
                  className="w-full pl-3 pr-10 py-2.5 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-500 hover:text-slate-300"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                AES-256 standard encryption. Your password is never logged or exposed.
              </p>
            </div>
          )}

          {config.id === 'compress' && (
            <div className="p-6 rounded-2xl glass-panel border border-slate-800 bg-slate-900/60">
              <label className="block text-xs font-semibold text-slate-300 mb-3">Compression Level</label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { id: 'low', label: 'Low Compression', desc: 'Preserves max quality' },
                  { id: 'medium', label: 'Balanced (Recommended)', desc: 'Standard optimization' },
                  { id: 'high', label: 'High Compression', desc: 'Aggressive image downsampling' },
                ].map((lvl) => (
                  <button
                    key={lvl.id}
                    type="button"
                    onClick={() => setCompressLevel(lvl.id)}
                    className={`p-3 text-left rounded-xl border transition-all ${
                      compressLevel === lvl.id
                        ? 'bg-indigo-600/20 border-indigo-500 text-white'
                        : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <p className="text-xs font-semibold">{lvl.label}</p>
                    <p className="text-[11px] text-slate-500 mt-1">{lvl.desc}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {config.id === 'watermark' && (
            <div className="p-6 rounded-2xl glass-panel border border-slate-800 bg-slate-900/60 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Watermark Text</label>
                <input
                  type="text"
                  value={watermarkText}
                  onChange={(e) => setWatermarkText(e.target.value)}
                  className="w-full max-w-md px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-lg">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Opacity ({Math.round(watermarkOpacity * 100)}%)
                  </label>
                  <input
                    type="range"
                    min="0.1"
                    max="1.0"
                    step="0.05"
                    value={watermarkOpacity}
                    onChange={(e) => setWatermarkOpacity(parseFloat(e.target.value))}
                    className="w-full accent-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Rotation ({watermarkRotation}°)
                  </label>
                  <input
                    type="range"
                    min="-90"
                    max="90"
                    step="15"
                    value={watermarkRotation}
                    onChange={(e) => setWatermarkRotation(parseInt(e.target.value))}
                    className="w-full accent-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Color</label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="color"
                      value={watermarkColor}
                      onChange={(e) => setWatermarkColor(e.target.value)}
                      className="w-8 h-8 rounded bg-transparent cursor-pointer"
                    />
                    <span className="text-xs font-mono text-slate-300">{watermarkColor}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {config.id === 'split' && (
            <div className="p-6 rounded-2xl glass-panel border border-slate-800 bg-slate-900/60 max-w-md">
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Page Ranges (Optional)</label>
              <input
                type="text"
                value={splitRange}
                onChange={(e) => setSplitRange(e.target.value)}
                placeholder="e.g. 1-3, 5, 7-10 (Leave blank to split all pages)"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500"
              />
              <p className="mt-1.5 text-[11px] text-slate-500">
                Leave empty to separate all pages into a downloadable ZIP archive.
              </p>
            </div>
          )}

          {config.id === 'to-images' && (
            <div className="p-6 rounded-2xl glass-panel border border-slate-800 bg-slate-900/60 flex flex-wrap gap-6">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">Image Format</label>
                <div className="flex space-x-2">
                  {['png', 'jpeg'].map((fmt) => (
                    <button
                      key={fmt}
                      type="button"
                      onClick={() => setImageFormat(fmt)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold uppercase border ${
                        imageFormat === fmt
                          ? 'bg-indigo-600 border-indigo-500 text-white'
                          : 'bg-slate-950 border-slate-800 text-slate-400'
                      }`}
                    >
                      {fmt}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">Resolution (DPI)</label>
                <div className="flex space-x-2">
                  {[100, 150, 300].map((dpi) => (
                    <button
                      key={dpi}
                      type="button"
                      onClick={() => setImageDpi(dpi)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                        imageDpi === dpi
                          ? 'bg-indigo-600 border-indigo-500 text-white'
                          : 'bg-slate-950 border-slate-800 text-slate-400'
                      }`}
                    >
                      {dpi} DPI
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Error Banner */}
          {errorMessage && (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300 flex items-start space-x-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Processing Failed</p>
                <p className="mt-0.5">{errorMessage}</p>
              </div>
            </div>
          )}

          {/* Action Button */}
          <div className="pt-4 flex items-center justify-between">
            <Link
              to="/"
              className="text-xs font-medium text-slate-400 hover:text-white transition-colors"
            >
              &larr; Back to all tools
            </Link>

            <button
              onClick={handleExecute}
              disabled={isProcessing || selectedFiles.length === 0}
              className="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-sm shadow-lg shadow-indigo-600/30 flex items-center transition-all"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processing in Cloud Engine...
                </>
              ) : (
                <>
                  {config.actionBtn} <ArrowRight className="w-4 h-4 ml-2" />
                </>
              )}
            </button>
          </div>
        </div>
      ) : (
        /* Result & Download State */
        <div className="mt-8 rounded-2xl glass-panel border border-slate-800 bg-slate-900/60 p-8 text-center space-y-6">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <CheckCircle2 className="w-8 h-8" />
          </div>

          <div>
            <h2 className="text-xl font-bold text-white">Document Processed Successfully!</h2>
            <p className="mt-1 text-xs text-slate-400">
              Stored securely in Amazon S3 and recorded in PostgreSQL RDS.
            </p>
          </div>

          <div className="max-w-md mx-auto p-4 rounded-xl bg-slate-950/80 border border-slate-800 text-xs text-left space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-400">Output File:</span>
              <span className="font-mono text-white truncate max-w-[200px]" title={resultData.output_filename}>
                {resultData.output_filename}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Processed Size:</span>
              <span className="font-mono text-emerald-400 font-semibold">
                {(resultData.output_file_size_bytes / 1024).toFixed(1)} KB
              </span>
            </div>
            {resultData.stats?.compression_ratio_pct !== undefined && (
              <div className="flex justify-between border-t border-slate-800 pt-2">
                <span className="text-slate-400">Compression Efficiency:</span>
                <span className="font-mono text-indigo-400 font-semibold">
                  {resultData.stats.compression_ratio_pct}% saved
                </span>
              </div>
            )}
            {resultData.expires_at && (
              <div className="flex justify-between border-t border-slate-800 pt-2">
                <span className="text-amber-400">Retention Policy:</span>
                <span className="text-amber-300 font-mono">Expires in 24 hours</span>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
            <a
              href={resultData.download_url}
              download={resultData.output_filename}
              className="px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm shadow-lg shadow-emerald-600/30 flex items-center transition-all"
            >
              <Download className="w-4 h-4 mr-2" /> Download Document
            </a>

            <button
              onClick={resetTool}
              className="px-5 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-sm border border-slate-700 flex items-center transition-all"
            >
              <RefreshCw className="w-4 h-4 mr-2" /> Process Another
            </button>

            {isAuthenticated && (
              <Link
                to="/workspace"
                className="px-5 py-3 rounded-xl bg-indigo-950/60 hover:bg-indigo-900/60 border border-indigo-500/30 text-indigo-300 font-semibold text-sm flex items-center transition-all"
              >
                <FolderLock className="w-4 h-4 mr-2" /> View in My Vault
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ToolRunner;

