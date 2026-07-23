/**
 * sections.js — Builds dynamic sections from content.js.
 * Projects, tech orbs, architecture, timeline, stats.
 */
import { PROJECTS, STACK, ARCHITECTURE, JOURNEY, STATS } from './content.js';

const d = document;

/* ============================================================
   PROJECTS
   ============================================================ */
function buildMockup(theme, accent, accent2) {
  if (theme === 'database') {
    return `
      <div class="mock-db" data-parallax="0.1">
        <div class="mock-db__bar">
          <i></i>
          <span class="mock-db__sql"><b>SELECT</b> * <b>FROM</b> orders <b>WHERE</b> status = 'pending' <b>ORDER BY</b> created_at <b>DESC</b>;</span>
        </div>
        <div class="mock-db__cubes">
          <div class="mock-cube" style="--accent:${accent}">users</div>
          <div class="mock-cube" style="--accent:${accent2}">orders</div>
          <div class="mock-cube" style="--accent:${accent}">products</div>
          <div class="mock-cube" style="--accent:${accent2}">payments</div>
        </div>
        <div class="mock-db__graph">
          ${Array.from({ length: 18 }).map((_, i) => {
            const h = 25 + Math.abs(Math.sin(i * 0.9)) * 70;
            return `<span style="height:${h}%; animation-delay:${i * 0.08}s; --accent:${accent}"></span>`;
          }).join('')}
        </div>
      </div>`;
  }
  if (theme === 'career') {
    return `
      <div class="mock-career" data-parallax="0.1">
        <div class="mock-career__term">
          <div><span class="prompt">root@placement-os:~#</span> <b>./analyze_resume.sh</b> --target SDE</div>
          <div><span>&gt;</span> parsing resume… <b>done</b></div>
          <div><span>&gt;</span> detected skills: <span>Python, React, SQL, REST</span></div>
          <div><span>&gt;</span> gaps found: <b>System Design, DSA</b></div>
          <div><span class="prompt">&gt;</span> generating roadmap… <b>ready ✓</b></div>
        </div>
        <div class="mock-career__roadmap">
          <div class="mock-career__step done" style="--accent:${accent}"><i>Resume</i></div>
          <div class="mock-career__step done" style="--accent:${accent}"><i>Gap</i></div>
          <div class="mock-career__step" style="--accent:${accent2}"><i>DSA</i></div>
          <div class="mock-career__step" style="--accent:${accent2}"><i>System</i></div>
          <div class="mock-career__step" style="--accent:${accent2}"><i>Mock</i></div>
          <div class="mock-career__step" style="--accent:${accent2}"><i>Placed</i></div>
        </div>
      </div>`;
  }
  // network
  const nodes = [
    { x: 320, y: 150, core: true, r: 22 },                 // repo core
    { x: 140, y: 70,  r: 12 },  { x: 500, y: 70,  r: 12 },
    { x: 100, y: 220, r: 12 },  { x: 540, y: 220, r: 12 },
    { x: 230, y: 250, r: 9 },   { x: 410, y: 250, r: 9 },
    { x: 320, y: 40,  r: 9 },   { x: 320, y: 270, r: 9 },
  ];
  const links = nodes.slice(1).map((n) => `<line class="mock-net__link" x1="320" y1="150" x2="${n.x}" y2="${n.y}" />`).join('');
  const circles = nodes.map((n) =>
    `<circle class="mock-net__node ${n.core ? 'mock-net__node--core' : ''}" cx="${n.x}" cy="${n.y}" r="${n.r}" style="--accent:${accent}" />`).join('');
  return `
    <div class="mock-net" data-parallax="0.1">
      <svg viewBox="0 0 640 300" preserveAspectRatio="xMidYMid meet">
        ${links}
        ${circles}
        <circle class="mock-net__pulse" cx="320" cy="150" r="40">
          <animate attributeName="r" values="22;60;22" dur="3s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.8;0;0.8" dur="3s" repeatCount="indefinite" />
        </circle>
      </svg>
    </div>`;
}

function buildProjects() {
  const mount = d.getElementById('projectMount');
  if (!mount) return;
  mount.innerHTML = PROJECTS.map((p) => `
    <article class="project reveal" data-reveal data-project-id="${p.id}" style="--accent:${p.accent}; --accent-glow:${hexToRgba(p.accent, 0.35)}">
      <div class="project__head">
        <div class="project__id">${p.index}</div>
        <div class="project__nameblock">
          <div class="project__kicker">${p.title}</div>
          <h3 class="project__name">${p.name.replace(/AI$/, '<em>AI</em>')}</h3>
          <p class="project__tag">${p.tagline}</p>
        </div>
        <div class="project__links">
          <a class="project__link" href="${p.live}" target="_blank" rel="noopener" data-cursor="link">
            Live Demo
            <svg viewBox="0 0 24 24" width="14" height="14"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M7 17L17 7M9 7h8v8"/></svg>
          </a>
          ${p.repo ? `
          <a class="project__link project__link--repo" href="${p.repo}" target="_blank" rel="noopener" data-cursor="link">
            GitHub Repo
            <svg viewBox="0 0 24 24" width="14" height="14"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M7 17L17 7M9 7h8v8"/></svg>
          </a>` : ''}
        </div>
      </div>

      <div class="project__stage">
        <div class="project__mock">${buildMockup(p.theme, p.accent, p.accent2)}</div>
      </div>

      <div class="project__body">
        <div class="project__ps reveal" data-reveal>
          <h4>● Problem</h4>
          <p>${p.problem}</p>
        </div>
        <div class="project__sol reveal" data-reveal>
          <h4>● Solution</h4>
          <p>${p.solution}</p>
        </div>
      </div>

      <div class="project__features">
        ${p.features.map((f, i) => `
          <div class="feature reveal" data-reveal data-reveal-delay="${i * 60}">
            <span class="feature__icon">${f.icon}</span>
            <h5>${f.title}</h5>
            <p>${f.desc}</p>
          </div>`).join('')}
      </div>

      <div class="project__meta">
        <div class="project__panel reveal" data-reveal>
          <h6>// Engineering Decisions</h6>
          <ul class="project__decisions">
            ${p.decisions.map((dec) => `<li>${dec}</li>`).join('')}
          </ul>
        </div>
        <div class="project__panel reveal" data-reveal>
          <h6>// Stack &amp; Metrics</h6>
          <div class="project__chips" style="margin-bottom:18px">
            ${p.stack.map((s) => `<span class="chip">${s}</span>`).join('')}
          </div>
          <div class="project__metrics">
            ${p.metrics.map((m) => `
              <div class="metric">
                <span class="metric__k">${m.k}</span>
                <span class="metric__v">${m.v}</span>
              </div>`).join('')}
          </div>
        </div>
      </div>
    </article>
  `).join('');
}

/* ============================================================
   TECH ORBS
   ============================================================ */
function buildStack() {
  const mount = d.getElementById('orbField');
  if (!mount) return;
  mount.innerHTML = STACK.map((s, i) => `
    <span class="orb reveal" data-reveal data-reveal-delay="${(i % 6) * 50}"
          style="--orb-color:${s.color}; --orb-dur:${5 + (i % 5)}s; --orb-delay:${-i * 0.4}s">
      ${s.name}
    </span>
  `).join('');
}

/* ============================================================
   ARCHITECTURE
   ============================================================ */
function buildArchitecture() {
  const mount = d.getElementById('archMount');
  if (!mount) return;
  mount.innerHTML = ARCHITECTURE.map((n, i) => `
    <div class="arch__node reveal" data-reveal style="--node-color:${n.color}" data-cursor="link"
         tabindex="0" role="button" aria-expanded="false" aria-controls="arch-desc-${n.id}">
      <div class="arch__icon">${String(i + 1).padStart(2, '0')}</div>
      <div class="arch__label">
        <h4>${n.label}</h4>
        <small>${n.sub}</small>
      </div>
      <div class="arch__desc" id="arch-desc-${n.id}">${n.desc}</div>
    </div>
    ${i < ARCHITECTURE.length - 1 ? '<div class="arch__connector"></div>' : ''}
  `).join('');
}

/* ============================================================
   TIMELINE
   ============================================================ */
function buildTimeline() {
  const mount = d.getElementById('timelineMount');
  if (!mount) return;
  mount.innerHTML = JOURNEY.map((j) => `
    <div class="tl-item reveal" data-reveal>
      <div class="tl-item__phase">${j.phase}</div>
      <h4 class="tl-item__title">${j.title}</h4>
      <p class="tl-item__desc">${j.desc}</p>
    </div>
  `).join('');
}

/* ============================================================
   STATS
   ============================================================ */
function buildStats() {
  const mount = d.getElementById('statsMount');
  if (!mount) return;
  mount.innerHTML = STATS.map((s) => `
    <div class="stat reveal" data-reveal>
      <div class="stat__num" data-count="${s.value}" data-suffix="${s.suffix}" data-display="${s.display}">0</div>
      <div class="stat__label">${s.label}</div>
      ${s.placeholder ? `<div class="stat__note">${s.note || ''}</div>` : ''}
    </div>
  `).join('');
}

/* ============================================================
   UTIL
   ============================================================ */
function hexToRgba(hex, a) {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

/* ============================================================
   BUILD ALL
   ============================================================ */
export function buildAll() {
  buildProjects();
  buildStack();
  buildArchitecture();
  buildTimeline();
  buildStats();
}
