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
  Stamp,
  Minimize2,
  Lock,
  Unlock,
  FileSearch,
  Eraser,
  RefreshCw,
  FolderLock,
  ChevronDown,
  Check,
  Workflow,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  fetchWorkflows,
  createWorkflow,
  updateWorkflow,
  deleteWorkflow,
  runWorkflowPipeline,
  extractErrorMessage,
} from '../services/api';
import { motionBus } from '../utils/motion';

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
          color: '#D9441F',
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
    verb: 'turn',
    defaultParams: { angle: 90 },
  },
  {
    action: 'watermark',
    label: 'Visible Watermark',
    desc: 'Stamp diagonal text watermark with custom opacity',
    icon: Stamp,
    verb: 'stamp',
    defaultParams: {
      text: 'CONFIDENTIAL',
      font_size: 36,
      opacity: 0.3,
      rotation: 45,
      color: '#D9441F',
    },
  },
  {
    action: 'compress',
    label: 'Compress & Optimize',
    desc: 'Downscale streams and optimize byte structure',
    icon: Minimize2,
    verb: 'press',
    defaultParams: { level: 'medium' },
  },
  {
    action: 'protect',
    label: 'Protect & Encrypt',
    desc: 'Apply AES encryption and password protection',
    icon: Lock,
    verb: 'seal',
    defaultParams: { password: 'SecurePassword123!' },
  },
  {
    action: 'unlock',
    label: 'Decrypt / Unlock',
    desc: 'Remove password restrictions from known PDF',
    icon: Unlock,
    verb: 'unlock',
    defaultParams: { password: '' },
  },
  {
    action: 'scrub_metadata',
    label: 'Scrub Metadata',
    desc: 'Sanitize document author, creation date, and XMP tags',
    icon: Eraser,
    verb: 'scrub',
    defaultParams: {},
  },
  {
    action: 'canary_watermark',
    label: 'Canary Watermark',
    desc: 'Embed invisible zero-width forensic markers to track leaks',
    icon: ShieldCheck,
    verb: 'trace',
    defaultParams: {
      recipient_name: 'Recipient Name',
      organization: 'External Partner',
      tracking_note: 'Pipeline Canary',
    },
  },
  {
    action: 'ocr',
    label: 'OCR Text Recognition',
    desc: 'Generate searchable text layer from rasterized scans',
    icon: FileSearch,
    verb: 'ocr',
    defaultParams: { language: 'eng' },
  },
];

export default function WorkflowStudio() {
  const { isAuthenticated } = useAuth();

  // Tab State: 'builder' | 'saved' | 'presets'
  const [activeTab, setActiveTab] = useState('builder');

  // Active Pipeline Metadata
  const [activeWorkflowId, setActiveWorkflowId] = useState(null);
  const [pipelineName, setPipelineName] = useState('Clean & Secure Distribution');
  const [pipelineDescription, setPipelineDescription] = useState(
    'Sequential scrub -> canary watermark -> compression pipeline'
  );

  // Steps in Current Pipeline
  const [steps, setSteps] = useState([
    { id: 'step-1', action: 'scrub_metadata', params: {} },
    {
      id: 'step-2',
      action: 'canary_watermark',
      params: {
        recipient_name: 'Acme Corp Reviewer',
        organization: 'Due Diligence Group',
        tracking_note: 'Confidential M&A Chaining',
      },
    },
    { id: 'step-3', action: 'compress', params: { level: 'high' } },
  ]);

  // Saved Workflows from Database
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

  // Load Saved Workflows from Backend
  const loadSavedWorkflows = async () => {
    if (!isAuthenticated) return;
    setLoadingSaved(true);
    try {
      const res = await fetchWorkflows();
      setSavedWorkflows(res || []);
    } catch (err) {
      console.error('Failed to load saved workflows:', err);
    } finally {
      setLoadingSaved(false);
    }
  };

  useEffect(() => {
    loadSavedWorkflows();
  }, [isAuthenticated]);

  // Add Step
  const addStep = (template) => {
    if (steps.length >= 10) {
      setNotification('A maximum of 10 sequence steps is permitted per pipeline.');
      return;
    }
    const newStep = {
      id: `step-${Date.now()}`,
      action: template.action,
      params: { ...template.defaultParams },
    };
    setSteps([...steps, newStep]);
    setNotification(`Appended ${template.label} to pipeline sequence.`);
  };

  // Remove Step
  const removeStep = (index) => {
    setSteps(steps.filter((_, idx) => idx !== index));
  };

  // Move Step Up/Down
  const moveStep = (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= steps.length) return;
    const updated = [...steps];
    const temp = updated[index];
    updated[index] = updated[target];
    updated[target] = temp;
    setSteps(updated);
  };

  // Update Parameter for a Step
  const updateStepParam = (stepIndex, paramKey, val) => {
    setSteps((prev) => {
      const next = [...prev];
      next[stepIndex] = {
        ...next[stepIndex],
        params: {
          ...next[stepIndex].params,
          [paramKey]: val,
        },
      };
      return next;
    });
  };

  // Load Preset Blueprint into Canvas
  const loadPreset = (preset) => {
    setActiveWorkflowId(null);
    setPipelineName(preset.name);
    setPipelineDescription(preset.description);
    setSteps(
      preset.steps.map((s, idx) => ({
        id: `preset-step-${idx}-${Date.now()}`,
        action: s.action,
        params: { ...s.params },
      }))
    );
    setActiveTab('builder');
    setNotification(`Loaded blueprint '${preset.name}'.`);
  };

  // Load Saved Workflow into Canvas
  const loadSaved = (wf) => {
    setActiveWorkflowId(wf.id);
    setPipelineName(wf.name);
    setPipelineDescription(wf.description || '');
    setSteps(
      wf.steps.map((s, idx) => ({
        id: `saved-step-${idx}-${Date.now()}`,
        action: s.action,
        params: { ...s.params },
      }))
    );
    setActiveTab('builder');
    setNotification(`Loaded saved blueprint '${wf.name}'.`);
  };

  // Save Pipeline to Account Vault
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
      setNotification(extractErrorMessage(err, 'Failed to save pipeline blueprint.'));
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
    motionBus.emit('pressroom:state', 'processing:generic');

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
      motionBus.emit('pressroom:state', 'success');
      setTimeout(() => {
        motionBus.emit('pressroom:state', 'idle');
      }, 700);
      setExecutionResult(res);
      setStepExecutions(res.step_results || []);
    } catch (err) {
      motionBus.emit('pressroom:state', 'error');
      setTimeout(() => {
        motionBus.emit('pressroom:state', 'idle');
      }, 400);
      console.error('Pipeline execution error:', err);
      const detail = err.response?.data?.detail;
      if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
        setExecutionError(detail.message || detail.msg || extractErrorMessage(err, 'Pipeline failed.'));
        if (detail.step_results) setStepExecutions(detail.step_results);
      } else {
        setExecutionError(extractErrorMessage(err, 'Pipeline execution failed.'));
      }
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div className="min-h-screen bg-paper text-ink pb-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-8 space-y-6">
        {/* Studio Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-rule gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] uppercase tracking-mono text-ink-soft bg-kraft border border-rule px-2 py-0.5 rounded font-semibold">
                Bench Automation
              </span>
              <span className="font-mono text-[11px] text-ink-faint">
                Sequential RAM Pipelining
              </span>
            </div>
            <h1 className="font-display text-2xl sm:text-3xl tracking-tight text-ink mt-1">
              Automated Studio
            </h1>
            <p className="text-xs text-ink-soft mt-0.5">
              Construct multi-operation execution pipelines with automated hand-offs.
            </p>
          </div>

          {/* View Mode Tabs */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('builder')}
              className={`px-3 py-1.5 rounded font-mono text-xs uppercase tracking-mono border transition-colors ${
                activeTab === 'builder'
                  ? 'bg-ink text-paper border-ink font-semibold'
                  : 'bg-vellum text-ink-soft border-rule hover:text-ink'
              }`}
            >
              Pipeline Canvas
            </button>
            <button
              onClick={() => setActiveTab('presets')}
              className={`px-3 py-1.5 rounded font-mono text-xs uppercase tracking-mono border transition-colors ${
                activeTab === 'presets'
                  ? 'bg-ink text-paper border-ink font-semibold'
                  : 'bg-vellum text-ink-soft border-rule hover:text-ink'
              }`}
            >
              Blueprints ({PRESET_BLUEPRINTS.length})
            </button>
            {isAuthenticated && (
              <button
                onClick={() => setActiveTab('saved')}
                className={`px-3 py-1.5 rounded font-mono text-xs uppercase tracking-mono border transition-colors ${
                  activeTab === 'saved'
                    ? 'bg-ink text-paper border-ink font-semibold'
                    : 'bg-vellum text-ink-soft border-rule hover:text-ink'
                }`}
              >
                Saved ({savedWorkflows.length})
              </button>
            )}
          </div>
        </div>

        {/* Notification Toast */}
        {notification && (
          <div className="p-3 rounded border border-rule bg-vellum text-xs text-ink flex items-center justify-between shadow-subtle">
            <span>{notification}</span>
            <button onClick={() => setNotification('')} className="text-ink-soft hover:text-ink">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Unauthenticated Member Prompt */}
        {!isAuthenticated && (
          <div className="p-4 rounded border border-rule bg-kraft/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <ShieldCheck className="w-5 h-5 text-ink-soft shrink-0" />
              <div>
                <p className="text-xs font-semibold text-ink">Member Feature: Cloud Pipeline Blueprints</p>
                <p className="text-[11px] text-ink-soft">
                  Sign in to save custom pipelines to your account, store parameters, and automate document archives.
                </p>
              </div>
            </div>
            <Link
              to="/login"
              className="px-3.5 py-1.5 rounded bg-red text-vellum text-xs font-semibold shrink-0 shadow-ink-button hover:bg-red-dark transition-colors"
            >
              Sign In to Save
            </Link>
          </div>
        )}

        {/* TAB 1: BUILDER & EXECUTION CANVAS */}
        {activeTab === 'builder' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left 8 Cols: Pipeline Sequence Builder */}
            <div className="lg:col-span-8 space-y-6">
              {/* Metadata Card */}
              <div className="p-5 rounded-md border border-rule bg-vellum space-y-3 shadow-subtle">
                <div>
                  <label className="block text-[11px] font-mono uppercase tracking-mono text-ink-faint mb-1">
                    Pipeline Name
                  </label>
                  <input
                    type="text"
                    value={pipelineName}
                    onChange={(e) => setPipelineName(e.target.value)}
                    placeholder="e.g. Clean & Secure Distribution"
                    className="w-full px-3 py-2 rounded border border-rule bg-paper text-base sm:text-sm font-semibold text-ink focus:outline-none focus:ring-2 focus:ring-cyan min-h-[44px]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-mono uppercase tracking-mono text-ink-faint mb-1">
                    Description
                  </label>
                  <input
                    type="text"
                    value={pipelineDescription}
                    onChange={(e) => setPipelineDescription(e.target.value)}
                    placeholder="Brief summary of operations performed..."
                    className="w-full px-3 py-2 rounded border border-rule bg-paper text-base sm:text-xs text-ink-soft focus:outline-none focus:ring-2 focus:ring-cyan min-h-[44px]"
                  />
                </div>
              </div>

              {/* Sequence Steps Canvas */}
              <div className="p-5 rounded-md border border-rule bg-vellum space-y-4 shadow-subtle">
                <div className="flex items-center justify-between pb-3 border-b border-rule">
                  <div>
                    <h2 className="text-xs font-semibold text-ink">
                      Execution Sequence ({steps.length} Steps)
                    </h2>
                    <p className="text-[10px] font-mono text-ink-soft">
                      Steps execute sequentially in-memory from top to bottom
                    </p>
                  </div>
                  {isAuthenticated && (
                    <button
                      onClick={handleSavePipeline}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-rule bg-paper hover:bg-kraft text-ink text-xs font-mono transition-colors"
                    >
                      <Save className="w-3.5 h-3.5 text-ink-soft" />
                      <span>{activeWorkflowId ? 'Update Blueprint' : 'Save Blueprint'}</span>
                    </button>
                  )}
                </div>

                {/* Step Cards List */}
                {steps.length === 0 ? (
                  <div className="p-8 text-center border-2 border-dashed border-rule rounded bg-paper">
                    <p className="text-xs text-ink-soft">Your pipeline has no steps yet.</p>
                    <p className="text-[11px] font-mono text-ink-faint mt-1">
                      Select an operation below to append your first step.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {steps.map((step, idx) => {
                      const tmpl = OPERATION_TEMPLATES.find((t) => t.action === step.action);
                      const StepIcon = tmpl ? tmpl.icon : Layers;
                      return (
                        <div
                          key={step.id}
                          className="p-4 rounded border border-rule bg-paper transition-all shadow-subtle"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <span className="w-5 h-5 rounded border border-rule bg-kraft text-ink flex items-center justify-center text-[10px] font-mono font-semibold shrink-0">
                                {idx + 1}
                              </span>
                              <StepIcon className="w-4 h-4 text-ink shrink-0" strokeWidth={1.5} />
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-semibold text-ink">
                                    {tmpl?.label || step.action}
                                  </span>
                                  <span className="font-mono text-[9px] uppercase px-1 py-0.2 rounded bg-kraft border border-rule text-ink-soft">
                                    {tmpl?.verb || 'op'}
                                  </span>
                                </div>
                                <p className="text-[10px] text-ink-soft">{tmpl?.desc}</p>
                              </div>
                            </div>

                            {/* Step Controls */}
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={() => moveStep(idx, -1)}
                                disabled={idx === 0}
                                className="p-1 rounded border border-rule hover:bg-kraft text-ink-soft disabled:opacity-20"
                                title="Move Up"
                              >
                                <MoveUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => moveStep(idx, 1)}
                                disabled={idx === steps.length - 1}
                                className="p-1 rounded border border-rule hover:bg-kraft text-ink-soft disabled:opacity-20"
                                title="Move Down"
                              >
                                <MoveDown className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => removeStep(idx)}
                                className="p-1 rounded border border-rule hover:bg-red/10 text-red ml-1"
                                title="Remove Step"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* In-Place Parameter Configurators */}
                          <div className="mt-3 pt-3 border-t border-rule/60 text-xs">
                            {step.action === 'rotate' && (
                              <div className="flex items-center gap-2">
                                <span className="text-[11px] font-mono text-ink-soft">Angle:</span>
                                {[90, 180, 270].map((deg) => (
                                  <button
                                    key={deg}
                                    type="button"
                                    onClick={() => updateStepParam(idx, 'angle', deg)}
                                    className={`px-2.5 py-1 rounded text-[11px] font-mono border transition-colors ${
                                      step.params.angle === deg
                                        ? 'bg-kraft border-rule-strong text-ink font-semibold'
                                        : 'bg-vellum border-rule text-ink-soft hover:bg-kraft/50'
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
                                  <label className="block text-[10px] font-mono text-ink-soft mb-0.5">
                                    Stamp Text
                                  </label>
                                  <input
                                    type="text"
                                    value={step.params.text || ''}
                                    onChange={(e) => updateStepParam(idx, 'text', e.target.value)}
                                    className="w-full px-2.5 py-1 rounded border border-rule bg-vellum text-xs text-ink font-mono"
                                  />
                                </div>
                                <div className="flex items-center gap-2 pt-3">
                                  <span className="text-[10px] font-mono text-ink-soft">Opacity:</span>
                                  {[0.15, 0.3, 0.5].map((op) => (
                                    <button
                                      key={op}
                                      type="button"
                                      onClick={() => updateStepParam(idx, 'opacity', op)}
                                      className={`px-2 py-0.5 rounded text-[10px] font-mono border ${
                                        step.params.opacity === op
                                          ? 'bg-kraft border-rule-strong text-ink font-semibold'
                                          : 'bg-vellum border-rule text-ink-soft'
                                      }`}
                                    >
                                      {Math.round(op * 100)}%
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}

                            {step.action === 'compress' && (
                              <div className="flex items-center gap-2">
                                <span className="text-[11px] font-mono text-ink-soft">
                                  Compression Level:
                                </span>
                                {['low', 'medium', 'high'].map((lvl) => (
                                  <button
                                    key={lvl}
                                    type="button"
                                    onClick={() => updateStepParam(idx, 'level', lvl)}
                                    className={`px-2.5 py-1 rounded text-[11px] capitalize font-mono border transition-colors ${
                                      step.params.level === lvl
                                        ? 'bg-kraft border-rule-strong text-ink font-semibold'
                                        : 'bg-vellum border-rule text-ink-soft hover:bg-kraft/50'
                                    }`}
                                  >
                                    {lvl}
                                  </button>
                                ))}
                              </div>
                            )}

                            {step.action === 'protect' && (
                              <div className="max-w-xs">
                                <label className="block text-[10px] font-mono text-ink-soft mb-0.5">
                                  Password
                                </label>
                                <input
                                  type="text"
                                  value={step.params.password || ''}
                                  onChange={(e) => updateStepParam(idx, 'password', e.target.value)}
                                  placeholder="Enter document password"
                                  className="w-full px-2.5 py-1 rounded border border-rule bg-vellum text-xs text-ink font-mono"
                                />
                              </div>
                            )}

                            {step.action === 'unlock' && (
                              <div className="max-w-xs">
                                <label className="block text-[10px] font-mono text-ink-soft mb-0.5">
                                  Decrypt Password
                                </label>
                                <input
                                  type="text"
                                  value={step.params.password || ''}
                                  onChange={(e) => updateStepParam(idx, 'password', e.target.value)}
                                  placeholder="Enter unlock password"
                                  className="w-full px-2.5 py-1 rounded border border-rule bg-vellum text-xs text-ink font-mono"
                                />
                              </div>
                            )}

                            {step.action === 'canary_watermark' && (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <div>
                                  <label className="block text-[10px] font-mono text-ink-soft mb-0.5">
                                    Recipient
                                  </label>
                                  <input
                                    type="text"
                                    value={step.params.recipient_name || ''}
                                    onChange={(e) => updateStepParam(idx, 'recipient_name', e.target.value)}
                                    placeholder="e.g. Partner Group"
                                    className="w-full px-2 py-1 rounded border border-rule bg-vellum text-[11px] text-ink"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[10px] font-mono text-ink-soft mb-0.5">
                                    Organization
                                  </label>
                                  <input
                                    type="text"
                                    value={step.params.organization || ''}
                                    onChange={(e) => updateStepParam(idx, 'organization', e.target.value)}
                                    placeholder="e.g. External Audit"
                                    className="w-full px-2 py-1 rounded border border-rule bg-vellum text-[11px] text-ink"
                                  />
                                </div>
                              </div>
                            )}

                            {step.action === 'scrub_metadata' && (
                              <p className="text-[11px] font-mono text-ink-soft">
                                Author, Producer, and XMP creation timestamps will be completely sanitized.
                              </p>
                            )}

                            {step.action === 'ocr' && (
                              <div className="flex items-center gap-2">
                                <span className="text-[11px] font-mono text-ink-soft">Language:</span>
                                {['eng', 'spa', 'fra', 'deu'].map((lang) => (
                                  <button
                                    key={lang}
                                    type="button"
                                    onClick={() => updateStepParam(idx, 'language', lang)}
                                    className={`px-2 py-0.5 rounded text-[10px] uppercase font-mono border ${
                                      step.params.language === lang
                                        ? 'bg-kraft border-rule-strong text-ink font-semibold'
                                        : 'bg-vellum border-rule text-ink-soft'
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
                <div className="pt-3 border-t border-rule">
                  <span className="block text-[11px] font-mono uppercase tracking-mono text-ink-faint mb-2">
                    Append Operation Step
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {OPERATION_TEMPLATES.map((tmpl) => {
                      const Icon = tmpl.icon;
                      return (
                        <button
                          key={tmpl.action}
                          onClick={() => addStep(tmpl)}
                          className="p-2.5 rounded border border-rule bg-paper hover:bg-kraft text-left transition-colors group"
                        >
                          <div className="flex items-center gap-2">
                            <Icon className="w-3.5 h-3.5 text-ink-soft group-hover:text-ink shrink-0" strokeWidth={1.5} />
                            <span className="text-[11px] font-semibold text-ink truncate">
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

            {/* Right 4 Cols: Document Upload & Live Pipeline Execution */}
            <div className="lg:col-span-4 space-y-6">
              <div className="p-5 rounded-md border border-rule bg-vellum space-y-4 shadow-subtle">
                <div className="pb-3 border-b border-rule">
                  <h2 className="text-xs font-semibold text-ink">Execute Pipeline</h2>
                  <p className="text-[10px] font-mono text-ink-soft">
                    Upload a PDF to process through this sequence
                  </p>
                </div>

                {/* File Dropzone */}
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="p-6 rounded border-2 border-dashed border-rule hover:border-rule-strong bg-paper text-center cursor-pointer transition-colors"
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
                  <Layers className="w-6 h-6 mx-auto mb-2 text-ink-soft" strokeWidth={1.5} />
                  {inputFile ? (
                    <div>
                      <span className="text-xs font-semibold text-ink truncate max-w-[200px] block mx-auto">
                        {inputFile.name}
                      </span>
                      <span className="text-[10px] font-mono text-ink-soft">
                        {(inputFile.size / 1024).toFixed(1)} KB
                      </span>
                    </div>
                  ) : (
                    <div>
                      <span className="text-xs font-semibold text-ink">Select input document</span>
                      <p className="text-[10px] font-mono text-ink-faint mt-0.5">Click to choose PDF</p>
                    </div>
                  )}
                </div>

                {/* Execution Error */}
                {executionError && (
                  <div className="p-3 rounded border border-red/40 bg-red/10 text-xs text-ink flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red" />
                    <div>
                      <p className="font-semibold text-red text-[11px]">Execution Failed</p>
                      <p className="text-[10px] text-ink-soft mt-0.5">{executionError}</p>
                    </div>
                  </div>
                )}

                {/* Live Step Progress Indicator */}
                {stepExecutions.length > 0 && (
                  <div className="p-3.5 rounded border border-rule bg-paper space-y-2">
                    <span className="text-[10px] font-mono uppercase tracking-mono text-ink-faint block mb-1">
                      Pipeline Telemetry
                    </span>
                    {stepExecutions.map((res) => (
                      <div
                        key={res.step_index}
                        className="flex items-center justify-between text-xs py-1 border-b border-rule/50 last:border-0"
                      >
                        <div className="flex items-center gap-2">
                          {res.status === 'COMPLETED' ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-moss shrink-0" />
                          ) : res.status === 'RUNNING' ? (
                            <Loader2 className="w-3.5 h-3.5 text-marigold animate-spin shrink-0" />
                          ) : res.status === 'FAILED' ? (
                            <AlertCircle className="w-3.5 h-3.5 text-red shrink-0" />
                          ) : (
                            <span className="w-3.5 h-3.5 rounded bg-kraft text-ink flex items-center justify-center text-[9px] font-mono">
                              {res.step_index}
                            </span>
                          )}
                          <span className="text-ink capitalize text-[11px]">
                            {res.action.replace('_', ' ')}
                          </span>
                        </div>
                        <span className="font-mono text-[10px] text-ink-soft">
                          {res.duration_ms ? `${res.duration_ms}ms` : res.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Result Download Card */}
                {executionResult && (
                  <div className="p-4 rounded border border-moss/40 bg-moss/10 space-y-3">
                    <div className="flex items-center gap-2 text-moss text-xs font-semibold">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Pipeline Completed Successfully</span>
                    </div>
                    <div className="text-[11px] font-mono text-ink-soft space-y-1">
                      <div className="flex justify-between">
                        <span>Output Size:</span>
                        <span className="text-ink font-semibold">
                          {(executionResult.output_size_bytes / 1024).toFixed(1)} KB
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Steps Run:</span>
                        <span className="text-ink">
                          {executionResult.completed_steps} of {executionResult.total_steps}
                        </span>
                      </div>
                    </div>
                    <a
                      href={executionResult.download_url}
                      download={executionResult.output_filename}
                      className="w-full py-2 rounded bg-ink text-paper text-xs font-semibold flex items-center justify-center hover:bg-ink-soft transition-colors"
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
                  className="w-full py-2.5 rounded bg-red text-vellum font-semibold text-xs tracking-tight hover:bg-red-dark transition-all duration-120 shadow-ink-button active:translate-y-px flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {isExecuting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Executing Sequence...</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Run Pipeline Sequence</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: PRESET BLUEPRINTS */}
        {activeTab === 'presets' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {PRESET_BLUEPRINTS.map((preset) => (
              <div
                key={preset.id}
                className="p-5 rounded border border-rule bg-vellum flex flex-col justify-between space-y-4 shadow-subtle"
              >
                <div>
                  <div className="flex items-center justify-between pb-2 border-b border-rule">
                    <h3 className="font-display text-base text-ink">{preset.name}</h3>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-kraft border border-rule text-ink-soft">
                      {preset.steps.length} Steps
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-ink-soft leading-relaxed">
                    {preset.description}
                  </p>
                  <div className="mt-4 space-y-1.5">
                    {preset.steps.map((st, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 text-xs text-ink bg-paper p-2 rounded border border-rule font-mono text-[11px]"
                      >
                        <span className="w-4 h-4 rounded bg-kraft text-ink flex items-center justify-center text-[9px]">
                          {i + 1}
                        </span>
                        <span className="capitalize">{st.action.replace('_', ' ')}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  onClick={() => loadPreset(preset)}
                  className="w-full py-2 rounded border border-rule bg-paper hover:bg-kraft text-ink font-semibold text-xs transition-colors"
                >
                  Load Blueprint in Canvas
                </button>
              </div>
            ))}
          </div>
        )}

        {/* TAB 3: SAVED WORKFLOWS */}
        {activeTab === 'saved' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-rule">
              <div>
                <h2 className="text-xs font-semibold text-ink">My Saved Pipelines</h2>
                <p className="text-[10px] font-mono text-ink-soft">
                  Pipelines saved across all your sessions and devices
                </p>
              </div>
              <button
                onClick={loadSavedWorkflows}
                className="p-1.5 rounded border border-rule bg-vellum hover:bg-kraft text-ink-soft hover:text-ink"
                title="Refresh"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingSaved ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {savedWorkflows.length === 0 ? (
              <div className="p-12 text-center border-2 border-dashed border-rule rounded-md bg-vellum space-y-3">
                <Workflow className="w-8 h-8 mx-auto text-ink-soft" strokeWidth={1.5} />
                <h3 className="font-display text-base text-ink">No saved pipelines yet</h3>
                <p className="text-xs text-ink-soft max-w-sm mx-auto">
                  Design your pipeline in the builder canvas and click "Save Blueprint" to persist it.
                </p>
                <button
                  onClick={() => setActiveTab('builder')}
                  className="mt-2 px-4 py-1.5 rounded bg-red text-vellum font-semibold text-xs shadow-ink-button"
                >
                  Open Canvas
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {savedWorkflows.map((wf) => (
                  <div
                    key={wf.id}
                    className="p-4 rounded border border-rule bg-vellum space-y-3 shadow-subtle"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-xs font-semibold text-ink">{wf.name}</h3>
                        <p className="text-[10px] text-ink-soft truncate max-w-xs">
                          {wf.description || 'No description'}
                        </p>
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-kraft border border-rule text-ink-soft">
                        {wf.steps.length} Steps
                      </span>
                    </div>

                    <div className="flex items-center gap-2 pt-2 border-t border-rule">
                      <button
                        onClick={() => loadSaved(wf)}
                        className="px-3 py-1 rounded bg-ink text-paper text-xs font-semibold hover:bg-ink-soft transition-colors"
                      >
                        Load in Canvas
                      </button>
                      <button
                        onClick={() => handleDuplicate(wf)}
                        className="p-1.5 rounded border border-rule bg-paper hover:bg-kraft text-ink-soft hover:text-ink"
                        title="Duplicate"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => handleDeleteSaved(wf.id, wf.name)}
                        className="p-1.5 rounded border border-rule hover:border-red/40 bg-paper hover:bg-red/10 text-red"
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
    </div>
  );
}
