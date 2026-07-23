/**
 * core.js — Core systems: Lenis smooth scroll, custom cursor + cursor light,
 * scroll reveals, nav state, mobile menu, loader, clock.
 * Depends on GSAP + ScrollTrigger + Lenis being on window (loaded in index.html).
 */
import { scrollToId } from './scroll.js';

const w = window;
const d = document;

/* ============================================================
   LOADER
   ============================================================ */
export function initLoader() {
  const loader = d.getElementById('loader');
  if (!loader) return;
  w.addEventListener('load', () => {
    setTimeout(() => loader.classList.add('is-done'), 600);
  });
  // Safety: never trap the user
  setTimeout(() => loader.classList.add('is-done'), 3200);
}

/* ============================================================
   LENIS SMOOTH SCROLL
   ============================================================ */
export function initLenis() {
  const Lenis = w.Lenis;
  if (!Lenis) return null;
  const lenis = new Lenis({
    duration: 1.1,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel: true,
    smoothTouch: false,
  });
  function raf(time) { lenis.raf(time); requestAnimationFrame(raf); }
  requestAnimationFrame(raf);

  // Pause Lenis entirely while hovering the assistant panel.
  // data-lenis-prevent on #assistantBody handles per-element prevention natively.
  const panel = d.getElementById('assistant');
  if (panel) {
    panel.addEventListener('mouseenter', () => lenis.stop(), { passive: true });
    panel.addEventListener('mouseleave', () => lenis.start(), { passive: true });
  }

  // Anchor links -> smooth scroll (shared scroll.js utility)
  d.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href');
      if (id && id.length > 1 && d.querySelector(id)) {
        e.preventDefault();
        scrollToId(id.slice(1), { offset: -40 });
      }
    });
  });
  return lenis;
}





/* ============================================================
   CUSTOM CURSOR + CURSOR LIGHT
   ============================================================ */
export function initCursor() {
  if (w.matchMedia('(hover: none), (pointer: coarse)').matches) return;
  const cursor = d.getElementById('cursor');
  const light = d.getElementById('cursorLight');
  if (!cursor || !light) return;

  const dot = cursor.querySelector('.cursor__dot');
  const ring = cursor.querySelector('.cursor__ring');
  let mx = w.innerWidth / 2, my = w.innerHeight / 2;
  let rx = mx, ry = my;
  let lx = mx, ly = my;

  w.addEventListener('mousemove', (e) => { mx = e.clientX; my = e.clientY; });

  function loop() {
    rx += (mx - rx) * 0.18;
    ry += (my - ry) * 0.18;
    lx += (mx - lx) * 0.08;
    ly += (my - ly) * 0.08;
    dot.style.transform = `translate(${mx}px, ${my}px) translate(-50%, -50%)`;
    ring.style.transform = `translate(${rx}px, ${ry}px) translate(-50%, -50%)`;
    light.style.transform = `translate(${lx}px, ${ly}px) translate(-50%, -50%)`;
    requestAnimationFrame(loop);
  }
  loop();

  // Link hover state
  d.addEventListener('mouseover', (e) => {
    if (e.target.closest('[data-cursor="link"], a, button')) cursor.classList.add('is-link');
  });
  d.addEventListener('mouseout', (e) => {
    if (e.target.closest('[data-cursor="link"], a, button')) cursor.classList.remove('is-link');
  });
}

/* ============================================================
   SCROLL REVEALS (IntersectionObserver)
   ============================================================ */
export function initReveals() {
  const items = d.querySelectorAll('[data-reveal]');
  if (!items.length) return;
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const delay = parseInt(entry.target.dataset.revealDelay || '0', 10);
        setTimeout(() => entry.target.classList.add('is-in'), delay);
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
  items.forEach((el) => io.observe(el));
}

/* ============================================================
   NAV STATE + MOBILE MENU
   ============================================================ */
export function initNav() {
  const nav = d.getElementById('nav');
  const burger = d.getElementById('navBurger');
  const menu = d.getElementById('mobileMenu');

  w.addEventListener('scroll', () => {
    if (w.scrollY > 30) nav.classList.add('is-scrolled');
    else nav.classList.remove('is-scrolled');
  }, { passive: true });

  const toggle = (open) => {
    burger.classList.toggle('is-open', open);
    menu.classList.toggle('is-open', open);
    menu.setAttribute('aria-hidden', !open);
    burger.setAttribute('aria-expanded', open);
    d.body.style.overflow = open ? 'hidden' : '';
  };
  burger.addEventListener('click', () => toggle(!menu.classList.contains('is-open')));
  menu.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => toggle(false)));
}

/* ============================================================
   HERO TITLE SPLIT REVEAL
   ============================================================ */
export function initHeroIntro(gsap) {
  if (!gsap) return;
  const rows = d.querySelectorAll('[data-split]');
  if (rows.length) {
    gsap.from(rows, {
      yPercent: 110,
      opacity: 0,
      duration: 1.1,
      ease: 'expo.out',
      stagger: 0.12,
      delay: 0.9,
    });
  }
}

/* ============================================================
   LIVE CLOCK
   ============================================================ */
export function initClock() {
  const el = d.getElementById('heroClock');
  if (!el) return;
  const tick = () => {
    const n = new Date();
    const pad = (x) => String(x).padStart(2, '0');
    el.textContent = `${pad(n.getHours())}:${pad(n.getMinutes())}:${pad(n.getSeconds())}`;
  };
  tick();
  setInterval(tick, 1000);
}

/* ============================================================
   STATS COUNTERS (GSAP + ScrollTrigger)
   ============================================================ */
export function initStats(gsap, ScrollTrigger) {
  const nums = d.querySelectorAll('[data-count]');
  if (!nums.length || !gsap) {
    nums.forEach((n) => { n.textContent = n.dataset.display || n.textContent; });
    return;
  }
  nums.forEach((num) => {
    const target = parseFloat(num.dataset.count);
    const suffix = num.dataset.suffix || '';
    const display = num.dataset.display;
    const proxy = { v: 0 };
    gsap.to(proxy, {
      v: target,
      duration: 2,
      ease: 'power2.out',
      scrollTrigger: { trigger: num, start: 'top 88%', once: true },
      onUpdate() {
        const val = Math.round(proxy.v);
        // For large numbers (>=4 digits) prefer the precomputed display string.
        num.textContent = (display && String(target).length >= 4 ? display : val.toLocaleString()) + suffix;
      },
    });
  });
}

/* ============================================================
   ARCHITECTURE NODE INTERACTION (keyboard + tap reveal)
   Makes the hover-only description reachable via Tab + Enter/Space
   and via tap on touch devices, without altering desktop hover behaviour.
   ============================================================ */
export function initArchInteraction() {
  const nodes = d.querySelectorAll('.arch__node');
  if (!nodes.length) return;

  const toggle = (node) => {
    const isOpen = node.classList.toggle('is-open');
    node.setAttribute('aria-expanded', String(isOpen));
  };

  nodes.forEach((node) => {
    node.addEventListener('click', () => toggle(node));
    node.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        toggle(node);
      }
    });
  });
}

/* ============================================================
   PARALLAX (data-parallax speed via ScrollTrigger)
   ============================================================ */
export function initParallax(gsap, ScrollTrigger) {
  if (!gsap || !ScrollTrigger) return;
  d.querySelectorAll('[data-parallax]').forEach((el) => {
    const speed = parseFloat(el.dataset.parallax) || 0.2;
    gsap.to(el, {
      y: () => speed * 100,
      ease: 'none',
      scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: true },
    });
  });
}
