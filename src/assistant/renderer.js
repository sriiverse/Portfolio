/**
 * renderer.js — Rich markdown rendering for SRIIVERSE AI 2.0.
 *
 * Upgraded from v2:
 * - All existing render functions preserved (renderMarkdown, renderCitations,
 *   renderProjectCard, renderFollowups)
 * - NEW: renderTabbedProjectCard — tabbed card with Overview/Architecture/Stack/Decisions
 * - NEW: renderCommandBar — row of glowing action buttons
 * - NEW: renderVisitorProfile — visitor role badge for the panel header
 * - NEW: renderThinkingSteps — animated sequential reasoning steps
 * - NEW: renderComparisonCard — side-by-side project comparison card
 *
 * Security: all model output passes through escapeHtml before rendering.
 */

import { getProject } from './knowledge.js';

/* ============================================================
   ESCAPE + SANITIZE
   ============================================================ */
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ============================================================
   INLINE MARKDOWN
   ============================================================ */
function inline(text) {
  let t = escapeHtml(text);
  t = t.replace(/`([^`]+)`/g, '<code class="ai-code ai-code--inline">$1</code>');
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/(?<!\w)__([^_]+)__(?!\w)/g, '<strong>$1</strong>');
  t = t.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>');
  t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener" class="ai-link">$1 ↗</a>');
  return t;
}

/* ============================================================
   BLOCK-LEVEL MARKDOWN
   ============================================================ */
export function renderMarkdown(src) {
  if (!src) return '';
  const lines = String(src).split(/\r?\n/);
  const out = [];
  let i = 0;
  let listOpen = false;
  let listType = 'ul';

  const closeList = () => {
    if (listOpen) { out.push(`</${listType}>`); listOpen = false; }
  };

  while (i < lines.length) {
    let line = lines[i];

    // fenced code block
    const fence = line.match(/^```(\w+)?/);
    if (fence) {
      closeList();
      const lang = fence[1] || '';
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) { buf.push(lines[i]); i++; }
      i++;
      out.push(renderCodeBlock(buf.join('\n'), lang));
      continue;
    }

    // table (|---|---|)
    if (/^\|.+\|/.test(line)) {
      closeList();
      const tableLines = [];
      while (i < lines.length && /^\|.+\|/.test(lines[i])) { tableLines.push(lines[i]); i++; }
      out.push(renderTable(tableLines));
      continue;
    }

    // heading
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      closeList();
      const lvl = h[1].length;
      out.push(`<h${lvl} class="ai-h ai-h--${lvl}">${inline(h[2])}</h${lvl}>`);
      i++;
      continue;
    }

    // blockquote
    if (/^>\s?/.test(line)) {
      closeList();
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^>\s?/, '')); i++; }
      out.push(`<blockquote class="ai-quote">${inline(buf.join(' '))}</blockquote>`);
      continue;
    }

    // unordered list
    if (/^\s*[-*]\s+/.test(line)) {
      if (!listOpen || listType !== 'ul') { closeList(); out.push('<ul class="ai-list">'); listOpen = true; listType = 'ul'; }
      out.push(`<li>${inline(line.replace(/^\s*[-*]\s+/, ''))}</li>`);
      i++;
      continue;
    }

    // ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      if (!listOpen || listType !== 'ol') { closeList(); out.push('<ol class="ai-list ai-list--ordered">'); listOpen = true; listType = 'ol'; }
      out.push(`<li>${inline(line.replace(/^\s*\d+\.\s+/, ''))}</li>`);
      i++;
      continue;
    }

    // blank line
    if (!line.trim()) { closeList(); i++; continue; }

    // paragraph
    closeList();
    const buf = [line];
    i++;
    while (i < lines.length && lines[i].trim()
      && !/^```/.test(lines[i]) && !/^#{1,3}\s/.test(lines[i])
      && !/^>\s?/.test(lines[i]) && !/^\s*[-*]\s+/.test(lines[i])
      && !/^\s*\d+\.\s+/.test(lines[i]) && !/^\|.+\|/.test(lines[i])) {
      buf.push(lines[i]); i++;
    }
    out.push(`<p class="ai-p">${inline(buf.join(' '))}</p>`);
  }
  closeList();
  return out.join('');
}

/* ============================================================
   TABLE RENDERER
   ============================================================ */
function renderTable(lines) {
  const rows = lines.filter((l) => !/^[\s|:-]+$/.test(l));
  const header = rows[0];
  const body = rows.slice(1);

  const parseCells = (row) => row.split('|').map((c) => c.trim()).filter(Boolean);

  const thead = `<tr>${parseCells(header).map((c) => `<th>${inline(c)}</th>`).join('')}</tr>`;
  const tbody = body.map((row) =>
    `<tr>${parseCells(row).map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`
  ).join('');

  return `<div class="ai-table-wrap"><table class="ai-table"><thead>${thead}</thead><tbody>${tbody}</tbody></table></div>`;
}

/* ============================================================
   CODE BLOCK + MINI SYNTAX HIGHLIGHTING
   ============================================================ */
function renderCodeBlock(code, lang) {
  const highlighted = highlightCode(code, lang);
  const label = lang ? `<span class="ai-code__lang">${escapeHtml(lang)}</span>` : '';
  return `<div class="ai-code ai-code__block">
    <div class="ai-code__head">${label}<span class="ai-code__copy" role="button" tabindex="0">copy</span></div>
    <pre><code>${highlighted}</code></pre>
  </div>`;
}

const KEYWORDS = new Set([
  'def','class','import','from','return','if','elif','else','for','while','try','except','finally','with','as','in','not','and','or','is','None','True','False','lambda','yield','async','await','raise','pass','break','continue','global','nonlocal','self','cls','print',
  'const','let','var','function','new','typeof','instanceof','of','interface','type','extends','implements','public','private','readonly','enum','namespace','abstract','null','undefined','this',
  'SELECT','FROM','WHERE','INSERT','UPDATE','DELETE','JOIN','INNER','LEFT','RIGHT','ON','GROUP','BY','ORDER','HAVING','LIMIT','CREATE','TABLE','INDEX','AND','OR','NOT','AS','DISTINCT','INTO','VALUES','SET',
]);

function highlightCode(code, lang) {
  let t = escapeHtml(code);
  if (lang === 'python' || lang === 'py') t = t.replace(/(#[^\n]*)/g, '<span class="tok-c">$1</span>');
  else if (lang === 'sql') t = t.replace(/(--[^\n]*)/g, '<span class="tok-c">$1</span>');
  else t = t.replace(/(\/\/[^\n]*)/g, '<span class="tok-c">$1</span>');
  t = t.replace(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g, '<span class="tok-s">$1</span>');
  t = t.replace(/\b(\d+\.?\d*)\b/g, '<span class="tok-n">$1</span>');
  KEYWORDS.forEach((kw) => {
    const re = new RegExp(`\\b(${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})\\b`, 'g');
    t = t.replace(re, (m) => `<span class="tok-k">${m}</span>`);
  });
  t = t.replace(/\b([a-zA-Z_][a-zA-Z0-9_]*)(\s*\()/g, '<span class="tok-f">$1</span>$2');
  return t;
}

/* ============================================================
   CITATIONS
   ============================================================ */
export function renderCitations(sources) {
  if (!sources || !sources.length) return '';
  const items = sources.slice(0, 4).map((s, i) => {
    const link = s.link ? `data-link="${s.link}"` : '';
    return `<button class="ai-cite" ${link} tabindex="0">${i + 1}. ${escapeHtml(s.source)}</button>`;
  }).join('');
  return `<div class="ai-cites">${items}</div>`;
}

/* ============================================================
   THINKING STEPS (NEW in v2.0)
   Sequential reasoning steps that animate in one by one.
   ============================================================ */
export function renderThinkingSteps() {
  return `<div class="ai-thinking" id="aiThinking">
    <div class="ai-thinking__steps">
      <div class="ai-thinking__step" data-step="intent">
        <span class="ai-thinking__icon">◌</span>
        <span>Understanding intent</span>
      </div>
      <div class="ai-thinking__step" data-step="context">
        <span class="ai-thinking__icon">◌</span>
        <span>Reading context</span>
      </div>
      <div class="ai-thinking__step" data-step="knowledge">
        <span class="ai-thinking__icon">◌</span>
        <span>Retrieving knowledge</span>
      </div>
      <div class="ai-thinking__step" data-step="reasoning">
        <span class="ai-thinking__icon">◌</span>
        <span>Reasoning</span>
      </div>
      <div class="ai-thinking__step" data-step="memory">
        <span class="ai-thinking__icon">◌</span>
        <span>Generating response</span>
      </div>
    </div>
  </div>`;
}

/** Advance a thinking step to 'done' or 'active'. */
export function updateThinkingStep(containerId, stepName) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const steps = container.querySelectorAll('.ai-thinking__step');
  let found = false;
  steps.forEach((step) => {
    if (found) return;
    if (step.dataset.step === stepName) {
      step.classList.add('is-active');
      step.querySelector('.ai-thinking__icon').textContent = '⟳';
      found = true;
    } else if (!step.classList.contains('is-active') && !step.classList.contains('is-done')) {
      // mark previous steps as done
      step.classList.add('is-done');
      step.querySelector('.ai-thinking__icon').textContent = '✓';
    }
  });
}

/* ============================================================
   RICH PROJECT CARD (existing, preserved)
   ============================================================ */
export function renderProjectCard(project) {
  if (!project) return '';
  const features = project.features.slice(0, 4).map((f) =>
    `<li><span class="ai-card__ic">${f.icon}</span><div><strong>${escapeHtml(f.title)}</strong><span>${escapeHtml(f.desc)}</span></div></li>`
  ).join('');
  return `
  <div class="ai-card ai-card--project" style="--accent:${project.accent}" data-project-id="${project.id}">
    <div class="ai-card__head">
      <span class="ai-card__kicker">${escapeHtml(project.title)}</span>
      <h4>${escapeHtml(project.name)}</h4>
    </div>
    <p class="ai-card__tag">${escapeHtml(project.tagline)}</p>
    <ul class="ai-card__features">${features}</ul>
    <div class="ai-card__chips">${project.stack.slice(0, 6).map((s) => `<span>${escapeHtml(s)}</span>`).join('')}</div>
    <div class="ai-card__actions">
      <a href="${project.live}" target="_blank" rel="noopener" class="ai-card__btn ai-card__btn--primary">Live Demo ↗</a>
      ${project.repo ? `<a href="${project.repo}" target="_blank" rel="noopener" class="ai-card__btn">GitHub ↗</a>` : ''}
    </div>
  </div>`;
}

/* ============================================================
   TABBED PROJECT CARD (NEW in v2.0)
   Pure CSS tabs — no JS needed for tab switching.
   ============================================================ */
export function renderTabbedProjectCard(project) {
  if (!project) return '';
  const uid = `tab-${project.id}-${Date.now()}`;
  const features = project.features.slice(0, 4).map((f) =>
    `<li><span>${f.icon}</span><div><strong>${escapeHtml(f.title)}</strong> — ${escapeHtml(f.desc)}</div></li>`
  ).join('');
  const decisions = project.decisions.map((d, i) =>
    `<li><span class="ai-tab__num">${i + 1}</span>${escapeHtml(d)}</li>`
  ).join('');

  return `
  <div class="ai-tab-card" style="--accent:${project.accent}">
    <div class="ai-tab-card__head">
      <div class="ai-tab-card__title">
        <span class="ai-tab-card__index">${project.index}</span>
        <strong>${escapeHtml(project.name)}</strong>
      </div>
      <p class="ai-tab-card__tagline">${escapeHtml(project.tagline)}</p>
    </div>

    <div class="ai-tabs">
      <input type="radio" name="${uid}" id="${uid}-ov" checked hidden>
      <input type="radio" name="${uid}" id="${uid}-ar" hidden>
      <input type="radio" name="${uid}" id="${uid}-st" hidden>
      <input type="radio" name="${uid}" id="${uid}-de" hidden>

      <div class="ai-tabs__nav">
        <label for="${uid}-ov">Overview</label>
        <label for="${uid}-ar">Architecture</label>
        <label for="${uid}-st">Stack</label>
        <label for="${uid}-de">Decisions</label>
      </div>

      <div class="ai-tabs__panels">
        <div class="ai-tabs__panel" id="${uid}-ov-panel">
          <p><strong>Problem:</strong> ${escapeHtml(project.problem)}</p>
          <p><strong>Solution:</strong> ${escapeHtml(project.solution)}</p>
          <ul class="ai-tab__features">${features}</ul>
        </div>
        <div class="ai-tabs__panel" id="${uid}-ar-panel">
          <ul class="ai-tab__decisions">${decisions}</ul>
        </div>
        <div class="ai-tabs__panel" id="${uid}-st-panel">
          <div class="ai-tab__chips">${project.stack.map((s) => `<span>${escapeHtml(s)}</span>`).join('')}</div>
        </div>
        <div class="ai-tabs__panel" id="${uid}-de-panel">
          <ul class="ai-tab__decisions">${decisions}</ul>
        </div>
      </div>
    </div>

    <div class="ai-tab-card__actions">
      <a href="${project.live}" target="_blank" rel="noopener" class="ai-card__btn ai-card__btn--primary">Live Demo ↗</a>
      ${project.repo ? `<a href="${project.repo}" target="_blank" rel="noopener" class="ai-card__btn">GitHub ↗</a>` : ''}
    </div>
  </div>`;
}

/* ============================================================
   COMMAND BAR (NEW in v2.0)
   Quick-access action buttons rendered below a project response.
   ============================================================ */
export function renderCommandBar(actions) {
  if (!actions || !actions.length) return '';
  const btns = actions.map((a) =>
    `<button class="ai-cmd-btn" data-action="${escapeHtml(a.action)}" title="${escapeHtml(a.label)}">
      <span class="ai-cmd-btn__icon">${a.icon}</span>
      <span>${escapeHtml(a.label)}</span>
    </button>`
  ).join('');
  return `<div class="ai-cmd-bar">${btns}</div>`;
}

/* ============================================================
   VISITOR PROFILE BADGE (NEW in v2.0)
   Rendered into the assistant panel header once profile is inferred.
   ============================================================ */
export function renderVisitorProfile(profile) {
  if (!profile || !profile.isInferred) return '';
  const role = profile.inferredRole || profile.type;
  const icon = { recruiter: '🎯', engineer: '⚙️', founder: '🚀', student: '📚', unknown: '👋' }[profile.type] || '👋';
  const interests = [...profile.interests].slice(0, 3).join(', ');

  return `<div class="assistant__profile-badge" id="profileBadge">
    <span class="assistant__profile-icon">${icon}</span>
    <div class="assistant__profile-info">
      <span class="assistant__profile-role">${escapeHtml(role)}</span>
      ${interests ? `<span class="assistant__profile-interests">${escapeHtml(interests)}</span>` : ''}
    </div>
  </div>`;
}

/* ============================================================
   COMPARISON CARD (NEW in v2.0)
   ============================================================ */
export function renderComparisonCard(projectA, projectB) {
  if (!projectA || !projectB) return '';
  const colA = `
    <div class="ai-compare__col" style="--accent:${projectA.accent}">
      <div class="ai-compare__head">
        <strong>${escapeHtml(projectA.name)}</strong>
        <span>${escapeHtml(projectA.index)}</span>
      </div>
      <p>${escapeHtml(projectA.tagline)}</p>
      <div class="ai-compare__chips">${projectA.stack.slice(0, 4).map((s) => `<span>${escapeHtml(s)}</span>`).join('')}</div>
      <a href="${projectA.live}" target="_blank" rel="noopener" class="ai-card__btn ai-card__btn--primary" style="--accent:${projectA.accent}">Demo ↗</a>
    </div>`;
  const colB = `
    <div class="ai-compare__col" style="--accent:${projectB.accent}">
      <div class="ai-compare__head">
        <strong>${escapeHtml(projectB.name)}</strong>
        <span>${escapeHtml(projectB.index)}</span>
      </div>
      <p>${escapeHtml(projectB.tagline)}</p>
      <div class="ai-compare__chips">${projectB.stack.slice(0, 4).map((s) => `<span>${escapeHtml(s)}</span>`).join('')}</div>
      <a href="${projectB.live}" target="_blank" rel="noopener" class="ai-card__btn ai-card__btn--primary" style="--accent:${projectB.accent}">Demo ↗</a>
    </div>`;
  return `<div class="ai-compare">${colA}<div class="ai-compare__sep">vs</div>${colB}</div>`;
}

/* ============================================================
   FOLLOW-UP SUGGESTIONS (preserved from v2)
   ============================================================ */
export function renderFollowups(suggestions) {
  if (!suggestions || !suggestions.length) return '';
  const items = suggestions.map((s) =>
    `<button class="ai-followup" tabindex="0">${escapeHtml(s)}</button>`
  ).join('');
  return `<div class="ai-followups">${items}</div>`;
}

/* ============================================================
   STACK / ARCH CARDS (stubs — preserved from v2)
   ============================================================ */
export function renderStackCard() { return ''; }
export function renderArchCard() { return ''; }
