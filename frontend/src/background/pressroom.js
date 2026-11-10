/**
 * The Press Room — Reactive Background Layer for CloudPDF ("The Bindery")
 * 
 * Features:
 * - 10-14 oversized folio sheets in 3 depth layers (far, mid, near)
 * - Single rAF loop for idle drift with randomized phase (60-90s cycle)
 * - Pointer parallax for fine pointers (4/10/18px smoothed with lerp)
 * - Passive DeviceOrientation tilt on touch if already permitted (no prompts)
 * - Diagonal warm window light translation
 * - Full state reaction engine (idle, dragover, dropped, processing:*, success, error)
 * - Performance: pauses when document.hidden, throttles to 30fps if concurrency <= 4,
 *   5 sheets on mobile, static on prefers-reduced-motion, will-change only on layer containers.
 */

import { lerp, clamp, isReducedMotion, motionBus } from '../utils/motion.js';

class PressRoomController {
  constructor() {
    this.container = null;
    this.layers = [];
    this.sheets = [];
    this.windowLightEl = null;
    this.pulseEl = null;

    this.state = 'idle';
    this.rafId = null;
    this.lastFrameTime = 0;
    this.startTime = performance.now();

    // Parallax tracking
    this.targetParallaxX = 0;
    this.targetParallaxY = 0;
    this.currentParallaxX = 0;
    this.currentParallaxY = 0;

    // State reaction animation parameters
    this.stateTargetProgress = 0;
    this.stateCurrentProgress = 0;
    this.squaringUpTime = 0;
    this.errorFreezeUntil = 0;
    this.isDesaturated = false;

    // Device & performance flags
    this.isMobile = false;
    this.targetFps = 60;
    this.frameInterval = 1000 / 60;
    this.isDestroyed = false;

    // Event listener bindings
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handleOrientation = this.handleOrientation.bind(this);
    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
    this.handleResize = this.handleResize.bind(this);
    this.renderLoop = this.renderLoop.bind(this);
  }

  init(containerElement) {
    if (typeof window === 'undefined') return;
    this.container = containerElement || document.getElementById('pressroom-canvas-container');
    if (!this.container) return;

    this.isDestroyed = false;
    this.container.innerHTML = '';
    this.container.setAttribute('aria-hidden', 'true');
    this.container.style.position = 'fixed';
    this.container.style.inset = '0';
    this.container.style.pointerEvents = 'none';
    this.container.style.overflow = 'hidden';
    this.container.style.zIndex = '0';
    this.container.style.transition = 'filter 320ms cubic-bezier(0.2, 0.8, 0.2, 1)';

    const width = window.innerWidth;
    const height = window.innerHeight;
    this.isMobile = width < 768 || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);

    const concurrency = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4;
    if (concurrency <= 4) {
      this.targetFps = 30;
      this.frameInterval = 1000 / 30;
    } else {
      this.targetFps = 60;
      this.frameInterval = 1000 / 60;
    }

    // Build the 3 depth layer containers
    this.layers = [];
    const layerDepths = [
      { name: 'far', maxShift: 4, strokeOpacity: 0.03 },
      { name: 'mid', maxShift: 10, strokeOpacity: 0.045 },
      { name: 'near', maxShift: 18, strokeOpacity: 0.06 },
    ];

    layerDepths.forEach((depthConfig, idx) => {
      const layerEl = document.createElement('div');
      layerEl.className = `pressroom-layer pressroom-layer-${depthConfig.name}`;
      layerEl.style.position = 'absolute';
      layerEl.style.inset = '0';
      layerEl.style.pointerEvents = 'none';
      layerEl.style.willChange = 'transform';
      this.container.appendChild(layerEl);

      this.layers.push({
        el: layerEl,
        ...depthConfig,
        currentX: 0,
        currentY: 0,
      });
    });

    // Generate folio sheets
    this.buildFolioSheets(width, height);

    // Warm Window Light diagonal element
    this.windowLightEl = document.createElement('div');
    this.windowLightEl.className = 'window-light-band';
    this.container.appendChild(this.windowLightEl);

    // Success light pulse element
    this.pulseEl = document.createElement('div');
    this.pulseEl.style.position = 'absolute';
    this.pulseEl.style.inset = '0';
    this.pulseEl.style.background = 'radial-gradient(circle at 50% 50%, rgba(250, 246, 236, 0.85) 0%, rgba(240, 180, 41, 0.2) 40%, transparent 75%)';
    this.pulseEl.style.opacity = '0';
    this.pulseEl.style.pointerEvents = 'none';
    this.pulseEl.style.transition = 'opacity 700ms cubic-bezier(0.2, 0.8, 0.2, 1)';
    this.container.appendChild(this.pulseEl);

    // Reduced motion check: if reduced motion, keep static composition and do not start drift rAF
    if (isReducedMotion()) {
      this.renderStatic();
      return;
    }

    // Listeners
    if (!this.isMobile && window.matchMedia('(pointer: fine)').matches) {
      window.addEventListener('pointermove', this.handlePointerMove, { passive: true });
    } else if (typeof window.DeviceOrientationEvent !== 'undefined') {
      // Passive check if orientation is already available (no prompt!)
      if (typeof DeviceOrientationEvent.requestPermission !== 'function') {
        window.addEventListener('deviceorientation', this.handleOrientation, { passive: true });
      }
    }

    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    window.addEventListener('resize', this.handleResize, { passive: true });

    // Connect to global motion event bus for automatic state updates
    this.busUnsub = motionBus.on('pressroom:state', (newState) => {
      this.setState(newState);
    });

    // Start single rAF loop
    this.lastFrameTime = performance.now();
    this.rafId = requestAnimationFrame(this.renderLoop);
  }

  buildFolioSheets(viewportW, viewportH) {
    this.sheets = [];
    const count = this.isMobile ? 5 : 12;

    // Define folio compositions with balanced print-room layout
    const folioBlueprints = [
      // Far layer
      { layer: 0, w: 320, h: 460, xPct: 8, yPct: 6, rot: -2.2, num: 'FOLIO 01', lines: 6 },
      { layer: 0, w: 360, h: 510, xPct: 68, yPct: 12, rot: 1.8, num: 'FOLIO 02', lines: 7 },
      { layer: 0, w: 290, h: 420, xPct: 12, yPct: 58, rot: 2.4, num: 'FOLIO 03', lines: 5 },
      { layer: 0, w: 340, h: 490, xPct: 74, yPct: 54, rot: -1.6, num: 'FOLIO 04', lines: 6 },

      // Mid layer
      { layer: 1, w: 380, h: 540, xPct: 22, yPct: 18, rot: 1.2, num: 'FOLIO 05', lines: 7 },
      { layer: 1, w: 420, h: 580, xPct: 54, yPct: 24, rot: -2.8, num: 'FOLIO 06', lines: 8 },
      { layer: 1, w: 350, h: 500, xPct: 26, yPct: 48, rot: -1.1, num: 'FOLIO 07', lines: 6 },
      { layer: 1, w: 400, h: 560, xPct: 58, yPct: 60, rot: 2.1, num: 'FOLIO 08', lines: 7 },

      // Near layer
      { layer: 2, w: 460, h: 640, xPct: -4, yPct: 30, rot: 2.6, num: 'FOLIO 09', lines: 8 },
      { layer: 2, w: 480, h: 660, xPct: 82, yPct: 35, rot: -2.3, num: 'FOLIO 10', lines: 9 },
      { layer: 2, w: 430, h: 600, xPct: 38, yPct: -6, rot: -1.4, num: 'FOLIO 11', lines: 7 },
      { layer: 2, w: 440, h: 620, xPct: 42, yPct: 70, rot: 1.5, num: 'FOLIO 12', lines: 8 },
    ];

    const selectedBlueprints = folioBlueprints.slice(0, count);

    selectedBlueprints.forEach((bp, index) => {
      const layerObj = this.layers[bp.layer] || this.layers[0];
      const strokeColor = `rgba(36, 27, 20, ${layerObj.strokeOpacity})`;
      const faintColor = `rgba(36, 27, 20, ${layerObj.strokeOpacity * 0.6})`;

      // Create inline SVG element for the oversized folio sheet
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', bp.w);
      svg.setAttribute('height', bp.h);
      svg.setAttribute('viewBox', `0 0 ${bp.w} ${bp.h}`);
      svg.setAttribute('fill', 'none');
      svg.setAttribute('aria-hidden', 'true');
      svg.style.position = 'absolute';
      svg.style.left = `${bp.xPct}vw`;
      svg.style.top = `${bp.yPct}vh`;
      svg.style.pointerEvents = 'none';

      // Outer folio rectangle (no fill, outlined)
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', '16');
      rect.setAttribute('y', '16');
      rect.setAttribute('width', bp.w - 32);
      rect.setAttribute('height', bp.h - 32);
      rect.setAttribute('rx', '4');
      rect.setAttribute('stroke', strokeColor);
      rect.setAttribute('stroke-width', '1.2');
      svg.appendChild(rect);

      // Crop marks at 4 corners
      const markLength = 12;
      const cropCoords = [
        { x: 16, y: 16 },
        { x: bp.w - 16, y: 16 },
        { x: 16, y: bp.h - 16 },
        { x: bp.w - 16, y: bp.h - 16 },
      ];

      cropCoords.forEach((pt) => {
        // Horizontal mark
        const hLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        hLine.setAttribute('x1', pt.x - markLength);
        hLine.setAttribute('y1', pt.y);
        hLine.setAttribute('x2', pt.x + markLength);
        hLine.setAttribute('y2', pt.y);
        hLine.setAttribute('stroke', strokeColor);
        hLine.setAttribute('stroke-width', '1');
        svg.appendChild(hLine);

        // Vertical mark
        const vLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        vLine.setAttribute('x1', pt.x);
        vLine.setAttribute('y1', pt.y - markLength);
        vLine.setAttribute('x2', pt.x);
        vLine.setAttribute('y2', pt.y + markLength);
        vLine.setAttribute('stroke', strokeColor);
        vLine.setAttribute('stroke-width', '1');
        svg.appendChild(vLine);
      });

      // Ruled lines inside sheet
      const lineSpacing = (bp.h - 80) / (bp.lines + 1);
      for (let l = 1; l <= bp.lines; l++) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        const ly = 40 + l * lineSpacing;
        const lineRight = bp.w - (l % 2 === 0 ? 50 : 36);
        line.setAttribute('x1', '36');
        line.setAttribute('y1', ly);
        line.setAttribute('x2', lineRight);
        line.setAttribute('y2', ly);
        line.setAttribute('stroke', faintColor);
        line.setAttribute('stroke-width', '1');
        line.setAttribute('stroke-linecap', 'round');
        svg.appendChild(line);
      }

      // Page number in tiny mono font
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', bp.w - 32);
      text.setAttribute('y', bp.h - 26);
      text.setAttribute('text-anchor', 'end');
      text.setAttribute('font-family', "'Martian Mono', monospace");
      text.setAttribute('font-size', '8.5');
      text.setAttribute('fill', strokeColor);
      text.setAttribute('letter-spacing', '0.08em');
      text.textContent = bp.num;
      svg.appendChild(text);

      layerObj.el.appendChild(svg);

      // Randomized drift loop parameters (60-90s)
      this.sheets.push({
        el: svg,
        layerIdx: bp.layer,
        baseX: bp.xPct,
        baseY: bp.yPct,
        baseRot: bp.rot,
        baseWidth: bp.w,
        baseHeight: bp.h,
        // Individual cycle durations and phase offsets
        durX: 60 + Math.random() * 30,
        durY: 65 + Math.random() * 25,
        durRot: 70 + Math.random() * 20,
        phaseX: Math.random() * Math.PI * 2,
        phaseY: Math.random() * Math.PI * 2,
        phaseRot: Math.random() * Math.PI * 2,
      });
    });
  }

  handlePointerMove(e) {
    if (this.isDestroyed || isReducedMotion()) return;
    const w = window.innerWidth || 1920;
    const h = window.innerHeight || 1080;
    this.targetParallaxX = ((e.clientX / w) - 0.5) * 2;
    this.targetParallaxY = ((e.clientY / h) - 0.5) * 2;
  }

  handleOrientation(e) {
    if (this.isDestroyed || isReducedMotion()) return;
    if (e.gamma !== null && e.beta !== null) {
      // Gentle tilt from gyro: clamp gamma [-25, 25] and beta [-25, 25]
      this.targetParallaxX = clamp(e.gamma / 25, -1, 1);
      this.targetParallaxY = clamp(e.beta / 25, -1, 1);
    }
  }

  handleVisibilityChange() {
    if (document.hidden) {
      if (this.rafId) {
        cancelAnimationFrame(this.rafId);
        this.rafId = null;
      }
    } else {
      if (!this.rafId && !this.isDestroyed && !isReducedMotion()) {
        this.lastFrameTime = performance.now();
        this.rafId = requestAnimationFrame(this.renderLoop);
      }
    }
  }

  handleResize() {
    if (this.isDestroyed) return;
    const width = window.innerWidth;
    const nowMobile = width < 768;
    if (nowMobile !== this.isMobile) {
      this.isMobile = nowMobile;
      if (this.container) {
        this.layers.forEach((l) => (l.el.innerHTML = ''));
        this.buildFolioSheets(width, window.innerHeight);
      }
    }
  }

  setState(newState) {
    if (this.isDestroyed) return;
    this.state = newState;

    if (isReducedMotion()) {
      // In reduced-motion mode, brief opacity fade only
      if (this.container) {
        this.container.style.opacity = newState === 'dragover' ? '0.9' : '1';
      }
      return;
    }

    const now = performance.now();

    if (newState === 'dropped') {
      this.squaringUpTime = now;
    } else if (newState === 'error') {
      this.errorFreezeUntil = now + 400;
      if (this.container) {
        this.container.style.filter = 'saturate(0.5)';
        setTimeout(() => {
          if (this.container) this.container.style.filter = '';
        }, 400);
      }
    } else if (newState === 'success') {
      if (this.pulseEl) {
        this.pulseEl.style.opacity = '0.35';
        setTimeout(() => {
          if (this.pulseEl) this.pulseEl.style.opacity = '0';
        }, 700);
      }
    } else if (newState === 'dragover') {
      if (this.container) {
        this.container.style.filter = 'brightness(1.03)';
      }
    } else {
      if (this.container) {
        this.container.style.filter = '';
      }
    }
  }

  getState() {
    return this.state;
  }

  renderStatic() {
    // Render single static composition
    this.sheets.forEach((sheet) => {
      sheet.el.style.transform = `rotate(${sheet.baseRot}deg)`;
    });
    this.layers.forEach((layer) => {
      layer.el.style.transform = 'translate3d(0, 0, 0)';
    });
  }

  renderLoop(timestamp) {
    if (this.isDestroyed) return;

    // Throttle to target FPS (e.g. 30fps on <= 4 cores)
    const elapsed = timestamp - this.lastFrameTime;
    if (elapsed < this.frameInterval) {
      this.rafId = requestAnimationFrame(this.renderLoop);
      return;
    }
    this.lastFrameTime = timestamp - (elapsed % this.frameInterval);

    const now = timestamp;
    const isErrorFrozen = now < this.errorFreezeUntil;

    // Smooth pointer parallax with lerp (0.08)
    this.currentParallaxX = lerp(this.currentParallaxX, this.targetParallaxX, 0.08);
    this.currentParallaxY = lerp(this.currentParallaxY, this.targetParallaxY, 0.08);

    // Apply parallax shift to the 3 depth layers
    this.layers.forEach((layer) => {
      const shiftX = this.currentParallaxX * layer.maxShift;
      const shiftY = this.currentParallaxY * layer.maxShift;
      layer.el.style.transform = `translate3d(${shiftX.toFixed(2)}px, ${shiftY.toFixed(2)}px, 0)`;
    });

    // Time in seconds for slow drifting (paused during error 400ms freeze)
    const driftSec = isErrorFrozen ? (this.errorFreezeUntil - this.startTime) / 1000 : (now - this.startTime) / 1000;

    // State reaction modifiers
    let stateScale = 1;
    let stateEaseX = 0;
    let stateEaseY = 0;
    let stateRotOffset = 0;

    if (this.state === 'dragover') {
      // Ease toward center (50vw, 50vh) by ~6%
      stateScale = 1.01;
    } else if (this.state === 'dropped') {
      const settleProgress = (now - this.squaringUpTime) / 200;
      if (settleProgress <= 1) {
        // 2px overshoot and relax
        stateScale = 1 + Math.sin(settleProgress * Math.PI) * 0.01;
      }
    } else if (this.state === 'processing:compress') {
      stateScale = 0.92;
    } else if (this.state === 'processing:generic') {
      // Slow breathing scale (1 to 1.01)
      stateScale = 1 + Math.sin(now / 800) * 0.005;
    }

    // Animate sheets
    const sheetCount = this.sheets.length;
    for (let i = 0; i < sheetCount; i++) {
      const sheet = this.sheets[i];

      // Base idle drift (translate within ~24px, rotate within ~1.5 deg)
      const driftX = Math.sin((driftSec / sheet.durX) * Math.PI * 2 + sheet.phaseX) * 18;
      const driftY = Math.cos((driftSec / sheet.durY) * Math.PI * 2 + sheet.phaseY) * 22;
      const driftRot = Math.sin((driftSec / sheet.durRot) * Math.PI * 2 + sheet.phaseRot) * 1.4;

      let sheetFinalX = driftX;
      let sheetFinalY = driftY;
      let sheetFinalRot = sheet.baseRot + driftRot;
      let sheetFinalScale = stateScale;

      if (this.state === 'dragover') {
        // Shift ~6% toward screen center
        sheetFinalX += (50 - sheet.baseX) * 0.4;
        sheetFinalY += (50 - sheet.baseY) * 0.4;
      } else if (this.state === 'processing:merge') {
        // Converge toward neat stack behind central area
        sheetFinalX += (50 - sheet.baseX) * 0.6;
        sheetFinalY += (45 - sheet.baseY) * 0.6;
        sheetFinalRot = lerp(sheetFinalRot, (i % 2 === 0 ? 0.5 : -0.5), 0.3);
      } else if (this.state === 'processing:split') {
        // Stack separates into two sides
        const sideOffset = i % 2 === 0 ? -60 : 60;
        sheetFinalX += sideOffset;
        sheetFinalRot = lerp(sheetFinalRot, (i % 2 === 0 ? -2 : 2), 0.2);
      }

      sheet.el.style.transform = `translate3d(${sheetFinalX.toFixed(2)}px, ${sheetFinalY.toFixed(2)}px, 0) rotate(${sheetFinalRot.toFixed(2)}deg) scale(${sheetFinalScale.toFixed(3)})`;
    }

    this.rafId = requestAnimationFrame(this.renderLoop);
  }

  destroy() {
    this.isDestroyed = true;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.busUnsub) {
      this.busUnsub();
      this.busUnsub = null;
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('pointermove', this.handlePointerMove);
      window.removeEventListener('deviceorientation', this.handleOrientation);
      window.removeEventListener('resize', this.handleResize);
      document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    }
    if (this.container) {
      this.container.innerHTML = '';
    }
  }
}

export const pressRoom = new PressRoomController();
export default pressRoom;
