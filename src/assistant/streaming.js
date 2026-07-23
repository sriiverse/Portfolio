/**
 * streaming.js — Streaming engine for SRIIVERSE AI.
 *
 * Reveals text word-by-word (typewriter) with variable cadence, cancellable.
 * Renders into a target element via a renderer callback so markdown/cards
 * stream correctly.
 *
 * Usage:
 *   const stream = createStream(targetEl, rendererFn, { speed });
 *   for (const chunk of chunks) stream.push(chunk);
 *   await stream.done();
 */

const DEFAULT_SPEED = 18;   // ms per token (word/punct)
const PUNCT_PAUSE = 40;     // extra pause on sentence punctuation
const MIN_CHUNK = 8;        // ms floor

function tokenizeForStream(text) {
  // keep punctuation attached so we get natural pausing; split on whitespace boundaries
  return text.match(/\S+\s*/g) || [text];
}

export function createStream(targetEl, renderFn, opts = {}) {
  const speed = Math.max(MIN_CHUNK, opts.speed || DEFAULT_SPEED);
  let buffer = '';
  let cancelled = false;
  let queue = [];          // queued tokens
  let pumping = false;

  function renderNow() {
    targetEl.innerHTML = renderFn(buffer);
  }

  async function pump() {
    if (pumping) return;
    pumping = true;
    while (queue.length && !cancelled) {
      const tok = queue.shift();
      buffer += tok;
      renderNow();
      // pause longer after sentence-ending punctuation
      const last = tok.trim().slice(-1);
      const wait = /[.!?]/.test(last) ? speed + PUNCT_PAUSE
        : /[,;:]/.test(last) ? speed + PUNCT_PAUSE / 2
        : speed;
      await sleep(wait);
    }
    pumping = false;
  }

  return {
    /** Push a chunk (string). Tokenized + queued. */
    push(chunk) {
      if (cancelled) return;
      queue.push(...tokenizeForStream(String(chunk)));
      pump();
    },
    /** Replace entire buffer instantly (e.g. for tool results). */
    set(text) {
      buffer = String(text);
      queue = [];
      renderNow();
    },
    /** Signal end of stream — resolves when buffer fully rendered. */
    async done() {
      // wait for pump to drain
      while (pumping) await sleep(20);
    },
    cancel() { cancelled = true; queue = []; },
    get isDone() { return !pumping && !queue.length; },
  };
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
