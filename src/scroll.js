/**
 * scroll.js — Canonical smooth-scroll-to-section utility.
 *
 * Single source of truth for scrolling to an element by id. Previously this
 * logic was duplicated across tools.js, core.js, and a dead export in
 * sections.js — consolidated here per Sprint 1 Objective 2.
 *
 * Prefers the global Lenis instance (window.__lenis, set once initLenis()
 * boots in main.js) and falls back to native scrollIntoView when Lenis
 * isn't available (e.g. it failed to load from the CDN).
 */
export function scrollToId(id, opts = {}) {
  const el = document.getElementById(id);
  if (!el) return false;
  if (window.__lenis && typeof window.__lenis.scrollTo === 'function') {
    window.__lenis.scrollTo(el, { offset: opts.offset ?? -60, duration: opts.duration ?? 1.4 });
  } else {
    el.scrollIntoView({ behavior: opts.instant ? 'auto' : 'smooth', block: 'start' });
  }
  return true;
}
