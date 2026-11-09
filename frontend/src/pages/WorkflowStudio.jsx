import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  Layers,
  Plus,
  Play,
  Save,
  Trash2,
  Copy,
  MoveUp,
  MoveDown,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Download,
  RotateCw,
  Sparkles,
  Minimize2,
  Lock,
  Unlock,
  FileSearch,
  Eraser,
  RefreshCw,
  FolderLock,
  ChevronDown,
  Check
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  fetchWorkflows,
  createWorkflow,
  updateWorkflow,
  deleteWorkflow,
  runWorkflowPipeline
} from '../services/api';

const PRESET_BLUEPRINTS = [
  {
    id: 'preset-clean-secure',
    name: 'Clean & Secure Publication',
    description: 'Scrubs private metadata, embeds an invisible forensic canary token for leak tracking, and compresses the final document.',
    steps: [
      { action: 'scrub_metadata', params: {} },
      {
        action: 'canary_watermark',
        params: {
          recipient_name: 'Confidential Distribution',
          organization: 'Internal Group',
          tracking_note: 'Clean & Secure Pipeline',
        },
      },
      { action: 'compress', params: { level: 'high' } },
    ],
  },
  {
    id: 'preset-client-delivery',
    name: 'Client Delivery Sequence',
    description: 'Rotates orientation, stamps a visible confidentiality watermark, and locks the document with an AES password.',
    steps: [
      { action: 'rotate', params: { angle: 90 } },
      {
        action: 'watermark',
        params: {
          text: 'CONFIDENTIAL',
          font_size: 36,
          opacity: 0.25,
          rotation: 45,
          color: '#FF0000',
        },
      },
      { action: 'protect', params: { password: 'ClientPassword2026!' } },
    ],
  },
  {
    id: 'preset-archival-prep',
    name: 'Archival Preparation Blueprint',
    description: 'Decrypts legacy archives, performs optical character recognition for searchability, and compresses for cloud storage.',
    steps: [
      { action: 'unlock', params: { password: 'archive_password' } },
      { action: 'ocr', params: { language: 'eng' } },
      { action: 'compress', params: { level: 'medium' } },
    ],
  },
];

const OPERATION_TEMPLATES = [
  {
    action: 'rotate',
    label: 'Rotate Pages',
    desc: 'Rotate clockwise by 90°, 180°, or 270°',
    icon: RotateCw,
    color: 'text-amber-400',
    defaultParams: { angle: 90 },
  },
  {
    action: 'watermark',
    label: 'Visible Watermark',
    desc: 'Stamp diagonal text watermark with custom opacity',
    icon: Sparkles,
    color: 'text-sky-400',
    defaultParams: {
      text: 'CONFIDENTIAL',
      font_size: 36,
      opacity: 0.3,
      rotation: 45,
      color: '#FF0000',
    },
  },
  {
    action: 'compress',
    label: 'Compress & Optimize',
    desc: 'Downscale streams and optimize byte structure',
    icon: Minimize2,
    color: 'text-emerald-400',
    defaultParams: { level: 'medium' },
  },
  {
    action: 'protect',
    label: 'Encrypt (AES-256)',
    desc: 'Apply password protection to the document',
    icon: Lock,
    color: 'text-violet-400',
    defaultParams: { password: '' },
  },
  {
    action: 'unlock',
    label: 'Unlock & Decrypt',
    desc: 'Remove password protection from encrypted PDF',
    icon: Unlock,
    color: 'text-rose-400',
    defaultParams: { password: '' },
  },
  {
    action: 'scrub_metadata',
    label: 'Metadata Scrub',
    desc: 'Erase author, title, and tracking metadata',
    icon: Eraser,
    color: 'text-blue-400',
    defaultParams: {},
  },
  {
    action: 'canary_watermark',
    label: 'Canary Steganography',
    desc: 'Micro-embed invisible forensic leak tracking token',
    icon: ShieldCheck,
    color: 'text-emerald-400',
    defaultParams: {
      recipient_name: 'Partner Group',
      organization: 'External Audit',
      tracking_note: 'Automated Pipeline Run',
    },
  },
  {
    action: 'ocr',
    label: 'OCR Optimization',
    desc: 'Analyze text layer for searchability and indexing',
    icon: FileSearch,
    color: 'text-amber-400',
    defaultParams: { language: 'eng' },
  },
];

export const WorkflowStudio = () => {
  const { isAuthenticated } = useAuth();

  // Tab State: 'builder' | 'saved' | 'presets'
  const [activeTab, setActiveTab] = useState('builder');

  // Active Pipeline State
  const [activeWorkflowId, setActiveWorkflowId] = useState(null);
  const [pipelineName, setPipelineName] = useState('My Automated Pipeline');
  const [pipelineDescription, setPipelineDescription] = useState('Custom multi-step document workflow');
  const [steps, setSteps] = useState([
    {
      id: 'step-init-1',
      action: 'scrub_metadata',
      params: {},
    },
    {
      id: 'step-init-2',
      action: 'canary_watermark',
      params: {
        recipient_name: 'Confidential Client',
        organization: 'Client Advisory',
        tracking_note: 'Pipeline Execution',
      },
    },
    {
      id: 'step-init-3',
      action: 'compress',
      params: { level: 'high' },
    },
  ]);

  // Saved Workflows from PostgreSQL
  const [savedWorkflows, setSavedWorkflows] = useState([]);
  const [loadingSaved, setLoadingSaved] = useState(false);

  // Execution State
  const [inputFile, setInputFile] = useState(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [stepExecutions, setStepExecutions] = useState([]);
  const [executionResult, setExecutionResult] = useState(null);
  const [executionError, setExecutionError] = useState(null);
  const [notification, setNotification] = useState('');
  const fileInputRef = useRef(null);

  // Load Saved Workflows
  const loadSavedWorkflows = async () => {
    if (!isAuthenticated) return;
    setLoadingSaved(true);
    try {
      const data = await fetchWorkflows();
      setSavedWorkflows(data || []);
    } catch (err) {
      console.error('Failed to load saved workflows:', err);
    } finally {
      setLoadingSaved(false);
    }
  };

  useEffect(() => {
    loadSavedWorkflows();
  }, [isAuthenticated]);

  // Add Step to Pipeline
  const addStep = (template) => {
    if (steps.length >= 10) {
      setNotification('Maximum 10 steps permitted per pipeline.');
      return;
    }
    const newStep = {
      id: `step-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      action: template.action,
      params: { ...template.defaultParams },
    };
    setSteps((prev) => [...prev, newStep]);
  };

  // Remove Step
  const removeStep = (index) => {
    setSteps((prev) => prev.filter((_, i) => i !== index));
  };

  // Move Step (Re-order)
  const moveStep = (index, direction) => {
    setSteps((prev) => {
      const updated = [...prev];
      const target = index + direction;
      if (target < 0 || target >= updated.length) return prev;
      const temp = updated[index];
      updated[index] = updated[target];
      updated[target] = temp;
      return updated;
    });
  };

  // Update Step Parameter
  const updateStepParam = (index, key, value) => {
    setSteps((prev) => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        params: {
          ...updated[index].params,
          [key]: value,
        },
      };
      return updated;
    });
  };

  // Load Preset into Active Builder
  const loadPreset = (preset) => {
    setActiveWorkflowId(null);
    setPipelineName(preset.name);
    setPipelineDescription(preset.description);
    setSteps(
      preset.steps.map((s, idx) => ({
        id: `step-preset-${idx}-${Date.now()}`,
        action: s.action,
        params: { ...s.params },
      }))
    );
    setActiveTab('builder');
    setNotification(`Loaded blueprint '${preset.name}'. You can edit or run it.`);
  };

  // Load Saved Workflow into Builder
  const loadSaved = (wf) => {
    setActiveWorkflowId(wf.id);
    setPipelineName(wf.name);
    setPipelineDescription(wf.description || '');
    setSteps(
      wf.steps.map((s, idx) => ({
        id: `step-saved-${idx}-${Date.now()}`,
        action: s.action,
        params: { ...s.params },
      }))
    );
    setActiveTab('builder');
    setNotification(`Loaded saved blueprint '${wf.name}'.`);
  };

  // Save Pipeline to PostgreSQL
  const handleSavePipeline = async () => {
    if (!isAuthenticated) {
      setNotification('Please sign in to save custom pipelines.');
      return;
    }
    if (!pipelineName.trim()) {
      setNotification('Please specify a pipeline name.');
      return;
    }
    if (steps.length === 0) {
      setNotification('Add at least one step before saving.');
      return;
    }

    try {
      const stepPayload = steps.map((s) => ({
        action: s.action,
        params: s.params,
      }));

      if (activeWorkflowId) {
        await updateWorkflow(activeWorkflowId, {
          name: pipelineName,
          description: pipelineDescription,
          steps: stepPayload,
        });
        setNotification(`Successfully updated pipeline '${pipelineName}'.`);
      } else {
        const created = await createWorkflow({
          name: pipelineName,
          description: pipelineDescription,
          steps: stepPayload,
        });
        setActiveWorkflowId(created.id);
        setNotification(`Saved new pipeline '${pipelineName}'.`);
      }
      await loadSavedWorkflows();
    } catch (err) {
      setNotification(err.response?.data?.detail || 'Failed to save pipeline blueprint.');
    }
  };

  // Duplicate Blueprint
  const handleDuplicate = async (wf) => {
    try {
      await createWorkflow({
        name: `${wf.name} (Copy)`,
        description: wf.description,
        steps: wf.steps,
      });
      setNotification(`Duplicated blueprint '${wf.name}'.`);
      await loadSavedWorkflows();
    } catch (err) {
      setNotification('Failed to duplicate blueprint.');
    }
  };

  // Delete Saved Blueprint
  const handleDeleteSaved = async (id, name) => {
    if (!window.confirm(`Delete pipeline blueprint '${name}'?`)) return;
    try {
      await deleteWorkflow(id);
      if (activeWorkflowId === id) setActiveWorkflowId(null);
      setNotification(`Deleted blueprint '${name}'.`);
      await loadSavedWorkflows();
    } catch (err) {
      setNotification('Failed to delete blueprint.');
    }
  };

  // Execute Pipeline on Document
  const handleRunPipeline = async () => {
    if (!inputFile) {
      setExecutionError('Please select a PDF document to run this pipeline.');
      return;
    }
    if (steps.length === 0) {
      setExecutionError('Pipeline requires at least one processing step.');
      return;
    }

    setIsExecuting(true);
    setExecutionError(null);
    setExecutionResult(null);

    // Initialize step progress state
    setStepExecutions(
      steps.map((s, idx) => ({
        step_index: idx + 1,
        action: s.action,
        status: idx === 0 ? 'RUNNING' : 'PENDING',
        duration_ms: null,
      }))
    );

    try {
      const formData = new FormData();
      formData.append('file', inputFile);
      formData.append('workflow_name', pipelineName);
      formData.append(
        'steps',
        JSON.stringify(
          steps.map((s) => ({
            action: s.action,
            params: s.params,
          }))
        )
      );

      const res = await runWorkflowPipeline(formData);
      setExecutionResult(res);
      setStepExecutions(res.step_results || []);
    } catch (err) {
      console.error('Pipeline execution error:', err);
      const detail = err.response?.data?.detail;
      if (detail && typeof detail === 'object') {
        setExecutionError(detail.message || 'Pipeline failed.');
        if (detail.step_results) setStepExecutions(detail.step_results);
      } else {
        setExecutionError(detail || err.message || 'Pipeline execution failed.');
      }
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Studio Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-white/5 gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center">
            <Layers className="w-5 h-5 mr-2.5 text-[#E8E8E3] stroke-[1.75]" />
            Workflow Studio
          </h1>
          <p className="mt-1 text-xs text-[#9E9E98]">
            Chain multiple PDF transformations into automated, reusable execution pipelines.
          </p>
        </div>

        {/* View Mode Tabs */}
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setActiveTab('builder')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all active:scale-[0.97] ${
              activeTab === 'builder'
                ? 'bg-[#E8E8E3] text-[#111113]'
                : 'bg-[#121214] text-[#9E9E98] hover:text-white border border-white/5'
            }`}
          >
            Pipeline Builder
          </button>
          <button
            onClick={() => setActiveTab('presets')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all active:scale-[0.97] ${
              activeTab === 'presets'
                ? 'bg-[#E8E8E3] text-[#111113]'
                : 'bg-[#121214] text-[#9E9E98] hover:text-white border border-white/5'
            }`}
          >
            Blueprints ({PRESET_BLUEPRINTS.length})
          </button>
          {isAuthenticated && (
            <button
              onClick={() => setActiveTab('saved')}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all active:scale-[0.97] ${
                activeTab === 'saved'
                  ? 'bg-[#E8E8E3] text-[#111113]'
                  : 'bg-[#121214] text-[#9E9E98] hover:text-white border border-white/5'
              }`}
            >
              My Saved ({savedWorkflows.length})
            </button>
          )}
        </div>
      </div>

      {/* Notification Toast */}
      {notification && (
        <div className="mt-4 p-3 rounded-2xl border border-white/10 bg-[#161619] text-xs text-[#E8E8E3] flex items-center justify-between">
          <span>{notification}</span>
          <button onClick={() => setNotification('')} className="text-[#9E9E98] hover:text-white ml-2">
            &times;
          </button>
        </div>
      )}

      {/* Unauthenticated Member Prompt */}
      {!isAuthenticated && (
        <div className="mt-6 p-4 rounded-2xl border border-white/10 bg-[#121214] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <ShieldCheck className="w-5 h-5 text-[#E8E8E3] shrink-0" />
            <div>
              <p className="text-xs font-semibold text-white">Member Capability: Persistent Pipelines</p>
              <p className="text-[11px] text-[#9E9E98]">
                Sign in to save custom pipelines, store configurations, and automate cloud document archives.
              </p>
            </div>
          </div>
          <Link
            to="/login"
            className="px-3.5 py-1.5 rounded-full bg-[#E8E8E3] text-[#111113] hover:bg-white text-xs font-semibold shrink-0 transition-all active:scale-[0.97]"
          >
            Sign In to Save
          </Link>
        </div>
      )}

      {/* TAB 1: BUILDER & EXECUTION CANVAS */}
      {activeTab === 'builder' && (
        <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left 2 Cols: Pipeline Sequence Builder */}
          <div className="lg:col-span-2 space-y-6">
            {/* Metadata Card */}
            <div className="p-5 rounded-2xl border border-white/10 bg-[#121214] space-y-3">
              <div>
                <label className="block text-[11px] text-[#9E9E98] mb-1 font-medium">Pipeline Name</label>
                <input
                  type="text"
                  value={pipelineName}
                  onChange={(e) => setPipelineName(e.target.value)}
                  placeholder="e.g. Clean & Secure Distribution"
                  className="w-full px-3 py-2 bg-[#161619] border border-white/10 rounded-xl text-sm font-semibold text-white focus:outline-none focus:border-white/30"
                />
              </div>
              <div>
                <label className="block text-[11px] text-[#9E9E98] mb-1">Description</label>
                <input
                  type="text"
                  value={pipelineDescription}
                  onChange={(e) => setPipelineDescription(e.target.value)}
                  placeholder="Brief summary of operations performed..."
                  className="w-full px-3 py-1.5 bg-[#161619] border border-white/10 rounded-xl text-xs text-[#E8E8E3] focus:outline-none focus:border-white/30"
                />
              </div>
            </div>

            {/* Sequence Steps Canvas */}
            <div className="p-5 rounded-2xl border border-white/10 bg-[#121214] space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-white/5">
                <div>
                  <h2 className="text-xs font-semibold text-white">Execution Sequence ({steps.length} Steps)</h2>
                  <p className="text-[10px] text-[#9E9E98]">Steps execute sequentially in-memory from top to bottom</p>
                </div>
                {isAuthenticated && (
                  <button
                    onClick={handleSavePipeline}
                    className="flex items-center px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-medium border border-white/10 transition-all active:scale-[0.97]"
                  >
                    <Save className="w-3.5 h-3.5 mr-1.5" />
                    {activeWorkflowId ? 'Update Blueprint' : 'Save Blueprint'}
                  </button>
                )}
              </div>

              {/* Step Cards List */}
              {steps.length === 0 ? (
                <div className="p-8 text-center border border-dashed border-white/10 rounded-xl">
                  <p className="text-xs text-[#9E9E98]">Your pipeline has no steps yet.</p>
                  <p className="text-[11px] text-[#666662] mt-1">Select an operation below to add your first step.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {steps.map((step, idx) => {
                    const tmpl = OPERATION_TEMPLATES.find((t) => t.action === step.action);
                    const StepIcon = tmpl ? tmpl.icon : Layers;
                    return (
                      <div
                        key={step.id}
                        className="p-4 rounded-xl border border-white/5 bg-[#161619] transition-all"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center space-x-3">
                            <span className="w-5 h-5 rounded-full bg-white/10 text-white flex items-center justify-center text-[10px] font-mono shrink-0">
                              {idx + 1}
                            </span>
                            <StepIcon className={`w-4 h-4 ${tmpl?.color || 'text-white'} shrink-0`} />
                            <div>
                              <span className="text-xs font-semibold text-white">{tmpl?.label || step.action}</span>
                              <p className="text-[10px] text-[#9E9E98]">{tmpl?.desc}</p>
                            </div>
                          </div>

                          {/* Step Controls */}
                          <div className="flex items-center space-x-1 shrink-0">
                            <button
                              onClick={() => moveStep(idx, -1)}
                              disabled={idx === 0}
                              className="p-1 rounded-md text-[#9E9E98] hover:text-white disabled:opacity-20 transition-colors"
                              title="Move Up"
                            >
                              <MoveUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => moveStep(idx, 1)}
                              disabled={idx === steps.length - 1}
                              className="p-1 rounded-md text-[#9E9E98] hover:text-white disabled:opacity-20 transition-colors"
                              title="Move Down"
                            >
                              <MoveDown className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => removeStep(idx)}
                              className="p-1 rounded-md text-rose-400/80 hover:text-rose-300 transition-colors ml-1"
                              title="Remove Step"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* In-Place Parameter Configurators */}
                        <div className="mt-3 pt-3 border-t border-white/5 text-xs">
                          {step.action === 'rotate' && (
                            <div className="flex items-center space-x-2">
                              <span className="text-[11px] text-[#9E9E98]">Angle:</span>
                              {[90, 180, 270].map((deg) => (
                                <button
                                  key={deg}
                                  type="button"
                                  onClick={() => updateStepParam(idx, 'angle', deg)}
                                  className={`px-2.5 py-1 rounded-lg text-[11px] font-mono border transition-all ${
                                    step.params.angle === deg
                                      ? 'bg-[#E8E8E3] text-[#111113] border-white font-semibold'
                                      : 'bg-white/5 border-white/10 text-[#9E9E98] hover:text-white'
                                  }`}
                                >
                                  {deg}°
                                </button>
                              ))}
                            </div>
                          )}

                          {step.action === 'watermark' && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                              <div>
                                <label className="block text-[10px] text-[#9E9E98] mb-0.5">Watermark Text</label>
                                <input
                                  type="text"
                                  value={step.params.text || ''}
                                  onChange={(e) => updateStepParam(idx, 'text', e.target.value)}
                                  className="w-full px-2.5 py-1 bg-[#121214] border border-white/10 rounded-lg text-xs text-white focus:outline-none"
                                />
                              </div>
                              <div className="flex items-center space-x-2 pt-3">
                                <span className="text-[10px] text-[#9E9E98]">Opacity:</span>
                                {[0.15, 0.3, 0.5].map((op) => (
                                  <button
                                    key={op}
                                    type="button"
                                    onClick={() => updateStepParam(idx, 'opacity', op)}
                                    className={`px-2 py-0.5 rounded text-[10px] font-mono border ${
                                      step.params.opacity === op
                                        ? 'bg-[#E8E8E3] text-[#111113] border-white font-semibold'
                                        : 'bg-white/5 border-white/10 text-[#9E9E98]'
                                    }`}
                                  >
                                    {Math.round(op * 100)}%
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          {step.action === 'compress' && (
                            <div className="flex items-center space-x-2">
                              <span className="text-[11px] text-[#9E9E98]">Compression Level:</span>
                              {['low', 'medium', 'high'].map((lvl) => (
                                <button
                                  key={lvl}
                                  type="button"
                                  onClick={() => updateStepParam(idx, 'level', lvl)}
                                  className={`px-2.5 py-1 rounded-lg text-[11px] capitalize border transition-all ${
                                    step.params.level === lvl
                                      ? 'bg-[#E8E8E3] text-[#111113] border-white font-semibold'
                                      : 'bg-white/5 border-white/10 text-[#9E9E98] hover:text-white'
                                  }`}
                                >
                                  {lvl}
                                </button>
                              ))}
                            </div>
                          )}

                          {step.action === 'protect' && (
                            <div className="max-w-xs">
                              <label className="block text-[10px] text-[#9E9E98] mb-0.5">Password</label>
                              <input
                                type="text"
                                value={step.params.password || ''}
                                onChange={(e) => updateStepParam(idx, 'password', e.target.value)}
                                placeholder="Enter document password"
                                className="w-full px-2.5 py-1 bg-[#121214] border border-white/10 rounded-lg text-xs text-white focus:outline-none"
                              />
                            </div>
                          )}

                          {step.action === 'unlock' && (
                            <div className="max-w-xs">
                              <label className="block text-[10px] text-[#9E9E98] mb-0.5">Decrypt Password</label>
                              <input
                                type="text"
                                value={step.params.password || ''}
                                onChange={(e) => updateStepParam(idx, 'password', e.target.value)}
                                placeholder="Enter unlock password"
                                className="w-full px-2.5 py-1 bg-[#121214] border border-white/10 rounded-lg text-xs text-white focus:outline-none"
                              />
                            </div>
                          )}

                          {step.action === 'canary_watermark' && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <div>
                                <label className="block text-[10px] text-[#9E9E98] mb-0.5">Recipient</label>
                                <input
                                  type="text"
                                  value={step.params.recipient_name || ''}
                                  onChange={(e) => updateStepParam(idx, 'recipient_name', e.target.value)}
                                  placeholder="e.g. Partner Group"
                                  className="w-full px-2 py-1 bg-[#121214] border border-white/10 rounded-lg text-[11px] text-white focus:outline-none"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] text-[#9E9E98] mb-0.5">Organization</label>
                                <input
                                  type="text"
                                  value={step.params.organization || ''}
                                  onChange={(e) => updateStepParam(idx, 'organization', e.target.value)}
                                  placeholder="e.g. External Audit"
                                  className="w-full px-2 py-1 bg-[#121214] border border-white/10 rounded-lg text-[11px] text-white focus:outline-none"
                                />
                              </div>
                            </div>
                          )}

                          {step.action === 'scrub_metadata' && (
                            <p className="text-[11px] text-[#9E9E98] italic">
                              Author, Producer, and XMP creation timestamps will be completely sanitized.
                            </p>
                          )}

                          {step.action === 'ocr' && (
                            <div className="flex items-center space-x-2">
                              <span className="text-[11px] text-[#9E9E98]">Language:</span>
                              {['eng', 'spa', 'fra', 'deu'].map((lang) => (
                                <button
                                  key={lang}
                                  type="button"
                                  onClick={() => updateStepParam(idx, 'language', lang)}
                                  className={`px-2 py-0.5 rounded text-[10px] uppercase border ${
                                    step.params.language === lang
                                      ? 'bg-[#E8E8E3] text-[#111113] border-white font-semibold'
                                      : 'bg-white/5 border-white/10 text-[#9E9E98]'
                                  }`}
                                >
                                  {lang}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Add Step Palette */}
              <div className="pt-3 border-t border-white/5">
                <span className="block text-[11px] text-[#9E9E98] mb-2 font-medium">Add Operation Step</span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {OPERATION_TEMPLATES.map((tmpl) => {
                    const Icon = tmpl.icon;
                    return (
                      <button
                        key={tmpl.action}
                        onClick={() => addStep(tmpl)}
                        className="p-2.5 rounded-xl border border-white/5 bg-[#161619] hover:bg-white/5 text-left transition-all active:scale-[0.97] group"
                      >
                        <div className="flex items-center space-x-1.5">
                          <Icon className={`w-3.5 h-3.5 ${tmpl.color}`} />
                          <span className="text-[11px] font-semibold text-white group-hover:text-white truncate">
                            {tmpl.label}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Right Col: Document Upload & Live Pipeline Execution */}
          <div className="space-y-6">
            <div className="p-5 rounded-2xl border border-white/10 bg-[#121214] space-y-4">
              <div className="pb-3 border-b border-white/5">
                <h2 className="text-xs font-semibold text-white">Execute Pipeline</h2>
                <p className="text-[10px] text-[#9E9E98]">Upload a PDF to process through this sequence</p>
              </div>

              {/* File Dropzone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="p-6 rounded-xl border border-dashed border-white/10 hover:border-white/20 bg-[#161619] text-center cursor-pointer transition-all"
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) setInputFile(f);
                  }}
                  accept=".pdf"
                  className="hidden"
                />
                <Layers className="w-6 h-6 mx-auto mb-2 text-[#9E9E98]" />
                {inputFile ? (
                  <div>
                    <span className="text-xs font-semibold text-white truncate max-w-[200px] block mx-auto">
                      {inputFile.name}
                    </span>
                    <span className="text-[10px] text-[#9E9E98]">
                      {(inputFile.size / 1024).toFixed(1)} KB
                    </span>
                  </div>
                ) : (
                  <div>
                    <span className="text-xs font-semibold text-white">Select input document</span>
                    <p className="text-[10px] text-[#9E9E98] mt-0.5">Click or drag & drop PDF</p>
                  </div>
                )}
              </div>

              {/* Execution Error */}
              {executionError && (
                <div className="p-3 rounded-xl border border-rose-900/60 bg-rose-950/20 text-xs text-rose-300 flex items-start space-x-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                  <div>
                    <p className="font-semibold text-[11px]">Execution Failed</p>
                    <p className="text-[10px] text-rose-300 mt-0.5">{executionError}</p>
                  </div>
                </div>
              )}

              {/* Live Step Progress Indicator */}
              {stepExecutions.length > 0 && (
                <div className="p-3.5 rounded-xl border border-white/5 bg-[#161619] space-y-2">
                  <span className="text-[10px] text-[#9E9E98] font-medium block mb-1">Pipeline Telemetry</span>
                  {stepExecutions.map((res) => (
                    <div key={res.step_index} className="flex items-center justify-between text-xs py-1 border-b border-white/5 last:border-0">
                      <div className="flex items-center space-x-2">
                        {res.status === 'COMPLETED' ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        ) : res.status === 'RUNNING' ? (
                          <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin shrink-0" />
                        ) : res.status === 'FAILED' ? (
                          <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                        ) : (
                          <span className="w-3.5 h-3.5 rounded-full bg-white/10 flex items-center justify-center text-[9px] text-[#9E9E98]">
                            {res.step_index}
                          </span>
                        )}
                        <span className="text-white capitalize text-[11px]">{res.action.replace('_', ' ')}</span>
                      </div>
                      <span className="font-mono text-[10px] text-[#9E9E98]">
                        {res.duration_ms ? `${res.duration_ms}ms` : res.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Result Download Card */}
              {executionResult && (
                <div className="p-4 rounded-xl border border-emerald-900/60 bg-emerald-950/20 space-y-3">
                  <div className="flex items-center space-x-2 text-emerald-400 text-xs font-semibold">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Pipeline Completed Successfully</span>
                  </div>
                  <div className="text-[11px] text-[#E8E8E3] space-y-1">
                    <div className="flex justify-between">
                      <span className="text-[#9E9E98]">Output Size:</span>
                      <span className="font-mono">{(executionResult.output_size_bytes / 1024).toFixed(1)} KB</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#9E9E98]">Steps Run:</span>
                      <span>{executionResult.completed_steps} of {executionResult.total_steps}</span>
                    </div>
                  </div>
                  <a
                    href={executionResult.download_url}
                    download={executionResult.output_filename}
                    className="w-full py-2 rounded-xl bg-[#E8E8E3] text-[#111113] hover:bg-white text-xs font-semibold flex items-center justify-center active:scale-[0.97] transition-all"
                  >
                    <Download className="w-3.5 h-3.5 mr-1.5" />
                    Download Processed PDF
                  </a>
                </div>
              )}

              {/* Run Trigger Button */}
              <button
                onClick={handleRunPipeline}
                disabled={isExecuting || !inputFile || steps.length === 0}
                className="w-full py-2.5 rounded-full bg-[#E8E8E3] hover:bg-white disabled:opacity-40 text-[#111113] font-semibold text-xs flex items-center justify-center transition-all active:scale-[0.97] shadow-sm"
              >
                {isExecuting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    Executing Pipeline Steps...
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 mr-1.5 fill-current" />
                    Run Pipeline
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: PRESET BLUEPRINTS */}
      {activeTab === 'presets' && (
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
          {PRESET_BLUEPRINTS.map((preset) => (
            <div key={preset.id} className="p-5 rounded-2xl border border-white/10 bg-[#121214] flex flex-col justify-between space-y-4">
              <div>
                <div className="flex items-center justify-between pb-2 border-b border-white/5">
                  <h3 className="text-sm font-semibold text-white">{preset.name}</h3>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-[#E8E8E3] border border-white/10">
                    {preset.steps.length} Steps
                  </span>
                </div>
                <p className="mt-2 text-xs text-[#9E9E98] leading-relaxed">{preset.description}</p>
                <div className="mt-4 space-y-1.5">
                  {preset.steps.map((st, i) => (
                    <div key={i} className="flex items-center space-x-2 text-xs text-[#E8E8E3] bg-[#161619] p-2 rounded-lg border border-white/5">
                      <span className="w-4 h-4 rounded-full bg-white/10 text-white flex items-center justify-center text-[9px] font-mono">
                        {i + 1}
                      </span>
                      <span className="capitalize text-[11px]">{st.action.replace('_', ' ')}</span>
                    </div>
                  ))}
                </div>
              </div>

              <button
                onClick={() => loadPreset(preset)}
                className="w-full py-2 rounded-xl bg-white/10 hover:bg-white text-white hover:text-[#111113] font-semibold text-xs transition-all active:scale-[0.97]"
              >
                Load Blueprint in Canvas
              </button>
            </div>
          ))}
        </div>
      )}

      {/* TAB 3: SAVED WORKFLOWS FROM POSTGRESQL */}
      {activeTab === 'saved' && (
        <div className="mt-8 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-white/5">
            <div>
              <h2 className="text-xs font-semibold text-white">My Saved Pipelines</h2>
              <p className="text-[10px] text-[#9E9E98]">Pipelines persisted in PostgreSQL across devices</p>
            </div>
            <button
              onClick={loadSavedWorkflows}
              className="p-1.5 rounded-full border border-white/10 bg-[#121214] text-[#9E9E98] hover:text-white"
              title="Refresh"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingSaved ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {savedWorkflows.length === 0 ? (
            <div className="p-12 text-center border border-white/10 rounded-2xl bg-[#121214]">
              <Layers className="w-8 h-8 mx-auto mb-2 text-[#9E9E98]" />
              <h3 className="text-sm font-semibold text-white">No saved pipelines yet</h3>
              <p className="mt-1 text-xs text-[#9E9E98]">
                Design your pipeline in the builder and click "Save Blueprint" to persist it.
              </p>
              <button
                onClick={() => setActiveTab('builder')}
                className="mt-4 px-4 py-1.5 rounded-full bg-[#E8E8E3] text-[#111113] font-semibold text-xs"
              >
                Open Builder
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {savedWorkflows.map((wf) => (
                <div key={wf.id} className="p-4 rounded-xl border border-white/10 bg-[#121214] space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-semibold text-white">{wf.name}</h3>
                      <p className="text-[10px] text-[#9E9E98] truncate max-w-xs">{wf.description || 'No description'}</p>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-[#E8E8E3] border border-white/10">
                      {wf.steps.length} Steps
                    </span>
                  </div>

                  <div className="flex items-center space-x-2 pt-2 border-t border-white/5">
                    <button
                      onClick={() => loadSaved(wf)}
                      className="px-3 py-1 rounded-lg bg-[#E8E8E3] text-[#111113] hover:bg-white text-xs font-semibold transition-all active:scale-[0.97]"
                    >
                      Load in Builder
                    </button>
                    <button
                      onClick={() => handleDuplicate(wf)}
                      className="p-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-[#9E9E98] hover:text-white"
                      title="Duplicate"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => handleDeleteSaved(wf.id, wf.name)}
                      className="p-1.5 rounded-lg border border-rose-950/40 bg-rose-950/20 text-rose-400 hover:text-rose-300"
                      title="Delete"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default WorkflowStudio;
