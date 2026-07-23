/**
 * tools.js — Website action tools for SRIIVERSE AI 2.0.
 *
 * Upgraded from v2:
 * - All original tools preserved (scrollToSection, highlightProject,
 *   openProjectDemo, openGitHub, openContact, showArchitecture,
 *   showTechStack, showTimeline, showAchievements)
 * - NEW: runProactiveTool(intent, focusProject) — triggers background website
 *   actions alongside informational answers (not just on explicit commands)
 * - NEW tools: downloadResume, compareProjects, highlightTechOrbs
 */

import { scrollToId } from '../scroll.js';
import { logWarn } from '../log.js';

const d = document;

/* ---------- highlight helper ---------- */
function highlightEl(el, ms = 2200) {
  if (!el) return;
  el.classList.add('ai-flash');
  setTimeout(() => el.classList.remove('ai-flash'), ms);
}

/* ---------- tech orb highlight helper ---------- */
function highlightOrbsByGroup(group) {
  const orbs = d.querySelectorAll('.orb');
  orbs.forEach((orb) => {
    // orbs don't carry data-group in current HTML — match by text content against stack groups
    orb.classList.add('ai-orb-dim');
  });
  // Find orbs matching the requested group by checking their style var or content
  orbs.forEach((orb) => {
    const text = orb.textContent.trim().toLowerCase();
    const groupMap = {
      backend: ['python', 'flask', 'fastapi', 'rest apis', 'jwt'],
      frontend: ['react', 'tailwindcss', 'typescript', 'javascript'],
      lang: ['python', 'javascript', 'typescript'],
      data: ['postgresql', 'mongodb', 'docker', 'git', 'github', 'llms', 'ollama', 'vercel', 'netlify', 'render'],
      ai: ['llms', 'ollama'],
    };
    const targets = groupMap[group] || [];
    if (targets.some((t) => text.includes(t))) {
      orb.classList.remove('ai-orb-dim');
      orb.classList.add('ai-orb-highlight');
    }
  });
  // Remove after 3s
  setTimeout(() => {
    orbs.forEach((orb) => {
      orb.classList.remove('ai-orb-dim', 'ai-orb-highlight');
    });
  }, 3000);
}

/* ============================================================
   TOOL DEFINITIONS
   ============================================================ */
export const tools = [
  {
    name: 'scrollToSection',
    description: 'Scroll to a section: about, projects, stack, architecture, journey, stats, contact.',
    keywords: ['go to', 'show', 'open', 'navigate', 'scroll', 'take me', 'jump', 'view', 'see'],
    sections: {
      about: '#about', profile: '#about',
      projects: '#projects', work: '#projects',
      stack: '#stack', tech: '#stack', technologies: '#stack',
      architecture: '#architecture', system: '#architecture',
      journey: '#journey', timeline: '#journey',
      stats: '#stats', achievements: '#stats',
      contact: '#contact',
    },
    match(query) {
      const q = query.toLowerCase();
      for (const [k, id] of Object.entries(this.sections)) {
        if (q.includes(k)) return { sectionId: id.replace('#', ''), label: k };
      }
      return null;
    },
    run(args) {
      const ok = scrollToId(args.sectionId);
      return { ok, msg: ok ? `Navigated to the ${args.label} section.` : `Couldn't find that section.` };
    },
  },
  {
    name: 'highlightProject',
    description: 'Scroll to + highlight a specific project.',
    keywords: ['highlight', 'show project', 'jump to project'],
    match(query, knowledge) {
      const q = query.toLowerCase();
      const proj = knowledge.getAllProjects().find((p) => q.includes(p.id) || q.includes(p.name.toLowerCase()));
      if (proj) return { projectId: proj.id, name: proj.name };
      return null;
    },
    run(args) {
      scrollToId('projects', { instant: true });
      setTimeout(() => {
        const card = document.querySelector(`[data-project-id="${args.projectId}"]`);
        if (card) highlightEl(card);
      }, 500);
      return { ok: true, msg: `Highlighting ${args.name}.` };
    },
  },
  {
    name: 'openProjectDemo',
    description: 'Open a project\'s live demo in a new tab.',
    keywords: ['open demo', 'try', 'launch', 'open the demo', 'live demo', 'open project', 'visit'],
    match(query, knowledge) {
      const q = query.toLowerCase();
      const proj = knowledge.getAllProjects().find((p) => q.includes(p.id) || q.includes(p.name.toLowerCase()));
      if (proj && /open|launch|try|visit|demo/.test(q)) return { url: proj.live, name: proj.name };
      return null;
    },
    run(args) {
      window.open(args.url, '_blank', 'noopener');
      return { ok: true, msg: `Opening ${args.name} live demo ↗` };
    },
  },
  {
    name: 'openGitHub',
    description: 'Open GitHub profile or a project repo.',
    keywords: ['github', 'repo', 'repository', 'source code', 'code'],
    match(query, knowledge) {
      const q = query.toLowerCase();
      const proj = knowledge.getAllProjects().find((p) => p.repo && (q.includes(p.id) || q.includes(p.name.toLowerCase())));
      if (proj && /repo|repository|source|code/.test(q)) return { url: proj.repo, name: proj.name, isRepo: true };
      if (/github/.test(q)) return { url: knowledge.getProfile().github, name: 'GitHub profile', isRepo: false };
      return null;
    },
    run(args) {
      window.open(args.url, '_blank', 'noopener');
      return { ok: true, msg: `Opening ${args.name} ↗` };
    },
  },
  {
    name: 'openContact',
    description: 'Scroll to contact / open email.',
    keywords: ['contact', 'email', 'reach', 'get in touch', 'hire', 'message'],
    match(query) {
      if (/contact|email|reach|get in touch|hire|message/.test(query.toLowerCase())) return { sectionId: 'contact' };
      return null;
    },
    run(args, knowledge) {
      scrollToId('contact');
      const email = knowledge.getProfile().email;
      return { ok: true, msg: `The contact section is below. Email: ${email}` };
    },
  },
  {
    name: 'showArchitecture',
    description: 'Navigate to the architecture section.',
    keywords: ['architecture', 'how is it built', 'how does it work', 'system design'],
    match(query) {
      if (/architect|how (is|does).*(built|work)|system design|topolog|layer/.test(query.toLowerCase())) return { sectionId: 'architecture' };
      return null;
    },
    run(args) {
      scrollToId('architecture');
      return { ok: true, msg: `Showing the system architecture.` };
    },
  },
  {
    name: 'showTechStack',
    description: 'Navigate to the technology stack.',
    keywords: ['tech stack', 'technologies', 'tools', 'skills'],
    match(query) {
      if (/\b(stack|technolog|tools|skills|what.*know|what.*use)/.test(query.toLowerCase())) return { sectionId: 'stack' };
      return null;
    },
    run(args) {
      scrollToId('stack');
      return { ok: true, msg: `Showing the technology stack.` };
    },
  },
  {
    name: 'showTimeline',
    description: 'Navigate to the journey timeline.',
    keywords: ['timeline', 'journey', 'history', 'path', 'background'],
    match(query) {
      if (/timeline|journey|history|career path|background/.test(query.toLowerCase())) return { sectionId: 'journey' };
      return null;
    },
    run(args) {
      scrollToId('journey');
      return { ok: true, msg: `Showing the journey timeline.` };
    },
  },
  {
    name: 'showAchievements',
    description: 'Navigate to stats/achievements.',
    keywords: ['achievements', 'stats', 'numbers', 'metrics'],
    match(query) {
      if (/achievement|stats|numbers|metrics/.test(query.toLowerCase())) return { sectionId: 'stats' };
      return null;
    },
    run(args) {
      scrollToId('stats');
      return { ok: true, msg: `Showing achievements.` };
    },
  },

  /* ============================================================
     NEW TOOLS (v2.0)
     ============================================================ */
  {
    name: 'downloadResume',
    description: 'Trigger resume PDF download.',
    keywords: ['download resume', 'resume', 'cv', 'get resume'],
    match(query) {
      if (/download.*resume|get.*resume|resume.*pdf|cv/i.test(query)) return {};
      return null;
    },
    run() {
      return triggerResumeDownload();
    },
  },
  {
    name: 'compareProjects',
    description: 'Scroll to projects and highlight two project cards side-by-side.',
    keywords: ['compare', 'vs', 'versus', 'difference between'],
    match(query, knowledge) {
      const q = query.toLowerCase();
      if (!/compare|vs\.?|versus|difference between/.test(q)) return null;
      const all = knowledge.getAllProjects();
      const found = all.filter((p) => q.includes(p.id) || q.includes(p.name.toLowerCase()));
      if (found.length >= 2) return { projectA: found[0], projectB: found[1] };
      return null;
    },
    run(args) {
      scrollToId('projects');
      setTimeout(() => {
        const cardA = document.querySelector(`[data-project-id="${args.projectA.id}"]`);
        const cardB = document.querySelector(`[data-project-id="${args.projectB.id}"]`);
        if (cardA) highlightEl(cardA, 3000);
        if (cardB) setTimeout(() => highlightEl(cardB, 3000), 300);
      }, 600);
      return { ok: true, msg: `Comparing ${args.projectA.name} and ${args.projectB.name}.` };
    },
  },
  {
    name: 'highlightTechOrbs',
    description: 'Highlight specific tech orbs in the stack section by technology group.',
    keywords: ['highlight tech', 'show backend tech', 'show ai stack'],
    match(query) {
      const q = query.toLowerCase();
      if (/backend.*tech|python.*stack|flask|fastapi/.test(q)) return { group: 'backend' };
      if (/frontend.*tech|react|tailwind/.test(q)) return { group: 'frontend' };
      if (/ai.*tech|llm|ollama/.test(q)) return { group: 'ai' };
      return null;
    },
    run(args) {
      scrollToId('stack');
      setTimeout(() => highlightOrbsByGroup(args.group), 700);
      return { ok: true, msg: `Highlighting ${args.group} technologies in the stack section.` };
    },
  },
];

/* ============================================================
   EXPLICIT TOOL ROUTER (user said "open / show / navigate")
   ============================================================ */
export function decideTool(query, knowledge) {
  const q = query.toLowerCase().trim();
  const hasActionVerb = /\b(open|launch|try|visit|go|show|take me|navigate|jump|scroll|highlight|view|download)\b/.test(q);
  const isAction = hasActionVerb || /\b(demo|github|repo|contact|email|hire|resume|cv)\b/.test(q);
  if (!isAction) return null;

  for (const tool of tools) {
    const args = tool.match ? tool.match(q, knowledge) : null;
    if (args) return { tool, args };
  }
  return null;
}

/* ============================================================
   PROACTIVE TOOL ENGINE (new in v2.0)
   Runs after the provider generates a response.
   Automatically triggers background website actions based on intent.
   ============================================================ */
export function runProactiveTool(intent, focusProject, knowledge) {
  // Delay all proactive actions slightly so text response streams first
  const delay = (ms, fn) => setTimeout(fn, ms);

  // If discussing a specific project → scroll + highlight it softly
  if (focusProject) {
    delay(800, () => {
      scrollToId('projects', { instant: false });
      setTimeout(() => {
        const card = document.querySelector(`[data-project-id="${focusProject}"]`);
        if (card) {
          // Soft highlight: add glow class but not the full flash
          card.classList.add('ai-glow');
          setTimeout(() => card.classList.remove('ai-glow'), 3000);
        }
      }, 600);
    });
    return;
  }

  // Intent-based proactive navigation
  switch (intent) {
    case 'architecture':
      delay(600, () => scrollToId('architecture'));
      break;
    case 'stack':
      delay(600, () => scrollToId('stack'));
      break;
    case 'recruiter':
      delay(800, () => scrollToId('contact'));
      break;
    case 'profile':
      delay(600, () => scrollToId('about'));
      break;
    default:
      break;
  }
}

/** Execute a decided explicit tool. Returns its result. */
export function runTool(decision) {
  try {
    return decision.tool.run(decision.args, knowledgeRef);
  } catch (e) {
    return { ok: false, msg: `Tool failed: ${e.message}` };
  }
}

/* ============================================================
   CANONICAL RESUME DOWNLOAD FLOW
   Single implementation shared by the chat tool above and the
   static résumé buttons wired in main.js — replaces the previous
   two divergent code paths (one of which had a stale hardcoded email).
   ============================================================ */
export function triggerResumeDownload() {
  const path = './assets/resume.pdf';

  // Don't fail silently if the asset is missing (docs/CURSOR_RULES.md —
  // Error Handling): log it clearly without blocking the (optimistic)
  // download attempt or introducing an async result that would break callers.
  fetch(path, { method: 'HEAD' })
    .then((res) => {
      if (!res.ok) {
        logWarn('resume', `${path} returned ${res.status} — add the PDF at ${path} (repo root) before shipping this link.`);
      }
    })
    .catch(() => logWarn('resume', `Could not verify ${path} exists.`));

  const link = document.createElement('a');
  link.href = path;
  link.download = 'Sudhanshu_Sinha_Resume.pdf';
  link.click();
  return { ok: true, msg: 'Downloading resume — Sudhanshu_Sinha_Resume.pdf' };
}

// late-bound knowledge ref (avoids circular import at module load)
let knowledgeRef = { getAllProjects: () => [], getProfile: () => ({}) };
export function setKnowledgeRef(k) { knowledgeRef = k; }
