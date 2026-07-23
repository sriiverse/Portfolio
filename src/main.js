/**
 * main.js — SRIIVERSEAI entry point.
 * Wires the loader, 3D scene, core systems, sections, and assistant.
 */
import { initScene } from './scene.js';
import {
  initLoader, initLenis, initCursor, initReveals, initNav,
  initHeroIntro, initClock, initStats, initParallax, initArchInteraction,
} from './core.js';
import { buildAll } from './sections.js';
import { initAssistant } from './assistant.js';
import { triggerResumeDownload } from './assistant/tools.js';
import { logWarn } from './log.js';

const w = window;

/* ---------- Wait for GSAP/Lenis libs (deferred) ---------- */
function whenReady(cb) {
  // libs are deferred; poll until present
  const start = performance.now();
  (function poll() {
    if (w.gsap != null) {
      cb();
    } else if (performance.now() - start < 8000) {
      setTimeout(poll, 50);
    } else {
      // proceed without GSAP — core still works
      cb();
    }
  })();
}

function boot() {
  // 1. 3D scene (background canvas)
  const canvas = document.getElementById('scene');
  if (canvas) {
    try { initScene(canvas); } catch (e) { logWarn('scene', 'Scene init failed', e); }
  }

  // 2. Sections from content
  buildAll();

  // 3. Core systems (no deps)
  initLoader();
  initCursor();
  initReveals();
  initNav();
  initArchInteraction();
  initClock();
  initAssistant();
  // init smooth scroll + expose globally so AI tools can use it
  const lenis = initLenis();
  if (lenis) window.__lenis = lenis;

  // year
  const y = document.getElementById('year');
  if (y) y.textContent = new Date().getFullYear();

  // résumé buttons → same canonical download flow the AI assistant's
  // "download resume" chat tool uses (src/assistant/tools.js)
  const resumeHandler = (e) => {
    const url = e.currentTarget.getAttribute('href');
    if (!url || url === '#' || url.endsWith('#')) {
      e.preventDefault();
      triggerResumeDownload();
    }
  };
  document.querySelectorAll('#resumeBtn, #resumeBtn2').forEach((b) => b.addEventListener('click', resumeHandler));

  // 4. GSAP-dependent features
  whenReady(() => {
    const gsap = w.gsap;
    let ScrollTrigger = null;
    if (gsap && w.ScrollTrigger) {
      ScrollTrigger = w.ScrollTrigger;
      gsap.registerPlugin(ScrollTrigger);
    }
    initHeroIntro(gsap);
    initStats(gsap, ScrollTrigger);
    initParallax(gsap, ScrollTrigger);
    if (ScrollTrigger) setTimeout(() => ScrollTrigger.refresh(), 400);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
