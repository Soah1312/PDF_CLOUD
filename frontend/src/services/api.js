import axios from 'axios';

// Create configured Axios instance
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
  timeout: 60000, // 60s for processing large files
});

// Request Interceptor: Attach Cognito JWT Bearer token if present & Guest Session ID
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('cloudpdf_auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Attach guest session ID if stored
    const guestSession = sessionStorage.getItem('cloudpdf_guest_session_id');
    if (guestSession && !token) {
      config.headers['X-Guest-Session-ID'] = guestSession;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor: Capture X-Guest-Session-ID header
api.interceptors.response.use(
  (response) => {
    const newGuestSession = response.headers['x-guest-session-id'];
    if (newGuestSession) {
      sessionStorage.setItem('cloudpdf_guest_session_id', newGuestSession);
    }
    return response;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Health & Telemetry
export const checkHealth = async () => {
  const response = await api.get('/api/health');
  return response.data;
};

// Auth and Profile APIs
export const fetchAuthConfig = async () => {
  const response = await api.get('/api/v1/auth/config');
  return response.data;
};

export const fetchCurrentUser = async () => {
  const response = await api.get('/api/v1/auth/me');
  return response.data;
};

export const syncUserProfile = async () => {
  const response = await api.post('/api/v1/auth/sync');
  return response.data;
};

export const fetchSessionContext = async () => {
  const response = await api.get('/api/v1/auth/session-context');
  return response.data;
};

// File Management APIs
export const uploadFile = async (file) => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await api.post('/api/v1/files/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};

export const fetchFiles = async () => {
  const response = await api.get('/api/v1/files');
  return response.data;
};

export const deleteFile = async (fileId) => {
  const response = await api.delete(`/api/v1/files/${fileId}`);
  return response.data;
};

export const fetchHistory = async () => {
  const response = await api.get('/api/v1/history');
  return response.data;
};

// PDF Processing Engine APIs
export const processMergePDF = async (formData) => {
  const response = await api.post('/api/v1/pdf/merge', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};

export const processSplitPDF = async (formData) => {
  const response = await api.post('/api/v1/pdf/split', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};

export const processRotatePDF = async (formData) => {
  const response = await api.post('/api/v1/pdf/rotate', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};

export const processProtectPDF = async (formData) => {
  const response = await api.post('/api/v1/pdf/protect', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};

export const processCompressPDF = async (formData) => {
  const response = await api.post('/api/v1/pdf/compress', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};

export const processWatermarkPDF = async (formData) => {
  const response = await api.post('/api/v1/pdf/watermark', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};

export const processPdfToImages = async (formData) => {
  const response = await api.post('/api/v1/pdf/to-images', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};

export const processImagesToPdf = async (formData) => {
  const response = await api.post('/api/v1/pdf/from-images', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};

export const processPdfToWord = async (formData) => {
  const response = await api.post('/api/v1/pdf/to-word', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};

export const processWordToPdf = async (formData) => {
  const response = await api.post('/api/v1/pdf/from-word', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};

// --- Invisible Canary Watermark API ---
export const embedCanaryWatermark = async (formData) => {
  const response = await api.post('/api/v1/canary/embed', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};

export const verifyCanaryDocument = async (formData) => {
  const response = await api.post('/api/v1/canary/verify', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};

export const fetchCanaryTokens = async () => {
  const response = await api.get('/api/v1/canary/tokens');
  return response.data;
};

export const fetchCanaryToken = async (tokenId) => {
  const response = await api.get(`/api/v1/canary/tokens/${tokenId}`);
  return response.data;
};

export const revokeCanaryToken = async (tokenId) => {
  const response = await api.post(`/api/v1/canary/tokens/${tokenId}/revoke`);
  return response.data;
};

// --- Automated Workflow Studio API ---
export const fetchWorkflows = async () => {
  const response = await api.get('/api/v1/workflows');
  return response.data;
};

export const fetchWorkflow = async (workflowId) => {
  const response = await api.get(`/api/v1/workflows/${workflowId}`);
  return response.data;
};

export const createWorkflow = async (data) => {
  const response = await api.post('/api/v1/workflows', data);
  return response.data;
};

export const updateWorkflow = async (workflowId, data) => {
  const response = await api.put(`/api/v1/workflows/${workflowId}`, data);
  return response.data;
};

export const deleteWorkflow = async (workflowId) => {
  const response = await api.delete(`/api/v1/workflows/${workflowId}`);
  return response.data;
};

export const runWorkflowPipeline = async (formData) => {
  const response = await api.post('/api/v1/workflows/run', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};

export const fetchWorkflowExecution = async (executionId) => {
  const response = await api.get(`/api/v1/workflows/executions/${executionId}`);
  return response.data;
};

// --- OCRmyPDF & Tesseract OCR Studio APIs ---
export const inspectPdfOcr = async (file) => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await api.post('/api/v1/ocr/inspect', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};

export const createSearchablePdf = async (file, forceOcr = false, language = 'eng') => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('force_ocr', forceOcr ? 'true' : 'false');
  formData.append('language', language);
  const response = await api.post('/api/v1/ocr/searchable', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};

export const getOcrJobStatus = async (jobId) => {
  const response = await api.get(`/api/v1/ocr/jobs/${jobId}`);
  return response.data;
};

export const downloadOcrPdf = async (jobId, filename = 'searchable_document.pdf') => {
  const response = await api.get(`/api/v1/ocr/jobs/${jobId}/download`, {
    responseType: 'blob',
  });
  const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
  return true;
};

export const fetchOcrJobs = async () => {
  const response = await api.get('/api/v1/ocr/jobs');
  return response.data;
};

export default api;
