/**
 * Tab Title and Favicon Progress Ring Utility
 * 
 * Dynamically draws an offscreen canvas ring indicating percentage completion
 * and updates document.title during processing.
 */

let originalTitle = typeof document !== 'undefined' ? document.title : 'CloudPDF — The Bindery';
let originalFavicon = '/favicon.svg';
let canvas = null;

function getFaviconLink() {
  if (typeof document === 'undefined') return null;
  let link = document.querySelector("link[rel*='icon']");
  if (!link) {
    link = document.createElement('link');
    link.type = 'image/svg+xml';
    link.rel = 'icon';
    document.getElementsByTagName('head')[0].appendChild(link);
  }
  return link;
}

export function updateTabProgress(pct) {
  if (typeof document === 'undefined') return;

  const validPct = Math.max(0, Math.min(100, Math.round(pct)));
  document.title = `${validPct}% — CloudPDF`;

  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
  }

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 32, 32);

  const cx = 16;
  const cy = 16;
  const radius = 12;
  const lineWidth = 3.5;

  // Background track ring
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.strokeStyle = '#E4D7BE';
  ctx.lineWidth = lineWidth;
  ctx.stroke();

  // Vermillion Red progress arc
  const startAngle = -Math.PI / 2;
  const endAngle = startAngle + (Math.PI * 2 * (validPct / 100));

  ctx.beginPath();
  ctx.arc(cx, cy, radius, startAngle, endAngle, false);
  ctx.strokeStyle = '#D9441F';
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.stroke();

  // Update favicon link
  const link = getFaviconLink();
  if (link) {
    link.type = 'image/png';
    link.href = canvas.toDataURL('image/png');
  }
}

export function restoreTabProgress() {
  if (typeof document === 'undefined') return;
  document.title = 'CloudPDF — The Bindery';
  const link = getFaviconLink();
  if (link) {
    link.type = 'image/svg+xml';
    link.href = originalFavicon;
  }
}
