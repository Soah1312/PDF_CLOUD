// Lazy-loaded PDF.js thumbnail renderer with in-memory canvas cache

const thumbnailCache = new Map();
let pdfjsLib = null;

async function getPdfjs() {
  if (pdfjsLib) return pdfjsLib;
  try {
    const pdfjs = await import('pdfjs-dist/build/pdf');
    // Set worker from unpkg or local build if worker is available
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
 * Render thumbnail data URL for a given File and page number
 */
export async function renderPdfThumbnail(file, pageNumber = 1, scale = 0.4) {
  const cacheKey = `${file.name}-${file.size}-${file.lastModified}-${pageNumber}`;
  if (thumbnailCache.has(cacheKey)) {
    return thumbnailCache.get(cacheKey);
  }

  try {
    const pdfjs = await getPdfjs();
    if (!pdfjs) return null;

    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
    const pdfDoc = await loadingTask.promise;

    if (pageNumber > pdfDoc.numPages) {
      return null;
    }

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

    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    thumbnailCache.set(cacheKey, dataUrl);
    return dataUrl;
  } catch (err) {
    console.warn(`Failed to render thumbnail for ${file.name} page ${pageNumber}:`, err);
    return null;
  }
}

/**
 * Get total page count from a PDF file using PDF.js
 */
export async function getPdfPageCount(file) {
  try {
    const pdfjs = await getPdfjs();
    if (!pdfjs) return 1;
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
    const pdfDoc = await loadingTask.promise;
    return pdfDoc.numPages;
  } catch (err) {
    return 1;
  }
}
