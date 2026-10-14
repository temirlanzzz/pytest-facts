// pytest-facts engine: sentence splitting, assert parsing, retrieval + NLI verdicts.
// Everything runs in the browser through transformers.js (onnxruntime-web, WASM).

export const TJS_VERSION = '3.8.1';
const TJS_URL = `https://cdn.jsdelivr.net/npm/@huggingface/transformers@${TJS_VERSION}`;

export const EMBED_MODEL = 'Xenova/all-MiniLM-L6-v2';
export const NLI_MODEL = 'Xenova/nli-deberta-v3-xsmall';

// Settings. Thresholds were picked on the 8-claim tuning sample only.
export const CONFIG = {
  topK: 3,          // evidence sentences per claim
  passAt: 0.5,      // best entailment prob needed for PASS
  failAt: 0.5,      // best contradiction prob needed for FAIL
  premise: 'doc',   // how much context each NLI premise gets, see buildPremises()
  embedOn: 'premise', // retrieve on the premise text (with context) or the bare sentence
  rule: 'entail-first', // 'entail-first' | 'max'
};

const PRONOUN = /^(it|its|they|their|them|he|his|she|her|this|these|those|that|such)/i;

// Sentence i alone is often meaningless to an NLI model ("It was first released in 1991").
//   sent  : the sentence alone
//   prev  : previous sentence + sentence
//   chain : walk back through pronoun-led sentences to the last one that names its subject
//   doc   : 'chain' plus the document's first sentence (names the topic for "The language ...")
export function buildPremises(sents, mode = CONFIG.premise) {
  return sents.map((s, i) => {
    if (mode === 'sent' || i === 0) return [i];
    if (mode === 'prev') return [i - 1, i];
    let j = i;
    while (j > 0 && PRONOUN.test(sents[j])) j--;
    const ids = [];
    for (let k = Math.max(j, i - 3); k <= i; k++) ids.push(k);
    if (mode === 'doc' && ids[0] !== 0) ids.unshift(0);
    return ids;
  });
}

// ---------------------------------------------------------------- text utils

// Split on . ! ? (plus an optional closing quote/bracket) followed by whitespace and
// a capital letter, or on blank lines. "Python 3.0" and "$50.00" survive because
// there is no whitespace after their dot.
export function splitSentences(text) {
  const out = [];
  for (const para of text.replace(/\r/g, '').split(/\n\s*\n+/)) {
    const p = para.replace(/\s+/g, ' ').trim();
    if (!p) continue;
    for (const s of p.split(/(?<=[.!?]["'”)\]]?)\s+(?=["'“(\[]?[A-Z0-9])/)) {
      const t = s.trim();
      if (t) out.push(t);
    }
  }
  return out;
}

// Parse a test file: every `assert "claim"` line is one test.
// `def test_x():` lines name the asserts that follow. Anything else is ignored,
// except an `assert` we cannot read, which becomes a collection error.
export function parseTests(code) {
  const tests = [];
  const errors = [];
  let fn = 'test_answer';
  let idx = 0;
  code.replace(/\r/g, '').split('\n').forEach((raw, i) => {
    const line = raw.trim();
    const def = line.match(/^def\s+(test_\w*|\w+)\s*\(/);
    if (def) { fn = def[1]; idx = 0; return; }
    if (!/^assert\b/.test(line)) return;
    const m = line.match(/^assert\s+(["'])((?:\\.|(?!\1).)*)\1\s*(?:,\s*(["'])((?:\\.|(?!\3).)*)\3)?\s*(?:#.*)?$/);
    if (!m) { errors.push({ line: i + 1, text: line }); return; }
    const claim = m[2].replace(/\\(.)/g, '$1').trim();
    if (!claim) { errors.push({ line: i + 1, text: line }); return; }
    idx++;
    tests.push({ id: `${fn}[${idx}]`, fn, line: i + 1, claim, msg: m[4] || '' });
  });
  return { tests, errors };
}

// ---------------------------------------------------------------- models

let lib = null, embedder = null, tok = null, nli = null, labelIdx = null;

export async function loadModels(onProgress = () => {}) {
  const t0 = performance.now();
  lib = lib || await import(TJS_URL);
  lib.env.allowLocalModels = false;
  const files = new Map();
  const cb = (p) => {
    if (p.status === 'progress' && p.total) {
      files.set(p.file + p.name, [p.loaded, p.total]);
      let a = 0, b = 0;
      for (const [l, t] of files.values()) { a += l; b += t; }
      onProgress(a / b, b);
    }
  };
  const [emb, tk, md] = await Promise.all([
    lib.pipeline('feature-extraction', EMBED_MODEL, { dtype: 'q8', progress_callback: cb }),
    lib.AutoTokenizer.from_pretrained(NLI_MODEL, { progress_callback: cb }),
    lib.AutoModelForSequenceClassification.from_pretrained(NLI_MODEL, { dtype: 'int8', progress_callback: cb }),
  ]);
  embedder = emb; tok = tk; nli = md;
  // label order comes from the model's config: {0: contradiction, 1: entailment, 2: neutral}
  const id2label = nli.config.id2label;
  labelIdx = {};
  for (const [k, v] of Object.entries(id2label)) labelIdx[v.toLowerCase()] = +k;
  return { ms: performance.now() - t0, id2label };
}

export const modelsReady = () => !!(embedder && nli);

async function embed(texts) {
  const out = await embedder(texts, { pooling: 'mean', normalize: true });
  const [n, d] = out.dims;
  const v = out.data;
  return Array.from({ length: n }, (_, i) => v.subarray(i * d, (i + 1) * d));
}

const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

async function classify(premises, hypotheses) {
  const inputs = tok(premises, { text_pair: hypotheses, padding: true, truncation: true });
  const { logits } = await nli(inputs);
  const [n, k] = logits.dims;
  const L = logits.data;
  const res = [];
  for (let i = 0; i < n; i++) {
    const row = Array.from(L.subarray(i * k, (i + 1) * k));
    const mx = Math.max(...row);
    const ex = row.map((x) => Math.exp(x - mx));
    const z = ex.reduce((a, b) => a + b, 0);
    const p = ex.map((x) => x / z);
    res.push({
      entail: p[labelIdx.entailment],
      contra: p[labelIdx.contradiction],
      neutral: p[labelIdx.neutral],
    });
  }
  return res;
}

// ---------------------------------------------------------------- judging

export function verdict(evidence, cfg = CONFIG) {
  let bestE = evidence[0], bestC = evidence[0];
  for (const ev of evidence) {
    if (ev.entail > bestE.entail) bestE = ev;
    if (ev.contra > bestC.contra) bestC = ev;
  }
  if (bestE.entail >= cfg.passAt && (cfg.rule === 'entail-first' || bestE.entail >= bestC.contra))
    return { outcome: 'PASS', p: bestE.entail, by: bestE };
  if (bestC.contra >= cfg.failAt)
    return { outcome: 'FAIL', p: bestC.contra, by: bestC };
  const top = evidence[0];
  return { outcome: 'SKIP', p: top.neutral, by: top };
}

// Run every claim against the source. Returns per-claim evidence and timings.
export async function runTests(source, claims, cfg = CONFIG) {
  const t0 = performance.now();
  const sents = splitSentences(source);
  if (!sents.length) throw new Error('the source of truth is empty');
  const ctx = buildPremises(sents, cfg.premise);
  const premises = ctx.map((ids) => ids.map((k) => sents[k]).join(' '));

  const vecs = await embed([...(cfg.embedOn === 'premise' ? premises : sents), ...claims]);
  const sv = vecs.slice(0, sents.length), cv = vecs.slice(sents.length);
  const tEmbed = performance.now();

  const picks = cv.map((c) =>
    sv.map((s, i) => ({ i, cos: dot(c, s) }))
      .sort((a, b) => b.cos - a.cos)
      .slice(0, Math.min(cfg.topK, sents.length)));

  const P = [], H = [];
  picks.forEach((ps, ci) => ps.forEach((p) => { P.push(premises[p.i]); H.push(claims[ci]); }));
  const probs = await classify(P, H);
  const tNli = performance.now();

  let j = 0;
  const results = picks.map((ps, ci) => {
    const evidence = ps.map((p) => ({
      idx: p.i,
      sentence: sents[p.i],
      context: ctx[p.i].filter((k) => k !== p.i).map((k) => sents[k]),
      cos: p.cos,
      ...probs[j++],
    }));
    return { claim: claims[ci], evidence, ...verdict(evidence, cfg) };
  });
  return {
    results,
    sentences: sents.length,
    ms: { total: tNli - t0, embed: tEmbed - t0, nli: tNli - tEmbed },
  };
}
