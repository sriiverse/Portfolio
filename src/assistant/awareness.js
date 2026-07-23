/**
 * awareness.js — Website Awareness Engine for SRIIVERSE AI 2.0.
 *
 * Gives the assistant real-time knowledge of where the visitor is,
 * what they have seen, and how long they have engaged with each section.
 *
 * Uses IntersectionObserver (no scroll listeners) for performance.
 * Exposes a singleton `awareness` consumed by assistant.js on every query.
 */

/* ============================================================
   SECTION ORDER (mirrors the DOM)
   ============================================================ */
const SECTION_IDS = ['hero', 'about', 'projects', 'stack', 'architecture', 'journey', 'stats', 'contact'];

/* ============================================================
   AWARENESS SINGLETON
   ============================================================ */
class WebsiteAwareness {
  constructor() {
    this.currentSection = 'hero';
    this.currentProject = null;        // project id currently in viewport
    this.sectionHistory = [];          // ordered list of visited sections
    this.sectionTimes = {};            // { sectionId: totalMs }
    this.sessionStart = Date.now();
    this.pageState = 'loading';        // 'loading' | 'browsing' | 'reading' | 'engaged'

    this._sectionEnterTime = {};       // when we entered the current section
    this._observers = [];

    this._init();
  }

  /* --------------------------------------------------------
     INIT — attach observers after DOM is ready
     -------------------------------------------------------- */
  _init() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this._attach(), { once: true });
    } else {
      this._attach();
    }
  }

  _attach() {
    this.pageState = 'browsing';

    /* --- Section observer --- */
    const secOpts = { threshold: 0.35 }; // section must be 35% visible to count
    const secObs = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          this._enterSection(entry.target.id);
        } else {
          this._leaveSection(entry.target.id);
        }
      });
    }, secOpts);

    SECTION_IDS.forEach((id) => {
      const el = document.getElementById(id);
      if (el) { secObs.observe(el); this._observers.push(secObs); }
    });

    /* --- Project card observer --- */
    // Project articles are rendered by sections.js into #projectMount.
    // We observe dynamically after a short delay to let buildAll() finish.
    setTimeout(() => this._attachProjectObserver(), 800);

    /* --- Engagement state timer --- */
    setTimeout(() => {
      if (this.pageState === 'browsing') this.pageState = 'reading';
    }, 15000);
    setTimeout(() => {
      if (this.pageState !== 'engaged') this.pageState = 'engaged';
    }, 45000);
  }

  _attachProjectObserver() {
    const projOpts = { threshold: 0.4 };
    const projObs = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const id = entry.target.dataset.projectId;
          if (id) this.currentProject = id;
        }
      });
    }, projOpts);

    document.querySelectorAll('[data-project-id]').forEach((el) => {
      projObs.observe(el);
    });
    this._observers.push(projObs);
  }

  /* --------------------------------------------------------
     SECTION TRACKING
     -------------------------------------------------------- */
  _enterSection(id) {
    if (!id || !SECTION_IDS.includes(id)) return;
    this.currentSection = id;
    this._sectionEnterTime[id] = Date.now();

    if (!this.sectionHistory.includes(id)) {
      this.sectionHistory.push(id);
    }
    // bump to reading state faster when navigating sections
    if (this.pageState === 'browsing') this.pageState = 'reading';
  }

  _leaveSection(id) {
    if (!id || !this._sectionEnterTime[id]) return;
    const spent = Date.now() - this._sectionEnterTime[id];
    this.sectionTimes[id] = (this.sectionTimes[id] || 0) + spent;
    delete this._sectionEnterTime[id];
  }

  /* --------------------------------------------------------
     PUBLIC API
     -------------------------------------------------------- */

  /** Returns a structured snapshot injected into every query. */
  getContext() {
    const visited = this.sectionHistory.filter((s) => s !== 'hero');
    const topSection = Object.entries(this.sectionTimes)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || null;

    return {
      currentSection: this.currentSection,
      currentProject: this.currentProject,
      sectionHistory: this.sectionHistory,
      visitedSections: visited,
      topEngagedSection: topSection,
      sessionMs: Date.now() - this.sessionStart,
      pageState: this.pageState,
      hasScrolledPastHero: this.sectionHistory.length > 1,
    };
  }

  /** Human-readable string for prompt injection. */
  getContextString() {
    const ctx = this.getContext();
    const parts = [];

    parts.push(`Visitor is currently viewing: ${ctx.currentSection}`);
    if (ctx.currentProject) parts.push(`Project in viewport: ${ctx.currentProject}`);
    if (ctx.visitedSections.length > 1) parts.push(`Sections visited: ${ctx.visitedSections.join(', ')}`);
    if (ctx.topEngagedSection) parts.push(`Most time spent on: ${ctx.topEngagedSection}`);
    parts.push(`Session engagement: ${ctx.pageState}`);

    return parts.join('. ');
  }

  /** Returns the most-engaged section — useful for proactive suggestions. */
  getMostInterestedSection() {
    return Object.entries(this.sectionTimes)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || this.currentSection;
  }
}

export const awareness = new WebsiteAwareness();
export default awareness;
