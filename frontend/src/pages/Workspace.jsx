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
  revokeCanaryToken
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
  Fingerprint
} from 'lucide-react';

export const Workspace = () => {
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

  const handleUpload = async (e) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    setIsUploading(true);
    setMessage('');
    setErrorMessage('');
    try {
      await uploadFile(selected);
      setMessage(`Successfully uploaded '${selected.name}'.`);
      await loadData();
    } catch (err) {
      setErrorMessage(err.response?.data?.detail || 'Failed to upload document.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (fileId, fileName) => {
    if (!window.confirm(`Are you sure you want to remove '${fileName}' from your vault?`)) {
      return;
    }
    try {
      await deleteFile(fileId);
      setMessage(`Removed '${fileName}' and freed storage.`);
      await loadData();
    } catch (err) {
      setErrorMessage(err.response?.data?.detail || 'Failed to delete file.');
    }
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

  const MAX_STORAGE_BYTES = 524288000; // 500 MB member tier
  const storageUsed = profile?.storage_used_bytes || 0;
  const storagePercentage = Math.min(100, Math.round((storageUsed / MAX_STORAGE_BYTES) * 100));

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Workspace Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-white/5 gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center">
            <FolderLock className="w-5 h-5 mr-2.5 text-[#E8E8E3] stroke-[1.75]" />
            Cloud Document Vault
          </h1>
          <p className="mt-1 text-xs text-[#9E9E98]">
            Manage, download, and organize your encrypted documents.
          </p>
        </div>

        <div className="flex items-center space-x-2.5">
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
            className="p-2 rounded-full border border-white/10 bg-[#121214] text-[#9E9E98] hover:text-white transition-all active:scale-[0.95]"
            title="Refresh vault"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="flex items-center text-xs font-semibold px-4 py-2 rounded-full bg-[#E8E8E3] text-[#111113] hover:bg-white transition-all duration-150 active:scale-[0.97] disabled:opacity-50 shadow-sm"
          >
            {isUploading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <UploadCloud className="w-3.5 h-3.5 mr-1.5" />
                Upload Document
              </>
            )}
          </button>
        </div>
      </div>

      {/* Notifications */}
      {message && (
        <div className="mt-5 p-3 rounded-2xl border border-emerald-900/60 bg-emerald-950/20 text-xs text-emerald-300 flex items-center justify-between">
          <span className="flex items-center">
            <CheckCircle2 className="w-3.5 h-3.5 mr-2 text-emerald-400 shrink-0" />
            {message}
          </span>
          <button onClick={() => setMessage('')} className="text-emerald-400 hover:text-white ml-2">&times;</button>
        </div>
      )}
      {errorMessage && (
        <div className="mt-5 p-3 rounded-2xl border border-rose-900/60 bg-rose-950/20 text-xs text-rose-300 flex items-center justify-between">
          <span className="flex items-center">
            <AlertCircle className="w-3.5 h-3.5 mr-2 text-rose-400 shrink-0" />
            {errorMessage}
          </span>
          <button onClick={() => setErrorMessage('')} className="text-rose-400 hover:text-white ml-2">&times;</button>
        </div>
      )}

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 my-6">
        {/* Account Status */}
        <div className="p-4 rounded-2xl border border-white/10 bg-[#121214]">
          <div className="flex items-center justify-between text-[#666662] mb-1.5 text-xs">
            <span>Account</span>
            <Lock className="w-3.5 h-3.5 text-[#9E9E98]" />
          </div>
          <div className="text-sm font-semibold text-white truncate" title={user?.email}>
            {user?.email}
          </div>
          <div className="mt-2 text-[11px] text-[#9E9E98] flex items-center">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5"></span>
            Authenticated Member
          </div>
        </div>

        {/* Storage Quota */}
        <div className="p-4 rounded-2xl border border-white/10 bg-[#121214]">
          <div className="flex items-center justify-between text-[#666662] mb-1.5 text-xs">
            <span>Cloud Storage</span>
            <HardDrive className="w-3.5 h-3.5 text-[#9E9E98]" />
          </div>
          <div className="text-sm font-semibold text-white">
            {(storageUsed / (1024 * 1024)).toFixed(1)} MB <span className="text-xs font-normal text-[#666662]">/ 500 MB</span>
          </div>
          <div className="mt-2.5 w-full bg-white/5 border border-white/5 h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-[#E8E8E3] h-full rounded-full transition-all duration-300"
              style={{ width: `${Math.max(2, storagePercentage)}%` }}
            />
          </div>
          <div className="mt-1.5 text-[10px] text-[#666662] flex items-center justify-between">
            <span>Utilization</span>
            <span>{storagePercentage}%</span>
          </div>
        </div>

        {/* Files Count */}
        <div className="p-4 rounded-2xl border border-white/10 bg-[#121214]">
          <div className="flex items-center justify-between text-[#666662] mb-1.5 text-xs">
            <span>Saved Documents</span>
            <FileText className="w-3.5 h-3.5 text-[#9E9E98]" />
          </div>
          <div className="text-sm font-semibold text-white">
            {files.length} {files.length === 1 ? 'file' : 'files'}
          </div>
          <div className="mt-2 text-[11px] text-[#9E9E98]">
            Protected with standard AES encryption
          </div>
        </div>
      </div>

      {/* Section Tabs */}
      <div className="flex items-center space-x-2 pb-4">
        <button
          onClick={() => setActiveTab('vault')}
          className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all active:scale-[0.97] ${
            activeTab === 'vault'
              ? 'bg-[#E8E8E3] text-[#111113]'
              : 'bg-[#121214] text-[#9E9E98] hover:text-white border border-white/5'
          }`}
        >
          <FolderLock className="w-3.5 h-3.5" />
          <span>Saved Documents ({files.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('canary')}
          className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all active:scale-[0.97] ${
            activeTab === 'canary'
              ? 'bg-[#E8E8E3] text-[#111113]'
              : 'bg-[#121214] text-[#9E9E98] hover:text-white border border-white/5'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Canary Tokens ({canaryTokens.length})</span>
        </button>
      </div>

      {activeTab === 'vault' ? (
        /* Document Ledger Table */
        <div className="rounded-2xl border border-white/10 bg-[#121214] overflow-hidden">
          <div className="p-4 border-b border-white/5 flex items-center justify-between bg-[#151518]">
            <div className="flex items-center space-x-2">
              <FileText className="w-4 h-4 text-[#E8E8E3]" />
              <h2 className="text-xs font-semibold text-white">Your Files</h2>
            </div>
            <span className="text-[11px] text-[#666662]">{files.length} total</span>
          </div>

          {files.length === 0 ? (
            <div className="p-10 text-center">
              <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-[#9E9E98]">
                <UploadCloud className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-semibold text-white">No documents saved yet</h3>
              <p className="mt-1 text-xs text-[#9E9E98] max-w-sm mx-auto">
                Documents you process or upload while signed in will appear here for safe storage.
              </p>
              <div className="mt-4 flex items-center justify-center gap-2.5">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center px-3.5 py-1.5 rounded-full bg-[#E8E8E3] text-[#111113] hover:bg-white font-medium text-xs transition-all active:scale-[0.97]"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Upload Document
                </button>
                <Link
                  to="/tools/merge"
                  className="inline-flex items-center px-3.5 py-1.5 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 text-[#E8E8E3] font-medium text-xs transition-all active:scale-[0.97]"
                >
                  <Layers className="w-3.5 h-3.5 mr-1" />
                  Merge Files
                </Link>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-white/5 text-[#666662] bg-[#121214] text-[11px]">
                    <th className="py-2.5 px-4 font-medium">Document</th>
                    <th className="py-2.5 px-4 font-medium">Action</th>
                    <th className="py-2.5 px-4 font-medium">Size</th>
                    <th className="py-2.5 px-4 font-medium">Date</th>
                    <th className="py-2.5 px-4 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {files.map((file) => (
                    <tr key={file.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center space-x-2.5">
                          <FileText className="w-3.5 h-3.5 text-[#9E9E98] shrink-0" />
                          <span className="font-medium text-[#E8E8E3] max-w-[240px] truncate" title={file.original_filename}>
                            {file.original_filename}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-[#9E9E98]">
                        <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/5 text-[10px] capitalize">
                          {file.action_type}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-[#9E9E98] font-mono text-[11px]">
                        {((file.output_file_size_bytes || file.file_size_bytes) / 1024).toFixed(1)} KB
                      </td>
                      <td className="py-3 px-4 text-[#666662] text-[11px]">
                        {new Date(file.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4 text-right space-x-1.5">
                        {file.download_url && (
                          <a
                            href={file.download_url}
                            download={file.original_filename}
                            className="inline-flex items-center p-1.5 rounded-full border border-white/10 bg-white/5 text-[#E8E8E3] hover:text-white hover:bg-white/10 transition-colors active:scale-[0.95]"
                            title="Download Document"
                          >
                            <Download className="w-3 h-3" />
                          </a>
                        )}
                        <button
                          onClick={() => handleDelete(file.id, file.original_filename)}
                          className="inline-flex items-center p-1.5 rounded-full border border-rose-950/40 bg-rose-950/20 text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 transition-colors active:scale-[0.95]"
                          title="Delete Document"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        /* Forensic Canary Tokens Table */
        <div className="rounded-2xl border border-white/10 bg-[#121214] overflow-hidden">
          <div className="p-4 border-b border-white/5 flex flex-col sm:flex-row sm:items-center justify-between bg-[#151518] gap-3">
            <div className="flex items-center space-x-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <div>
                <h2 className="text-xs font-semibold text-white">Active & Revoked Canary Tokens</h2>
                <p className="text-[10px] text-[#9E9E98]">Multi-layer forensic markers embedded in distributed documents</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Link
                to="/tools/canary"
                className="px-3 py-1 rounded-full bg-[#E8E8E3] text-[#111113] hover:bg-white text-xs font-semibold flex items-center active:scale-[0.97]"
              >
                <Plus className="w-3 h-3 mr-1" /> Embed Token
              </Link>
              <Link
                to="/tools/verify-canary"
                className="px-3 py-1 rounded-full border border-white/10 bg-white/5 text-[#E8E8E3] hover:bg-white/10 text-xs font-medium flex items-center active:scale-[0.97]"
              >
                <Fingerprint className="w-3 h-3 mr-1" /> Verify Leak
              </Link>
            </div>
          </div>

          {canaryTokens.length === 0 ? (
            <div className="p-10 text-center">
              <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-[#9E9E98]">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
              </div>
              <h3 className="text-sm font-semibold text-white">No canary tokens generated yet</h3>
              <p className="mt-1 text-xs text-[#9E9E98] max-w-sm mx-auto">
                Embed invisible forensic markers in confidential documents before sharing them to trace potential leaks.
              </p>
              <div className="mt-4 flex items-center justify-center gap-2.5">
                <Link
                  to="/tools/canary"
                  className="inline-flex items-center px-3.5 py-1.5 rounded-full bg-[#E8E8E3] text-[#111113] hover:bg-white font-medium text-xs transition-all active:scale-[0.97]"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Generate Canary Watermark
                </Link>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-white/5 text-[#666662] bg-[#121214] text-[11px]">
                    <th className="py-2.5 px-4 font-medium">Token ID</th>
                    <th className="py-2.5 px-4 font-medium">Recipient / Org</th>
                    <th className="py-2.5 px-4 font-medium">Tracking Note</th>
                    <th className="py-2.5 px-4 font-medium">Status</th>
                    <th className="py-2.5 px-4 font-medium">Created</th>
                    <th className="py-2.5 px-4 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {canaryTokens.map((t) => (
                    <tr key={t.token_id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-3 px-4">
                        <span className="font-mono text-xs text-[#E8E8E3]">{t.token_id}</span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-white font-medium">
                          {t.recipient_name || 'Unassigned'}
                        </div>
                        {t.organization && (
                          <div className="text-[10px] text-[#9E9E98]">{t.organization}</div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-[#9E9E98] text-[11px]">
                        {t.tracking_note || '—'}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                            t.status === 'ACTIVE'
                              ? 'bg-emerald-950/40 text-emerald-400 border-emerald-800/40'
                              : 'bg-amber-950/40 text-amber-400 border-amber-800/40'
                          }`}
                        >
                          {t.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-[#666662] text-[11px]">
                        {new Date(t.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4 text-right space-x-1.5">
                        {t.download_url && (
                          <a
                            href={t.download_url}
                            download={`protected_${t.token_id}.pdf`}
                            className="inline-flex items-center p-1.5 rounded-full border border-white/10 bg-white/5 text-[#E8E8E3] hover:text-white hover:bg-white/10 transition-colors active:scale-[0.95]"
                            title="Download Protected Document"
                          >
                            <Download className="w-3 h-3" />
                          </a>
                        )}
                        {t.status === 'ACTIVE' && (
                          <button
                            onClick={() => handleRevokeCanary(t.token_id)}
                            className="inline-flex items-center p-1.5 rounded-full border border-amber-950/40 bg-amber-950/20 text-amber-400 hover:text-amber-300 hover:bg-amber-950/40 transition-colors active:scale-[0.95]"
                            title="Revoke Token"
                          >
                            <Ban className="w-3 h-3" />
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
  );
};

export default Workspace;
