import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  fetchCurrentUser,
  fetchSessionContext,
  fetchFiles,
  uploadFile,
  deleteFile
} from '../services/api';
import {
  FolderLock,
  Cloud,
  Database,
  Fingerprint,
  HardDrive,
  UploadCloud,
  FileText,
  ShieldCheck,
  Plus,
  RefreshCw,
  ExternalLink,
  Lock,
  Download,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Layers
} from 'lucide-react';

export const Workspace = () => {
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [sessionCtx, setSessionCtx] = useState(null);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const fileInputRef = useRef(null);

  const loadData = async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const [userData, contextData, fileData] = await Promise.all([
        fetchCurrentUser(),
        fetchSessionContext(),
        fetchFiles().catch(() => ({ files: [], storage_used_bytes: 0 })),
      ]);
      setProfile(userData);
      setSessionCtx(contextData);
      setFiles(fileData.files || []);
    } catch (err) {
      console.error('Failed to load workspace data:', err);
      setErrorMessage('Could not synchronize workspace with cloud server.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleUpload = async (e) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    setIsUploading(true);
    setMessage('');
    setErrorMessage('');
    try {
      await uploadFile(selected);
      setMessage(`Successfully uploaded '${selected.name}' to Amazon S3 Vault.`);
      await loadData();
    } catch (err) {
      setErrorMessage(err.response?.data?.detail || 'Failed to upload document.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (fileId, fileName) => {
    if (!window.confirm(`Are you sure you want to delete '${fileName}' from your cloud vault?`)) {
      return;
    }
    try {
      await deleteFile(fileId);
      setMessage(`Deleted '${fileName}' and reclaimed storage.`);
      await loadData();
    } catch (err) {
      setErrorMessage(err.response?.data?.detail || 'Failed to delete file.');
    }
  };

  const MAX_STORAGE_BYTES = 524288000; // 500 MB member tier
  const storageUsed = profile?.storage_used_bytes || 0;
  const storagePercentage = Math.min(100, Math.round((storageUsed / MAX_STORAGE_BYTES) * 100));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Workspace Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-8 border-b border-slate-800 gap-4">
        <div>
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold mb-2">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Authenticated Member Vault</span>
          </div>
          <h1 className="text-3xl font-bold text-white flex items-center">
            <FolderLock className="w-8 h-8 mr-3 text-indigo-400" />
            My Cloud Workspace
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Encrypted Amazon S3 document vault, persistent PostgreSQL metadata, and automated history.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleUpload}
            accept=".pdf,.docx,.png,.jpg,.jpeg"
            className="hidden"
          />
          <button
            onClick={loadData}
            disabled={loading}
            className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition-colors"
            title="Refresh vault"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="flex items-center text-xs font-semibold px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/30 transition-all disabled:opacity-50"
          >
            {isUploading ? (
              <>
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                Uploading to S3...
              </>
            ) : (
              <>
                <UploadCloud className="w-4 h-4 mr-1.5" />
                Upload Document to S3
              </>
            )}
          </button>
        </div>
      </div>

      {/* Notifications */}
      {message && (
        <div className="mt-6 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300 flex items-center justify-between">
          <span className="flex items-center">
            <CheckCircle2 className="w-4 h-4 mr-2 text-emerald-400 shrink-0" />
            {message}
          </span>
          <button onClick={() => setMessage('')} className="text-emerald-400 hover:text-white ml-2">&times;</button>
        </div>
      )}
      {errorMessage && (
        <div className="mt-6 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300 flex items-center justify-between">
          <span className="flex items-center">
            <AlertCircle className="w-4 h-4 mr-2 text-rose-400 shrink-0" />
            {errorMessage}
          </span>
          <button onClick={() => setErrorMessage('')} className="text-rose-400 hover:text-white ml-2">&times;</button>
        </div>
      )}

      {/* Metrics & Storage Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 my-8">
        {/* Cognito Identity Card */}
        <div className="p-6 rounded-2xl glass-panel border border-slate-800/80 bg-slate-900/50">
          <div className="flex items-center justify-between text-slate-400 mb-3 text-xs">
            <span className="font-mono uppercase">Cognito Member</span>
            <Lock className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-sm font-semibold text-white truncate" title={user?.email}>
            {user?.email}
          </div>
          <div className="mt-2 text-[11px] font-mono text-slate-500 truncate" title={profile?.cognito_sub || user?.sub}>
            Sub: {profile?.cognito_sub || user?.sub}
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
            <span>RDS User ID</span>
            <span className="font-mono text-indigo-400 text-[11px]">
              {profile?.id ? `${profile.id.slice(0, 8)}...` : 'Synchronized'}
            </span>
          </div>
        </div>

        {/* S3 Storage Quota */}
        <div className="p-6 rounded-2xl glass-panel border border-slate-800/80 bg-slate-900/50">
          <div className="flex items-center justify-between text-slate-400 mb-3 text-xs">
            <span className="font-mono uppercase">S3 Vault Storage</span>
            <HardDrive className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-xl font-bold text-white">
            {(storageUsed / (1024 * 1024)).toFixed(2)} <span className="text-xs font-normal text-slate-400">/ 500 MB</span>
          </div>
          <div className="mt-3 w-full bg-slate-800 h-2 rounded-full overflow-hidden">
            <div
              className="bg-indigo-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.max(5, storagePercentage)}%` }}
            />
          </div>
          <div className="mt-3 text-[11px] text-slate-400 flex items-center justify-between">
            <span>Quota utilization</span>
            <span className="font-mono text-slate-300">{storagePercentage}%</span>
          </div>
        </div>

        {/* Forensic Canary Token Monitor */}
        <div className="p-6 rounded-2xl glass-panel border border-slate-800/80 bg-slate-900/50">
          <div className="flex items-center justify-between text-slate-400 mb-3 text-xs">
            <span className="font-mono uppercase">Stored Cloud Documents</span>
            <FileText className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-xl font-bold text-white flex items-center">
            {files.length} <span className="text-xs font-normal text-slate-400 ml-2">Active Files</span>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            Persistent cloud documents stored under your Amazon S3 prefix.
          </p>
          <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs">
            <span className="text-slate-400">Target Bucket</span>
            <span className="text-emerald-400 font-mono text-[11px]">cloudpdf-studio-storage-2026</span>
          </div>
        </div>
      </div>

      {/* S3 Document Vault Table */}
      <div className="rounded-2xl glass-panel border border-slate-800/80 bg-slate-900/40 overflow-hidden mt-8">
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <FileText className="w-4 h-4 text-indigo-400" />
            <h2 className="text-base font-semibold text-white">S3 Document Vault</h2>
          </div>
          <span className="text-xs text-slate-500 font-mono">{files.length} items</span>
        </div>

        {files.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-slate-800/80 border border-slate-700 flex items-center justify-center text-slate-400">
              <UploadCloud className="w-8 h-8 text-indigo-400" />
            </div>
            <h3 className="text-base font-semibold text-white">Your Cloud Vault is Empty</h3>
            <p className="mt-1.5 text-xs text-slate-400 max-w-sm mx-auto">
              Uploaded PDFs and processed documents persist here securely in Amazon S3 linked to your RDS user profile.
            </p>
            <div className="mt-5 flex items-center justify-center gap-3">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs shadow-md transition-all"
              >
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                Upload First Document
              </button>
              <Link
                to="/tools/merge"
                className="inline-flex items-center px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs border border-slate-700 transition-all"
              >
                <Layers className="w-3.5 h-3.5 mr-1.5" />
                Launch PDF Merge
              </Link>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 bg-slate-950/60 font-mono text-[11px] uppercase">
                  <th className="py-3 px-4">Document</th>
                  <th className="py-3 px-4">Operation</th>
                  <th className="py-3 px-4">Size</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Created</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {files.map((file) => (
                  <tr key={file.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center space-x-2.5">
                        <FileText className="w-4 h-4 text-indigo-400 shrink-0" />
                        <span className="font-medium text-slate-200 max-w-[220px] truncate" title={file.original_filename}>
                          {file.original_filename}
                        </span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-400">
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-indigo-300 text-[10px]">
                        {file.action_type}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-300">
                      {((file.output_file_size_bytes || file.file_size_bytes) / 1024).toFixed(1)} KB
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        file.status === 'COMPLETED'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : file.status === 'FAILED'
                          ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      }`}>
                        {file.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-400 font-mono text-[11px]">
                      {new Date(file.created_at).toLocaleDateString()} {new Date(file.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="py-3.5 px-4 text-right space-x-2">
                      {file.download_url && (
                        <a
                          href={file.download_url}
                          download={file.original_filename}
                          className="inline-flex items-center p-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 border border-indigo-500/30 transition-colors"
                          title="Download Document"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </a>
                      )}
                      <button
                        onClick={() => handleDelete(file.id, file.original_filename)}
                        className="inline-flex items-center p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition-colors"
                        title="Delete Document"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default Workspace;
