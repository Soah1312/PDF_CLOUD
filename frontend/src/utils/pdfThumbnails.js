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
 * Render a specific page onto an existing HTML5 canvas element with orientation-aware auto-fit
 */
export async function renderPdfPageToCanvas(
  pdfDoc,
  pageNumber,
  canvas,
  scale = 1.0,
  container = null,
  userRotation = 0
) {
  if (!pdfDoc || !canvas) return null;
  try {
    const page = await pdfDoc.getPage(pageNumber);
    const pixelRatio = window.devicePixelRatio || 1;

    // Combined rotation: native page rotation + custom user view rotation
    const rotation = ((page.rotate || 0) + (userRotation || 0)) % 360;

    // Unscaled 1.0 viewport to determine true aspect ratio and orientation
    const unscaledViewport = page.getViewport({ scale: 1.0, rotation });
    const pageWidth = unscaledViewport.width;
    const pageHeight = unscaledViewport.height;
    const isLandscape = pageWidth > pageHeight;

    // Calculate available bounds from container if provided
    let containerWidth = 560;
    let containerHeight = 440;
    if (container) {
      const rect = container.getBoundingClientRect();
      const rawW = rect.width || container.clientWidth || 560;
      const rawH = rect.height || container.clientHeight || 440;
      containerWidth = Math.max(240, rawW - 32);
      // Cap height calculation so flexible containers don't stretch indefinitely
      containerHeight = Math.max(240, Math.min(rawH > 100 ? rawH - 32 : 440, 560));
    }

    // Proportional auto-fit scale: fits both portrait & landscape pages inside the viewport
    const scaleX = containerWidth / pageWidth;
    const scaleY = containerHeight / pageHeight;
    const baseFitScale = Math.min(scaleX, scaleY);

    // Multiply user zoom scale (1.0 = 100% fit, 1.2 = 120% zoom, etc.)
    const userScale = scale || 1.0;
    const effectiveScale = Math.max(0.1, baseFitScale * userScale);
    const viewport = page.getViewport({ scale: effectiveScale * pixelRatio, rotation });

    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);

    const displayWidth = Math.round(viewport.width / pixelRatio);
    const displayHeight = Math.round(viewport.height / pixelRatio);

    canvas.style.width = `${displayWidth}px`;
    canvas.style.height = `${displayHeight}px`;

    // At fit scale (<= 1.05), enforce containment so it never bleeds or pushes borders
    if (userScale <= 1.05) {
      canvas.style.maxWidth = '100%';
      canvas.style.maxHeight = '100%';
    } else {
      canvas.style.maxWidth = 'none';
      canvas.style.maxHeight = 'none';
    }
    canvas.style.objectFit = 'contain';

    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    await page.render({
      canvasContext: ctx,
      viewport,
    }).promise;

    return {
      width: displayWidth,
      height: displayHeight,
      isLandscape,
      pageWidth,
      pageHeight,
      baseFitScale,
      rotation,
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
