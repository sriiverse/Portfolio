/**
 * memory.js — Conversation memory + Visitor Profile for SRIIVERSE AI 2.0.
 *
 * Sliding-window memory of recent turns + rolling summary (unchanged from v2).
 * NEW: VisitorProfile model — silently infers visitor type and focus area
 * from their vocabulary so the assistant can personalize every response.
 *
 * All data is in-browser only. Nothing leaves the client.
 */

import { logWarn } from '../log.js';

const MAX_TURNS = 10;
const SUMMARY_EVERY = 6;
// v4 (Sprint 3): added activeTopic + usedPhraseKeys. No migration from v3 —
// same "tolerant defaults on load" strategy already used across prior bumps;
// an old v3 sessionStorage entry is simply not read, a fresh v4 record starts.
const STORAGE_KEY = 'sriiverse.memory.v4';

/* ============================================================
   VISITOR PROFILE SIGNALS
   Used to classify the visitor as they converse.
   ============================================================ */
const PROFILE_SIGNALS = {
  recruiter:  /\b(recruit|hir(e|ing)|employ|candidate|team|opening|role|position|looking for|seeking|fit for|on behalf)\b/i,
  engineer:   /\b(implement|codebase|refactor|optimiz|debug|system|deploy|architecture|build|scale|latency|throughput|api|rest|auth|docker|sql|nosql|orm)\b/i,
  founder:    /\b(startup|product|ship|mvp|customers|revenue|business|growth|traction|founder|co.?found)\b/i,
  student:    /\b(learn(ing)?|intern|fresher|graduate|college|university|student|placement|campus|resume)\b/i,
};

const FOCUS_SIGNALS = {
  backend:   /\b(backend|server|api|flask|fastapi|python|rest|auth|database|sql|postgresql|mongodb|docker|microservice)\b/i,
  ai:        /\b(ai|ml|llm|gpt|gemini|claude|ollama|llama|rag|vector|embed|prompt|model|inference|fine.?tun)\b/i,
  database:  /\b(database|sql|postgres|mongo|query|schema|index|orm|execution plan|optimization|nosql|db)\b/i,
  frontend:  /\b(frontend|react|typescript|tailwind|ui|ux|design|css|component|interface|animation)\b/i,
  fullstack: /\b(full.?stack|end.?to.?end|product|feature|ship|deploy|full.?product)\b/i,
};

/* ============================================================
   VISITOR PROFILE CLASS
   ============================================================ */
class VisitorProfile {
  constructor() {
    this.type = 'unknown';            // 'unknown' | 'recruiter' | 'engineer' | 'founder' | 'student'
    this.focusArea = null;            // 'backend' | 'ai' | 'database' | 'frontend' | 'fullstack'
    this.projectsViewed = new Set();  // project ids discussed
    this.questionsAsked = 0;
    this.interests = new Set();       // tech keywords mentioned
    this.inferredRole = '';           // e.g. "backend recruiter", "AI engineer"
    this._typeScores = { recruiter: 0, engineer: 0, founder: 0, student: 0 };
    this._focusScores = { backend: 0, ai: 0, database: 0, frontend: 0, fullstack: 0 };
  }

  /** Update profile from a new user message. */
  ingest(text, entities = {}) {
    this.questionsAsked++;

    // Score visitor type
    for (const [type, rx] of Object.entries(PROFILE_SIGNALS)) {
      const matches = text.match(rx);
      if (matches) this._typeScores[type] += matches.length;
    }

    // Score focus area
    for (const [area, rx] of Object.entries(FOCUS_SIGNALS)) {
      const matches = text.match(rx);
      if (matches) {
        this._focusScores[area] += matches.length;
        // Extract individual keywords as interests
        text.match(rx)?.forEach((m) => this.interests.add(m.toLowerCase().trim()));
      }
    }

    // Track project engagement
    if (entities.project) this.projectsViewed.add(entities.project);

    // Resolve dominant type
    const topType = Object.entries(this._typeScores).sort((a, b) => b[1] - a[1])[0];
    if (topType[1] > 0) this.type = topType[0];

    // Resolve dominant focus
    const topFocus = Object.entries(this._focusScores).sort((a, b) => b[1] - a[1])[0];
    if (topFocus[1] > 0) this.focusArea = topFocus[0];

    // Build human-readable inferred role
    this._buildInferredRole();
  }

  _buildInferredRole() {
    if (this.type === 'unknown' && !this.focusArea) {
      this.inferredRole = '';
      return;
    }
    const parts = [];
    if (this.focusArea) parts.push(this.focusArea);
    if (this.type !== 'unknown') parts.push(this.type);
    this.inferredRole = parts.join(' ');
  }

  /** Returns true if enough signal to show profile badge. */
  get isInferred() {
    return this.questionsAsked >= 2 && (this.type !== 'unknown' || this.focusArea !== null);
  }

  /** Serializable snapshot. */
  toJSON() {
    return {
      type: this.type,
      focusArea: this.focusArea,
      projectsViewed: [...this.projectsViewed],
      questionsAsked: this.questionsAsked,
      interests: [...this.interests],
      inferredRole: this.inferredRole,
      _typeScores: this._typeScores,
      _focusScores: this._focusScores,
    };
  }

  fromJSON(data) {
    if (!data) return;
    this.type = data.type || 'unknown';
    this.focusArea = data.focusArea || null;
    this.projectsViewed = new Set(data.projectsViewed || []);
    this.questionsAsked = data.questionsAsked || 0;
    this.interests = new Set(data.interests || []);
    this.inferredRole = data.inferredRole || '';
    this._typeScores = data._typeScores || { recruiter: 0, engineer: 0, founder: 0, student: 0 };
    this._focusScores = data._focusScores || { backend: 0, ai: 0, database: 0, frontend: 0, fullstack: 0 };
  }
}

/* ============================================================
   MEMORY CLASS (v3 — extends v2 with VisitorProfile)
   ============================================================ */
class Memory {
  constructor() {
    this.turns = [];
    this.summary = '';
    this.lastProject = null;
    this.profile = new VisitorProfile();
    // Sprint 3 — cheap "what are we talking about" signal for buildFollowups(),
    // and a small repetition-avoidance ledger for providers.js's phrase variants.
    this.activeTopic = null;
    this.usedPhraseKeys = new Set();
    this._load();
  }

  /* ---------- persistence ---------- */
  _load() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      this.turns = data.turns || [];
      this.summary = data.summary || '';
      this.lastProject = data.lastProject || null;
      this.activeTopic = data.activeTopic || null;
      this.usedPhraseKeys = new Set(data.usedPhraseKeys || []);
      if (data.profile) this.profile.fromJSON(data.profile);
    } catch (e) { logWarn('memory', 'Ignoring corrupt sessionStorage data.', e); }
  }

  _save() {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
        turns: this.turns.slice(-MAX_TURNS),
        summary: this.summary,
        lastProject: this.lastProject,
        activeTopic: this.activeTopic,
        usedPhraseKeys: [...this.usedPhraseKeys],
        profile: this.profile.toJSON(),
      }));
    } catch (e) { logWarn('memory', 'sessionStorage unavailable — memory will not persist this session.', e); }
  }

  /* ---------- API ---------- */

  /**
   * Add a turn. `entities` can include:
   *   - { project }             focus tracking (existing, unchanged)
   *   - { skipProfileIngest }   Sprint 3 — set true for turns whose text
   *     isn't the visitor's own vocabulary (a pasted job description, an
   *     interview answer) so VisitorProfile isn't corrupted by scoring it.
   */
  add(role, text, entities = {}) {
    this.turns.push({ role, text, ts: Date.now(), entities });
    if (entities.project) this.lastProject = entities.project;

    // Update visitor profile on user turns — skipped for turns whose text
    // isn't the visitor's own words (see entities.skipProfileIngest above).
    if (role === 'user' && !entities.skipProfileIngest) {
      this.profile.ingest(text, entities);
    }

    if (this.turns.length > MAX_TURNS) {
      const dropped = this.turns.splice(0, this.turns.length - MAX_TURNS);
      this._summarize(dropped);
    }
    this._save();
  }

  /** Record which topic the conversation is currently about (Sprint 3). */
  setActiveTopic(topic) {
    if (topic) this.activeTopic = topic;
  }

  /** Has this phrase-variant key already been shown this session? */
  hasUsedPhrase(key) { return this.usedPhraseKeys.has(key); }

  /** Record a phrase-variant key as shown this session. */
  markPhraseUsed(key) { this.usedPhraseKeys.add(key); this._save(); }

  /** Get the recent conversation window (oldest→newest). */
  recent(limit = MAX_TURNS) {
    return this.turns.slice(-limit);
  }

  /** Human-readable transcript for the reasoning layer. */
  transcript(limit = 6) {
    const recent = this.recent(limit);
    if (!recent.length && !this.summary) return '';
    const parts = [];
    if (this.summary) parts.push(`[Earlier summary: ${this.summary}]`);
    recent.forEach((t) => parts.push(`${t.role === 'user' ? 'Visitor' : 'SRIIVERSE AI'}: ${t.text}`));
    return parts.join('\n');
  }

  /** Resolve "it", "that", "the second one", etc. using focus. */
  resolveEntity(query) {
    const q = (query || '').toLowerCase();
    const needsAntecedent = /\b(it|that|this|its|the (second|third|first|last|other|next) one|the (project|app|one)|both|them)\b/.test(q);
    if (!needsAntecedent && !this.lastProject) return null;
    return this.lastProject || null;
  }

  get lastUserTurn() { return [...this.turns].reverse().find((t) => t.role === 'user'); }
  get turnCount() { return this.turns.length; }

  clear() {
    this.turns = [];
    this.summary = '';
    this.lastProject = null;
    this.activeTopic = null;
    this.usedPhraseKeys = new Set();
    this.profile = new VisitorProfile();
    this._save();
  }

  /* ---------- internal ---------- */
  _summarize(oldTurns) {
    const userIntents = oldTurns
      .filter((t) => t.role === 'user')
      .map((t) => t.text)
      .join(' | ');
    const projects = [...new Set(oldTurns.filter((t) => t.entities?.project).map((t) => t.entities.project))];
    const parts = [];
    if (userIntents) parts.push(`asked about: ${userIntents.slice(0, 200)}`);
    if (projects.length) parts.push(`discussed projects: ${projects.join(', ')}`);
    this.summary = parts.join('; ').slice(0, 280);
  }
}

export const memory = new Memory();
export default memory;
