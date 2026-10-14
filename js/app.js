import { loadModels, modelsReady, runTests, parseTests, splitSentences, CONFIG, TJS_VERSION, EMBED_MODEL, NLI_MODEL } from './core.js';
import { SOURCES, TUNING, HELDOUT } from './data.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ------------------------------------------------------------ presets
const TESTS = {
  python: `# test_llm_answer.py
# claims pulled from an LLM answer to
# "give me a short history of Python"

def test_origin():
    assert "Python was created by Guido van Rossum"
    assert "Python was created at Bell Labs in the United States"
    assert "Python was first released in 1991"

def test_versions():
    assert "Python 2.0 was released in 2008"
    assert "Python 3.0 is fully backward-compatible with Python 2"

def test_language():
    assert "Python is a statically typed language"
    assert "Python is named after the comedy group Monty Python"
    assert "Python is the most popular language on GitHub"
`,
  refunds: `# test_llm_answer.py
# a support bot answered "can I return my order?"

def test_returns():
    assert "Customers can return items within 30 days of delivery"
    assert "Gift cards can be returned for a full refund"
    assert "International customers get free return shipping"

def test_extras():
    assert "Northwind Audio offers a two-year warranty on all products"
`,
  eiffel: `# test_llm_answer.py
# an LLM's paragraph about the Eiffel Tower

def test_facts():
    assert "The Eiffel Tower is located in Paris"
    assert "The Eiffel Tower was completed in 1899"
    assert "The Eiffel Tower was built for the 1900 Olympic Games"
    assert "Leading artists criticised the tower's design"

def test_trivia():
    assert "The Eiffel Tower is repainted every seven years"
`,
};
const PRESETS = [
  ['python', 'python history', 'sample · tuning set'],
  ['refunds', 'support bot', 'held-out'],
  ['eiffel', 'eiffel tower', 'held-out'],
];
const LABELS = new Map([...TUNING, ...HELDOUT].map((x) => [x.src + '|' + x.claim, x.label]));

const srcEl = $('#src'), testEl = $('#tests'), gutter = $('#gutter');
const term = $('#term'), evList = $('#evidence'), runBtn = $('#run'), meta = $('#meta');
let preset = 'python';

function setPreset(key) {
  preset = key;
  srcEl.value = SOURCES[key];
  testEl.value = TESTS[key];
  document.querySelectorAll('.preset').forEach((b) => b.setAttribute('aria-pressed', b.dataset.key === key));
  updateGutter(); updateCounts();
}

function updateGutter() {
  const n = testEl.value.split('\n').length;
  gutter.textContent = Array.from({ length: n }, (_, i) => i + 1).join('\n');
  gutter.scrollTop = testEl.scrollTop;
}
function updateCounts() {
  $('#src-count').textContent = `${splitSentences(srcEl.value).length} sentences`;
  const { tests, errors } = parseTests(testEl.value);
  $('#test-count').textContent = `${tests.length} asserts` + (errors.length ? ` · ${errors.length} unreadable` : '');
}

const presetBar = $('#presets');
PRESETS.forEach(([key, name, note]) => {
  const b = document.createElement('button');
  b.className = 'preset'; b.dataset.key = key; b.type = 'button';
  b.innerHTML = `${esc(name)} <span>${esc(note)}</span>`;
  b.onclick = () => setPreset(key);
  presetBar.appendChild(b);
});
testEl.addEventListener('input', () => { updateGutter(); updateCounts(); });
testEl.addEventListener('scroll', () => { gutter.scrollTop = testEl.scrollTop; });
srcEl.addEventListener('input', () => {
  updateCounts();
  preset = Object.keys(SOURCES).find((k) => SOURCES[k] === srcEl.value) || null;
});
testEl.addEventListener('keydown', (e) => {
  if (e.key === 'Tab' && !e.shiftKey) { // indent with 4 spaces, like a code editor
    e.preventDefault();
    const { selectionStart: a, selectionEnd: b } = testEl;
    testEl.setRangeText('    ', a, b, 'end');
    updateGutter();
  }
});
document.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') run(); });

// ------------------------------------------------------------ terminal
function cols() {
  const probe = document.createElement('span');
  probe.textContent = 'x'.repeat(20);
  probe.style.visibility = 'hidden';
  term.appendChild(probe);
  const cw = probe.getBoundingClientRect().width / 20;
  probe.remove();
  const inner = term.clientWidth - 2 * parseFloat(getComputedStyle(term).paddingLeft);
  return Math.max(36, Math.min(92, Math.floor(inner / (cw || 7.8))));
}
const rule = (title, ch, w) => {
  if (!title) return ch.repeat(w);
  const t = ` ${title} `;
  const left = Math.max(2, Math.floor((w - t.length) / 2));
  return ch.repeat(left) + t + ch.repeat(Math.max(2, w - left - t.length));
};
const C = { PASS: 'ok', FAIL: 'bad', SKIP: 'skip' };
const WORD = { PASS: 'PASSED', FAIL: 'FAILED', SKIP: 'SKIPPED' };
const pct = (x) => (x * 100).toFixed(0) + '%';
const p2 = (x) => x.toFixed(2);
const short = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

function say(html) { term.innerHTML = html; }

function render(tests, errors, out, loadInfo) {
  const w = cols();
  const L = [];
  L.push(`<span class="dim">$ pytest -v test_llm_answer.py</span>`);
  L.push(`<b>${rule('test session starts', '=', w)}</b>`);
  L.push(`platform browser -- transformers.js ${TJS_VERSION}, onnxruntime-web (wasm)`);
  L.push(`retriever: ${EMBED_MODEL} (top-${CONFIG.topK} cosine)`);
  L.push(`judge: ${NLI_MODEL} (int8)`);
  L.push(`rootdir: conftest.py -- ${out.sentences} sentences of source`);
  L.push(`<b>collected ${tests.length} item${tests.length === 1 ? '' : 's'}${errors.length ? ` / ${errors.length} error${errors.length > 1 ? 's' : ''}` : ''}</b>`);
  L.push('');
  const n = out.results.length;
  out.results.forEach((r, i) => {
    const t = tests[i];
    let left = `test_llm_answer.py::${t.id} `;
    if (left.length + 7 + 7 > w) left = `::${t.id} `; // narrow screens: drop the file name
    const word = WORD[r.outcome];
    const prog = `[${String(Math.round(((i + 1) / n) * 100)).padStart(3)}%]`;
    const pad = Math.max(1, w - left.length - word.length - prog.length - 1);
    const line = left.length + word.length + prog.length + 1 <= w
      ? `${esc(left)}<span class="${C[r.outcome]}">${word}</span>${' '.repeat(pad)}<span class="dim">${prog}</span>`
      : `${esc(left)}<span class="${C[r.outcome]}">${word}</span>`;
    L.push(`<a href="#ev-${i}" class="tl" data-i="${i}">${line}</a>`);
  });
  errors.forEach((e) => L.push(`test_llm_answer.py:${e.line} <span class="bad">ERROR</span> <span class="dim">could not read assert</span>`));

  const fails = out.results.map((r, i) => [r, tests[i]]).filter(([r]) => r.outcome === 'FAIL');
  if (fails.length) {
    L.push('');
    L.push(`<span class="bad">${rule('FAILURES', '=', w)}</span>`);
    fails.forEach(([r, t]) => {
      L.push(`<span class="bad">${rule(t.id, '_', w)}</span>`);
      L.push('');
      L.push(`    assert "${esc(t.claim)}"`);
      L.push(`<span class="bad">E   AssertionError: contradicted by the source (p=${p2(r.p)})</span>`);
      L.push(`<span class="bad">E     source: "${esc(short(r.by.sentence, w - 16))}"</span>`);
      L.push('');
      L.push(`<span class="bad">test_llm_answer.py</span>:${t.line}: AssertionError`);
    });
  }
  L.push(`<span class="dim">${rule('short test summary info', '=', w)}</span>`);
  out.results.forEach((r, i) => {
    const t = tests[i];
    if (r.outcome === 'FAIL') L.push(`<span class="bad">FAILED</span> test_llm_answer.py::${t.id} - contradicted (${p2(r.p)})`);
  });
  out.results.forEach((r, i) => {
    const t = tests[i];
    if (r.outcome === 'SKIP') L.push(`<span class="skip">SKIPPED</span> [1] test_llm_answer.py:${t.line}: source is silent (neutral ${p2(r.p)})`);
  });
  errors.forEach((e) => L.push(`<span class="bad">ERROR</span> test_llm_answer.py:${e.line} - expected: assert "claim"`));

  const k = { PASS: 0, FAIL: 0, SKIP: 0 };
  out.results.forEach((r) => k[r.outcome]++);
  const parts = [];
  if (k.FAIL) parts.push(`<span class="bad">${k.FAIL} failed</span>`);
  if (k.PASS) parts.push(`<span class="ok">${k.PASS} passed</span>`);
  if (k.SKIP) parts.push(`<span class="skip">${k.SKIP} skipped</span>`);
  if (errors.length) parts.push(`<span class="bad">${errors.length} error${errors.length > 1 ? 's' : ''}</span>`);
  const sec = (out.ms.total / 1000).toFixed(2);
  const plain = `${k.FAIL ? k.FAIL + ' failed, ' : ''}${k.PASS ? k.PASS + ' passed, ' : ''}${k.SKIP ? k.SKIP + ' skipped, ' : ''}${errors.length ? errors.length + ' errors, ' : ''}in ${sec}s`;
  const cls = k.FAIL || errors.length ? 'bad' : k.PASS ? 'ok' : 'skip';
  const fin = rule(plain, '=', w);
  const at = fin.indexOf(plain);
  L.push(`<span class="${cls}">${fin.slice(0, at)}</span>${parts.join(', ')}, in ${sec}s<span class="${cls}">${fin.slice(at + plain.length)}</span>`);
  term.innerHTML = L.join('\n');

  meta.innerHTML = [
    `<span>models <b>${(loadInfo.ms / 1000).toFixed(2)} s</b>${loadInfo.fresh ? '' : ' (already loaded)'}</span>`,
    `<span>embed <b>${out.ms.embed.toFixed(0)} ms</b></span>`,
    `<span>nli <b>${out.ms.nli.toFixed(0)} ms</b> · ${out.results.length * CONFIG.topK} pairs</span>`,
    `<span>total <b>${out.ms.total.toFixed(0)} ms</b></span>`,
  ].join('');

  renderEvidence(tests, out);
}

function bar(e) {
  return `<div class="bar" aria-hidden="true"><i class="e" style="width:${pct(e.entail)}"></i><i class="c" style="width:${pct(e.contra)}"></i><i class="n" style="width:${pct(e.neutral)}"></i></div>`;
}

function renderEvidence(tests, out) {
  evList.innerHTML = out.results.map((r, i) => {
    const t = tests[i];
    const lab = preset ? LABELS.get(preset + '|' + t.claim) : null;
    const labHtml = lab ? `<span class="lab ${lab === r.outcome ? 'agree' : 'miss'}" title="my hand label for this claim">label ${lab}${lab === r.outcome ? '' : ' · miss'}</span>` : '';
    const ev = r.evidence.map((e, k) => `
      <li class="${e === r.by ? 'used' : ''}">
        <div class="ev-top"><span class="rank">#${k + 1}</span><span>cos ${p2(e.cos)}</span><span>line ${e.idx + 1}</span>${e === r.by ? `<span class="why">decided ${r.outcome}</span>` : ''}</div>
        <p>${e.context.length ? `<span class="ctx" title="context given to the NLI model">${esc(e.context.join(' '))}</span> ` : ''}${esc(e.sentence)}</p>
        ${bar(e)}
        <div class="probs"><span class="pe">entail ${p2(e.entail)}</span><span class="pc">contra ${p2(e.contra)}</span><span class="pn">neutral ${p2(e.neutral)}</span></div>
      </li>`).join('');
    return `<details class="ev" id="ev-${i}"${r.outcome === 'FAIL' && i === out.results.findIndex((x) => x.outcome === 'FAIL') ? ' open' : ''}>
      <summary><span class="chip ${C[r.outcome]}">${r.outcome}</span><span class="claim">${esc(t.claim)}</span><span class="pp">${p2(r.p)}</span>${labHtml}</summary>
      <ol>${ev}</ol>
    </details>`;
  }).join('');
  $('#ev-head').hidden = false;
}

term.addEventListener('click', (e) => {
  const a = e.target.closest('a.tl');
  if (!a) return;
  e.preventDefault();
  const d = document.getElementById('ev-' + a.dataset.i);
  d.open = true;
  d.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});

// ------------------------------------------------------------ run
let busy = false, loadInfo = null;
async function run() {
  if (busy) return;
  const { tests, errors } = parseTests(testEl.value);
  if (!tests.length) {
    say(`<span class="dim">$ pytest -v test_llm_answer.py</span>\n<span class="bad">no tests collected</span> - write claims as lines like:\n    assert "The tower is 330 metres tall"`);
    return;
  }
  if (!splitSentences(srcEl.value).length) {
    say(`<span class="bad">conftest.py is empty</span> - paste a source of truth first.`);
    return;
  }
  busy = true; runBtn.disabled = true; runBtn.classList.add('busy');
  try {
    if (!modelsReady()) {
      say(`<span class="dim">$ pytest -v test_llm_answer.py</span>\nloading models (first run downloads ~115 MB, then the browser caches them)…`);
      const r = await loadModels((f, total) => {
        say(`<span class="dim">$ pytest -v test_llm_answer.py</span>\nloading models… ${pct(f)} of ${(total / 1e6).toFixed(0)} MB`);
      });
      loadInfo = { ms: r.ms, fresh: true };
    } else loadInfo = { ...loadInfo, fresh: false };
    say(term.innerHTML + `\nrunning ${tests.length} claims…`);
    const out = await runTests(srcEl.value, tests.map((t) => t.claim));
    render(tests, errors, out, loadInfo);
    window.__LAST = { n: tests.length, ms: out.ms, load: loadInfo.ms, outcomes: out.results.map((r) => r.outcome) };
  } catch (err) {
    console.error(err);
    say(`<span class="bad">INTERNALERROR</span> ${esc(err.message || err)}\n<span class="dim">this demo needs a recent browser with WebAssembly; try reloading.</span>`);
    window.__LAST = { error: String(err) };
  } finally {
    busy = false; runBtn.disabled = false; runBtn.classList.remove('busy');
  }
}
runBtn.addEventListener('click', run);

setPreset('python');
window.__runTests = run;
