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

export default api;
