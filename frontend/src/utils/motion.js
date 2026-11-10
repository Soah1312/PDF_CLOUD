/**
 * The Bindery — Motion Helper Module
 * Centralized motion utilities: lerp, FLIP, IntersectionObserver reveal, dev toggle (?motion=off),
 * and lightweight event bus for background/micro-interaction reactivity.
 */

// Math helpers
export function lerp(start, end, factor) {
  return start + (end - start) * factor;
}

export function clamp(val, min, max) {
  return Math.min(Math.max(val, min), max);
}

// Dev motion toggle check (?motion=off or ?motion=false or saved state)
export function isReducedMotion() {
  if (typeof window === 'undefined') return false;
  if (window.location && (window.location.search.includes('motion=off') || window.location.search.includes('motion=false'))) {
    return true;
  }
  if (typeof document !== 'undefined' && (document.documentElement.classList.contains('motion-off') || document.documentElement.getAttribute('data-motion') === 'off')) {
    return true;
  }
  return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function initDevMotionToggle() {
  if (typeof window === 'undefined') return;
  const urlParams = new URLSearchParams(window.location.search);
  const motionParam = urlParams.get('motion');
  if (motionParam === 'off' || motionParam === 'false') {
    document.documentElement.classList.add('motion-off');
    document.documentElement.setAttribute('data-motion', 'off');
    console.info('[The Bindery] Motion disabled via ?motion=off dev flag.');
  }
}

// Tiny reactive event bus
class BinderyEventBus {
  constructor() {
    this.listeners = new Map();
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
    return () => this.off(event, callback);
  }

  off(event, callback) {
    const set = this.listeners.get(event);
    if (set) {
      set.delete(callback);
    }
  }

  emit(event, data) {
    const set = this.listeners.get(event);
    if (set) {
      set.forEach((cb) => {
        try {
          cb(data);
        } catch (err) {
          console.error(`[EventBus] Error handling event "${event}":`, err);
        }
      });
    }
  }
}

export const motionBus = new BinderyEventBus();

/**
 * FLIP Animation Helper (First, Last, Invert, Play)
 * Smoothly morphs element from prior position/size to new position without layout jank.
 */
export function flipAnimate(element, firstRect, options = {}) {
  if (!element || isReducedMotion()) return;
  const lastRect = element.getBoundingClientRect();
  const dx = firstRect.left - lastRect.left;
  const dy = firstRect.top - lastRect.top;

  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;

  const duration = options.duration || 200;
  const easing = options.easing || 'cubic-bezier(0.2, 0.8, 0.2, 1)';

  element.style.transform = `translate(${dx}px, ${dy}px)`;
  element.style.transition = 'none';

  // Force layout flush and animate to target
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      element.style.transition = `transform ${duration}ms ${easing}`;
      element.style.transform = '';
      const cleanup = () => {
        element.style.transition = '';
        element.style.transform = '';
        element.removeEventListener('transitionend', cleanup);
      };
      element.addEventListener('transitionend', cleanup, { once: true });
    });
  });
}

/**
 * Scroll Reveal Helper (IntersectionObserver)
 * Triggers hairline rule line draw and tile fade/rise once when scrolled into view.
 */
export function initScrollReveals(root = null) {
  if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') return;

  const targets = (root || document).querySelectorAll('.section-rule-line, .stagger-reveal');
  if (!targets.length) return;

  const observer = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-revealed');
          obs.unobserve(entry.target);
        }
      });
    },
    {
      threshold: 0.1,
      rootMargin: '0px 0px -40px 0px',
    }
  );

  targets.forEach((target) => {
    if (target.classList.contains('is-revealed')) return;
    observer.observe(target);
  });

  return () => observer.disconnect();
}
