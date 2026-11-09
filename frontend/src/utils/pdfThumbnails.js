// Lazy-loaded PDF.js thumbnail & document renderer with in-memory canvas cache

const thumbnailCache = new Map();
let pdfjsLib = null;

export async function getPdfjs() {
  if (pdfjsLib) return pdfjsLib;
  try {
    const pdfjs = await import('pdfjs-dist/build/pdf');
    if (!pdfjs.GlobalWorkerOptions.workerSrc) {
      pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version || '3.11.174'}/pdf.worker.min.js`;
    }
    pdfjsLib = pdfjs;
    return pdfjsLib;
  } catch (err) {
    console.warn('PDF.js dynamic import failed, falling back to paper mockup thumbnail', err);
    return null;
  }
}

/**
 * Loads a PDF document instance from File, Blob, ArrayBuffer, or URL
 */
export async function loadPdfDocument(source) {
  const pdfjs = await getPdfjs();
  if (!pdfjs) return null;

  try {
    if (typeof source === 'string') {
      // It's a URL. If it's an API route, attach token if present
      const token = localStorage.getItem('cloudpdf_auth_token');
      const headers = token && source.startsWith('/api') ? { Authorization: `Bearer ${token}` } : {};
      const loadingTask = pdfjs.getDocument({
        url: source,
        httpHeaders: headers,
        withCredentials: false,
      });
      return await loadingTask.promise;
    } else if (source instanceof File || source instanceof Blob) {
      const arrayBuffer = await source.arrayBuffer();
      const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
      return await loadingTask.promise;
    } else if (source instanceof ArrayBuffer || source?.buffer instanceof ArrayBuffer) {
      const data = source instanceof ArrayBuffer ? source : source.buffer;
      const loadingTask = pdfjs.getDocument({ data });
      return await loadingTask.promise;
    }
    return null;
  } catch (err) {
    console.warn('Failed to load PDF document with PDF.js:', err);
    return null;
  }
}

/**
 * Render a specific page onto an existing HTML5 canvas element
 */
export async function renderPdfPageToCanvas(pdfDoc, pageNumber, canvas, scale = 1.0) {
  if (!pdfDoc || !canvas) return null;
  try {
    const page = await pdfDoc.getPage(pageNumber);
    const pixelRatio = window.devicePixelRatio || 1;
    const viewport = page.getViewport({ scale: scale * pixelRatio });

    canvas.width = viewport.width;
    canvas.height = viewport.height;
    canvas.style.width = `${viewport.width / pixelRatio}px`;
    canvas.style.height = `${viewport.height / pixelRatio}px`;

    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    await page.render({
      canvasContext: ctx,
      viewport,
    }).promise;

    return {
      width: viewport.width / pixelRatio,
      height: viewport.height / pixelRatio,
    };
  } catch (err) {
    console.warn(`Failed to render page ${pageNumber} to canvas:`, err);
    return null;
  }
}

/**
 * Render thumbnail data URL for a given File, Blob, or URL and page number
 */
export async function renderPdfThumbnail(source, pageNumber = 1, scale = 0.35) {
  const isFile = source instanceof File;
  const cacheKey = isFile
    ? `${source.name}-${source.size}-${source.lastModified}-${pageNumber}`
    : typeof source === 'string'
    ? `${source}-${pageNumber}`
    : null;

  if (cacheKey && thumbnailCache.has(cacheKey)) {
    return thumbnailCache.get(cacheKey);
  }

  try {
    const pdfDoc = await loadPdfDocument(source);
    if (!pdfDoc || pageNumber > pdfDoc.numPages) return null;

    const page = await pdfDoc.getPage(pageNumber);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({
      canvasContext: ctx,
      viewport,
    }).promise;

    const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
    if (cacheKey) thumbnailCache.set(cacheKey, dataUrl);
    return dataUrl;
  } catch (err) {
    console.warn('Failed to render thumbnail:', err);
    return null;
  }
}

/**
 * Get total page count from a PDF file or source
 */
export async function getPdfPageCount(source) {
  try {
    const pdfDoc = await loadPdfDocument(source);
    return pdfDoc ? pdfDoc.numPages : 1;
  } catch (err) {
    return 1;
  }
}
