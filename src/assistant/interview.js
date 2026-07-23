/**
 * interview.js — Interview Mode session engine for SRIIVERSE AI (Sprint 3).
 *
 * Manages interview session state and progression ONLY. It is deliberately
 * UI-agnostic and provider-agnostic:
 *   - Never touches the DOM.
 *   - Never calls a provider (interview turns never reach providers.js —
 *     see assistant.js's mode gate).
 *   - Never produces markdown/HTML — it returns plain structured data
 *     ({ event, topic, question, progress, ... }); assistant.js (the
 *     orchestrator) is responsible for turning that into response text,
 *     exactly the way providers.js turns jdmatch.js's structured output
 *     into a response.
 *
 * Session state is an in-memory singleton only (like awareness.js) — it is
 * NOT persisted to sessionStorage, so a page reload cleanly resets a session.
 */
import { INTERVIEW_QUESTIONS } from '../content.js';

const TOPICS = Object.keys(INTERVIEW_QUESTIONS); // ['python','sql','react','backend','ai-ml']

const TOPIC_PATTERNS = {
  python: /\bpython\b/i,
  sql: /\bsql\b/i,
  react: /\breact\b/i,
  backend: /\bbackend\b/i,
  'ai-ml': /\b(ai|ml|ai\/ml|machine learning|artificial intelligence)\b/i,
};

// Anchored to the *whole* (trimmed) message, not a substring match — a real
// technical answer legitimately contains words like "stop" or "end" (e.g.
// "the loop runs until the end of the list"), so this must require the
// message to BE an exit command, not merely mention one.
const EXIT_PATTERN = /^(stop|exit|end|quit)(\s+(the\s+)?interview)?\.?!?$/i;

class InterviewSession {
  constructor() {
    this._reset();
  }

  _reset() {
    this.status = 'idle';       // 'idle' | 'awaiting-topic' | 'in-progress'
    this.topic = null;
    this.questionIndex = 0;
    this.coverageScores = [];
  }

  /* ---------- public API ---------- */

  isActive() {
    return this.status !== 'idle';
  }

  /** Progress snapshot for display — null when no session is running. */
  getProgress() {
    if (this.status === 'idle') return null;
    return {
      status: this.status,
      topic: this.topic,
      questionIndex: this.questionIndex,
      total: this.topic ? INTERVIEW_QUESTIONS[this.topic].length : 0,
    };
  }

  /**
   * Called by assistant.js when a fresh 'interview' intent is classified
   * (i.e. no session is currently active). `rawText` is the triggering
   * message, scanned for a topic keyword.
   */
  start(rawText) {
    const topic = resolveTopic(rawText);
    if (!topic) {
      this.status = 'awaiting-topic';
      return { event: 'awaiting-topic', topics: TOPICS };
    }
    return this._beginTopic(topic);
  }

  /** Called by assistant.js's mode gate for every turn while isActive(). */
  handleTurn(rawText) {
    if (EXIT_PATTERN.test(String(rawText || '').trim())) {
      const progress = this.getProgress();
      this._reset();
      return { event: 'exited', progress };
    }

    if (this.status === 'awaiting-topic') {
      const topic = resolveTopic(rawText);
      if (!topic) return { event: 'awaiting-topic', topics: TOPICS };
      return this._beginTopic(topic);
    }

    // status === 'in-progress' — rawText is an answer to the current question
    const bank = INTERVIEW_QUESTIONS[this.topic];
    const question = bank[this.questionIndex];
    const { coverage, matchedKeywords, missingKeywords } = scoreAnswer(rawText, question.keywords);
    this.coverageScores.push(coverage);

    const nextIndex = this.questionIndex + 1;
    if (nextIndex >= bank.length) {
      const summary = {
        event: 'summary',
        topic: this.topic,
        totalQuestions: bank.length,
        averageCoverage: average(this.coverageScores),
        lastCoverage: coverage,
        lastMatchedKeywords: matchedKeywords,
        lastMissingKeywords: missingKeywords,
      };
      this._reset();
      return summary;
    }

    this.questionIndex = nextIndex;
    return {
      event: 'feedback',
      topic: this.topic,
      coverage,
      matchedKeywords,
      missingKeywords,
      questionIndex: this.questionIndex,
      total: bank.length,
      question: bank[this.questionIndex],
    };
  }

  reset() { this._reset(); }

  /* ---------- internal ---------- */

  _beginTopic(topic) {
    this.status = 'in-progress';
    this.topic = topic;
    this.questionIndex = 0;
    this.coverageScores = [];
    return {
      event: 'question',
      topic,
      questionIndex: 0,
      total: INTERVIEW_QUESTIONS[topic].length,
      question: INTERVIEW_QUESTIONS[topic][0],
    };
  }
}

function resolveTopic(text) {
  const t = String(text || '');
  for (const topic of TOPICS) {
    if (TOPIC_PATTERNS[topic].test(t)) return topic;
  }
  return null;
}

/** Keyword-coverage scoring of the visitor's answer — directional, not a verdict. */
function scoreAnswer(answerText, keywords) {
  if (!keywords.length) return { coverage: 0, matchedKeywords: [], missingKeywords: [] };
  const normalized = String(answerText || '').toLowerCase();
  const matchedKeywords = keywords.filter((k) => normalized.includes(k.toLowerCase()));
  const missingKeywords = keywords.filter((k) => !matchedKeywords.includes(k));
  return { coverage: matchedKeywords.length / keywords.length, matchedKeywords, missingKeywords };
}

function average(nums) {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export const interview = new InterviewSession();
export default interview;
