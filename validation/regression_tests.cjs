/**
 * VOSviewer & SNA 知識結構分析工作台：數值核心回歸測試
 *
 * 從 index.html 抽出分群與入圖節點篩選的函式，在 Node.js 中執行，不啟動網頁、不修改原始檔。
 * 測試中的模組度一律以本檔內獨立撰寫的「逐對節點公式」計算，不沿用受測函式。
 *
 * 第 1–14 項為數值核心單元測試；第 15–18 項為整合測試：以最小的 DOM 替身載入應用程式本身的
 * executeSnaAndRenderGraph()、buildCoocNetwork()、runSensitivity() 與 CSV 匯出，
 * 確認敏感度分析實際走到的呼叫路徑（而不只是直接呼叫篩選函式）。
 * 搭配 mutation_check.cjs 可確認：刻意植入已知錯誤時，本測試確實會失敗。
 *
 * 執行（需 Node.js 18 以上）：
 *   node validation/regression_tests.cjs index.html
 * 全部通過時結束碼為 0；任何一項失敗時為 1。
 */
'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const htmlPath = path.resolve(process.argv[2] || path.join(__dirname, '..', 'index.html'));
const html = fs.readFileSync(htmlPath, 'utf8');
function loadSection(startText, endText) {
  const start = html.indexOf(startText);
  const end = html.indexOf(endText, start);
  if (start < 0 || end <= start) throw new Error(`找不到程式區塊：${startText}（程式版本可能已變更）`);
  vm.runInThisContext(html.slice(start, end));
}
loadSection('    const STABILITY_RUNS', '    function stabilityClass');
loadSection('    function selectSnaEntries', '    function renderNodeSelectionNote');
const versionMatch = html.match(/const APP_VERSION = '([^']+)'/);

// ---------- 獨立參考實作 ----------
function qPairwise(W, p, gamma) {
  const N = W.length;
  const k = W.map(r => r.reduce((a, b) => a + b, 0));
  const twoM = k.reduce((a, b) => a + b, 0);
  if (twoM === 0) return null;
  let q = 0;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if (p[i] === p[j]) q += W[i][j] - gamma * k[i] * k[j] / twoM;
  return q / twoM;
}
function lcg(seed) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
function randomGraph(rnd, N, density, maxW) {
  const M = Array.from({ length: N }, () => new Array(N).fill(0));
  for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) if (rnd() < density) { const w = 1 + Math.floor(rnd() * maxW); M[i][j] = w; M[j][i] = w; }
  return M;
}
const sameSet = (a, b) => a.length === b.length && a.every(x => b.includes(x));

// ---------- 測試框架 ----------
const queue = [];
function test(name, fn) { queue.push({ name, fn }); }
function assert(cond, msg) { if (!cond) throw new Error(msg); }
const EPS = 1e-10;

// ---------- 1. Qγ 選解一致性（ChatGPT 檢核文件 §3.3 最小案例） ----------
test('1. 最小案例：γ = 1.2 時選出候選中 Qγ 最高的分群', () => {
  const W = [[0, 4, 3, 2], [4, 0, 0, 0], [3, 0, 0, 0], [2, 0, 0, 0]];
  const nodes = ['A', 'B', 'C', 'D'].map((id, i) => ({ id, occurrences: [9, 4, 3, 2][i] }));
  const info = assignLouvainClusters(nodes, W, 4, { weightMode: 'raw', gamma: 1.2 });
  const sel = nodes.map(n => n.cluster);
  const rng = mulberry32(STABILITY_SEED);
  const cands = [louvainPartition(W, 4, 1.2, null)];
  for (let r = 0; r < STABILITY_RUNS; r++) cands.push(louvainPartition(W, 4, 1.2, rng));
  const bestQ = Math.max(...cands.map(c => qPairwise(W, c, 1.2)));
  assert(qPairwise(W, sel, 1.2) >= bestQ - EPS, `選出分群 Q1.2 = ${qPairwise(W, sel, 1.2)}，候選最高 ${bestQ}`);
  assert(Math.abs(info.Qgamma - qPairwise(W, sel, 1.2)) < EPS, '回報的 Qγ 與獨立計算不符');
  assert(Math.abs(info.Q1 - qPairwise(W, sel, 1)) < EPS, '回報的 Q1 與獨立計算不符');
  assert(sel[0] === sel[1] && sel[1] === sel[2] && sel[3] !== sel[0], `預期 {A,B,C},{D}，實得 ${sel}`);
  return `選出 {A,B,C},{D}；Q1.2 = ${info.Qgamma.toFixed(6)}；Q1 = ${info.Q1.toFixed(6)}`;
});

test('2. 隨機網路：各 γ 與兩種邊權重下，選出分群的 Qγ 皆為候選最高值', () => {
  const rnd = lcg(20261031);
  let count = 0;
  for (let g = 0; g < 24; g++) {
    const N = 6 + Math.floor(rnd() * 30);
    const M = randomGraph(rnd, N, 0.1 + rnd() * 0.3, 6);
    for (const weightMode of ['raw', 'assoc']) {
      const W = buildClusteringWeights(M, N, weightMode);
      if (qPairwise(W, new Array(N).fill(0), 1) === null) continue;
      for (const gamma of [0.6, 0.8, 1.0, 1.2, 1.4, 1.6]) {
        const nodes = Array.from({ length: N }, (_, i) => ({ id: 'n' + i, occurrences: 1 }));
        const info = assignLouvainClusters(nodes, M, N, { weightMode, gamma });
        const sel = nodes.map(n => n.cluster);
        const rng = mulberry32(STABILITY_SEED);
        const cands = [louvainPartition(W, N, gamma, null)];
        for (let r = 0; r < STABILITY_RUNS; r++) cands.push(louvainPartition(W, N, gamma, rng));
        const bestQ = Math.max(...cands.map(c => qPairwise(W, c, gamma)));
        const selQ = qPairwise(W, sel, gamma);
        assert(selQ >= bestQ - EPS, `N=${N}, ${weightMode}, γ=${gamma}: 選出 ${selQ}，候選最高 ${bestQ}`);
        assert(Math.abs(info.Qgamma - selQ) < EPS, `N=${N}, ${weightMode}, γ=${gamma}: 回報 Qγ 與獨立計算不符`);
        assert(Math.abs(info.Q1 - qPairwise(W, sel, 1)) < EPS, `N=${N}, ${weightMode}, γ=${gamma}: 回報 Q1 與獨立計算不符`);
        if (gamma === 1) assert(Math.abs(info.Qgamma - info.Q1) < EPS, 'γ = 1 時 Qγ 應等於 Q1');
        count++;
      }
    }
  }
  return `${count} 組（網路 × 邊權重 × γ）`;
});

test('3. 模組度函式與逐對節點公式一致（含任意 γ）', () => {
  const rnd = lcg(7);
  let maxErr = 0, n = 0;
  for (let t = 0; t < 300; t++) {
    const N = 2 + Math.floor(rnd() * 25);
    const M = randomGraph(rnd, N, 0.4, 9);
    const p = Array.from({ length: N }, () => Math.floor(rnd() * 5));
    const gamma = 0.2 + rnd() * 2;
    const ref = qPairwise(M, p, gamma), got = modularityOf(M, N, p, gamma);
    if (ref === null) { assert(got === null, '零邊網路應回傳 null'); continue; }
    maxErr = Math.max(maxErr, Math.abs(ref - got)); n++;
  }
  assert(maxErr < EPS, `最大誤差 ${maxErr}`);
  return `${n} 組，最大誤差 ${maxErr.toExponential(1)}`;
});

test('4. Zachary 空手道俱樂部網路（原始權重、γ = 1）Q = 0.4198', () => {
  const E = [[1,2],[1,3],[1,4],[1,5],[1,6],[1,7],[1,8],[1,9],[1,11],[1,12],[1,13],[1,14],[1,18],[1,20],[1,22],[1,32],[2,3],[2,4],[2,8],[2,14],[2,18],[2,20],[2,22],[2,31],[3,4],[3,8],[3,9],[3,10],[3,14],[3,28],[3,29],[3,33],[4,8],[4,13],[4,14],[5,7],[5,11],[6,7],[6,11],[6,17],[7,17],[9,31],[9,33],[9,34],[10,34],[14,34],[15,33],[15,34],[16,33],[16,34],[19,33],[19,34],[20,34],[21,33],[21,34],[23,33],[23,34],[24,26],[24,28],[24,30],[24,33],[24,34],[25,26],[25,28],[25,32],[26,32],[27,30],[27,34],[28,34],[29,32],[29,34],[30,33],[30,34],[31,33],[31,34],[32,33],[32,34],[33,34]];
  const N = 34, M = Array.from({ length: N }, () => new Array(N).fill(0));
  E.forEach(([a, b]) => { M[a - 1][b - 1] = 1; M[b - 1][a - 1] = 1; });
  const nodes = Array.from({ length: N }, (_, i) => ({ id: 'k' + i, occurrences: 1 }));
  const info = assignLouvainClusters(nodes, M, N, { weightMode: 'raw', gamma: 1 });
  assert(Math.abs(info.Qgamma - 0.4197896) < 1e-6, `Q = ${info.Qgamma}`);
  return `Q = ${info.Qgamma.toFixed(4)}`;
});

test('5. 固定種子下重複執行結果完全相同', () => {
  const rnd = lcg(99);
  const M = randomGraph(rnd, 30, 0.2, 5);
  const run = () => { const nodes = Array.from({ length: 30 }, (_, i) => ({ id: 'n' + i, occurrences: 1 })); const info = assignLouvainClusters(nodes, M, 30, { weightMode: 'assoc', gamma: 1.3 }); return JSON.stringify([nodes.map(n => n.cluster), nodes.map(n => n.stability), info.Qgamma]); };
  assert(run() === run(), '兩次結果不同');
});

test('6. 零邊網路：不計算模組度，回報不適用', () => {
  const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const nodes = ['a', 'b', 'c'].map(id => ({ id, occurrences: 1 }));
  const info = assignLouvainClusters(nodes, M, 3, { weightMode: 'raw', gamma: 1 });
  assert(info.computable === false && info.Qgamma === null && info.Q1 === null && info.stability === null, JSON.stringify(info));
  assert(modularityOf(M, 3, [0, 1, 2], 1) === null, 'modularityOf 應回傳 null');
});

test('7. 調整蘭德指數與 scikit-learn 1.9.1 參考值一致', () => {
  const cases = [
    [[0, 0, 1, 1], [0, 0, 1, 2], 0.5714285714285714],
    [[0, 0, 0, 1, 1, 1], [0, 0, 1, 1, 2, 2], 0.24242424242424243],
    [[0, 0, 1, 1, 2, 2], [1, 1, 0, 0, 2, 2], 1.0],
    [[0, 1, 2, 3], [0, 0, 0, 0], 0.0],
    [[0, 0, 0, 0, 1, 1, 1, 2, 2, 2], [0, 0, 1, 1, 1, 2, 2, 2, 0, 0], 0.09090909090909091]
  ];
  for (const [a, b, ref] of cases) assert(Math.abs(adjustedRandIndex(a, b) - ref) < 1e-12, `${a} / ${b}: ${adjustedRandIndex(a, b)} ≠ ${ref}`);
  return `${cases.length} 組`;
});

// ---------- 2. 入圖節點篩選（ChatGPT 檢核文件 §4） ----------
const freq = entries => new Map(entries);
test('8. 嚴格模式：門檻 ≥ 9 只選出 A，不自動放寬', () => {
  const { entries, info } = selectSnaEntries(freq([['A', 10], ['B', 8], ['C', 2], ['D', 1]]), 9, 120, 'exclude', false);
  assert(sameSet(entries.map(e => e[0]), ['A']), `實得 ${entries.map(e => e[0])}`);
  assert(info.relaxed === false && info.strictTooFew === true && info.appliedMin === 9 && info.requestedMin === 9, JSON.stringify(info));
});

test('9. 主分析模式：門檻 ≥ 9 自動放寬為 ≥ 1，並記錄原因', () => {
  const { entries, info } = selectSnaEntries(freq([['A', 10], ['B', 8], ['C', 2], ['D', 1]]), 9, 120, 'exclude', true);
  assert(entries.length === 4, `實得 ${entries.length} 個`);
  assert(info.relaxed === true && info.appliedMin === 1 && info.requestedMin === 9 && info.relaxationReason.length > 0, JSON.stringify(info));
  assert(info.equivalentMin === 1 && info.minObserved === 1, JSON.stringify(info));
});

test('10. 嚴格模式：0、1、2 個節點如實回報', () => {
  const f = freq([['A', 10], ['B', 8], ['C', 2]]);
  for (const [t, n] of [[11, 0], [9, 1], [8, 2]]) {
    const { entries, info } = selectSnaEntries(f, t, 120, 'exclude', false);
    assert(entries.length === n && info.selected === n && info.strictTooFew, `門檻 ${t}: 預期 ${n} 個，實得 ${entries.length}`);
    assert(n === 0 ? info.minObserved === null : info.minObserved === entries[n - 1][1], `門檻 ${t}: minObserved 錯誤`);
  }
});

test('11. 篩選門檻與最低觀察頻次分開記錄', () => {
  const { info } = selectSnaEntries(freq([['A', 10], ['B', 8], ['C', 8], ['D', 2]]), 5, 120, 'exclude', false);
  assert(info.appliedMin === 5 && info.equivalentMin === 5 && info.minObserved === 8, JSON.stringify(info));
});

test('12. 節點上限與邊界同分：等效門檻單獨即可重現入圖節點集合', () => {
  const rnd = lcg(5);
  let checked = 0;
  for (let t = 0; t < 300; t++) {
    const n = 5 + Math.floor(rnd() * 40);
    const f = new Map(Array.from({ length: n }, (_, i) => ['w' + i, 1 + Math.floor(rnd() * 8)]));
    const cap = 3 + Math.floor(rnd() * 20);
    for (const tieMode of ['exclude', 'include']) {
      const minOcc = 1 + Math.floor(rnd() * 3);
      const { entries, info } = selectSnaEntries(f, minOcc, cap, tieMode, false);
      const got = entries.map(e => e[0]).sort();
      // 只用等效門檻篩選，不附加 appliedMin 或節點上限
      const viaEq = [...f].filter(([, c]) => c >= info.equivalentMin).map(([k]) => k).sort();
      assert(JSON.stringify(got) === JSON.stringify(viaEq), `cap=${cap}, ${tieMode}, minOcc=${minOcc}: 等效門檻 ${info.equivalentMin} 無法單獨重現節點集合`);
      assert(info.equivalentMin >= info.appliedMin, `等效門檻 ${info.equivalentMin} 低於採用門檻 ${info.appliedMin}`);
      if (tieMode === 'exclude') assert(entries.length <= cap, `exclude 模式超過上限：${entries.length} > ${cap}`);
      if (!info.truncated) assert(info.equivalentMin === info.appliedMin, '未截斷時等效門檻應等於採用門檻');
      if (info.tieValue != null) {
        const kept = entries.filter(e => e[1] === info.tieValue).length;
        assert(kept === 0 || kept === info.tieCount, `同分關鍵字被部分截取：${kept} / ${info.tieCount}`);
      }
      checked++;
    }
  }
  return `${checked} 組`;
});

test('13. 等效門檻邊界案例（ChatGPT 複核報告 §5.1 反例等）', () => {
  const highs = n => Array.from({ length: n }, (_, i) => ['high' + i, 5]);
  const check = (label, f, minOcc, cap, tieMode, expectSelected, expectEq) => {
    const { entries, info } = selectSnaEntries(new Map(f), minOcc, cap, tieMode, false);
    assert(entries.length === expectSelected, `${label}：預期入圖 ${expectSelected} 個，實得 ${entries.length}`);
    assert(info.equivalentMin === expectEq, `${label}：預期等效門檻 ${expectEq}，實得 ${info.equivalentMin}`);
    const viaEq = f.filter(([, c]) => c >= info.equivalentMin).length;
    assert(viaEq === entries.length, `${label}：以 ≥ ${info.equivalentMin} 篩選得到 ${viaEq} 個`);
  };
  check('同分整批納入、下方有低頻詞', [...highs(12), ['low', 1]], 5, 10, 'include', 12, 5);
  check('同分整批納入、沒有低頻詞', highs(12), 5, 10, 'include', 12, 5);
  check('同分整批排除、下方仍有未納入候選', [['top1', 9], ['top2', 9], ...highs(12), ['low', 1]], 1, 10, 'exclude', 2, 6);
  check('同分整批排除至空集合', highs(12), 5, 10, 'exclude', 0, 6);
  check('上限未落在同分處', [['a', 9], ['b', 8], ['c', 7], ['d', 6], ['e', 5]], 1, 3, 'exclude', 3, 7);
  return '5 組';
});

test('14. 嚴格模式 strictTooFew 的定義與最終入圖數分開記錄', () => {
  const r1 = selectSnaEntries(new Map([['A', 1]]), 1, 120, 'exclude', false);
  assert(r1.info.strictTooFew === false && r1.info.selected === 1, '門檻 1 不屬於「本應放寬」的情形');
  const r2 = selectSnaEntries(new Map([['A', 10], ['B', 8]]), 5, 120, 'exclude', false);
  assert(r2.info.strictTooFew === true && r2.info.selected === 2, '門檻 5 時候選 2 個，應標記為本應放寬而未放寬');
});

// ---------- 3. 整合測試：應用程式本身的敏感度分析呼叫路徑 ----------
function locatePapa() {
  for (const p of [path.join(path.dirname(htmlPath), 'lib', 'papaparse.min.js'), path.join(__dirname, '..', 'lib', 'papaparse.min.js')]) {
    if (fs.existsSync(p)) return require(p);
  }
  throw new Error('找不到 lib/papaparse.min.js');
}
function loadApp() {
  const els = new Map(), downloads = [];
  const el = id => {
    if (!els.has(id)) els.set(id, { value: '', checked: false, disabled: false, innerHTML: '', textContent: '', title: '', classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } } });
    return els.get(id);
  };
  const ctx = vm.createContext({
    document: { getElementById: el }, console, setTimeout, Blob, Map, Set, Papa: locatePapa(),
    alert: m => { throw new Error('alert：' + m); },
    triggerDownload: (blob, name) => downloads.push({ blob, name }), getTimestampStr: () => 'test',
    escapeHtml: x => String(x), escapeHtmlAttr: x => String(x),
    getEffectiveTargetTerm: x => x, extractRawKeywordsFromDoc: d => d.kws,
    renderSnaMetricsTable: () => {}, renderD3Network: () => {},
    CLUSTER_COLORS: ['#111', '#222', '#333', '#444', '#555', '#666', '#777', '#888'], DP: { open: false }
  });
  const section = (a, b) => {
    const st = html.indexOf(a), en = html.indexOf(b, st);
    if (st < 0 || en <= st) throw new Error(`找不到程式區塊：${a}`);
    vm.runInContext(html.slice(st, en), ctx);
  };
  section('    function computeMergedFreqMap', '    function applyTableFiltersAndRender');
  section('    function computeCoverage', '    function renderSnaMetricsTable');
  section('    const SENS = ', "    document.getElementById('btnOpenSens')");
  vm.runInContext('var activeDocs = []; var userExcludeSet = new Set(); var computedSnaResults = null;', ctx);
  return {
    ctx, el, downloads,
    analyze(docs, { min, cap = 120, tie = 'exclude', weight = 'raw', gamma = '1.2' }) {
      el('selectKwMode').value = 'author_only'; el('snaMinOccInput').value = String(min);
      el('snaMaxNodesInput').value = String(cap); el('snaTieModeSelect').value = tie;
      el('clusterWeightSelect').value = weight; el('clusterResolutionInput').value = gamma;
      ctx.__docs = docs;
      vm.runInContext('activeDocs = __docs; executeSnaAndRenderGraph();', ctx);
      return vm.runInContext('computedSnaResults', ctx);
    },
    async sensitivity({ gammas = '1.2', thresholds, weight = 'raw' }) {
      vm.runInContext('openSensModal()', ctx);
      el('sensGammas').value = gammas; el('sensMinOccs').value = thresholds;
      el('sensWRaw').checked = weight === 'raw'; el('sensWAssoc').checked = weight === 'assoc';
      await vm.runInContext('runSensitivity()', ctx);
      return vm.runInContext('SENS.results', ctx);
    },
    async csv(fnName) {
      downloads.length = 0;
      vm.runInContext(fnName + '()', ctx);
      const text = await downloads[0].blob.text();
      return ctx.Papa.parse(text.replace(/^﻿/, ''), { header: true, skipEmptyLines: true }).data;
    }
  };
}
const kwDocs = list => list.map(kws => ({ kws }));

test('15. 整合：主分析放寬、敏感度分析嚴格（門檻 1／8／9／11）', async () => {
  const app = loadApp();
  // A 出現 10 篇、B 8 篇、C 2 篇、D 1 篇
  const docs = kwDocs(Array.from({ length: 10 }, (_, i) => ['A', ...(i < 8 ? ['B'] : []), ...(i < 2 ? ['C'] : []), ...(i < 1 ? ['D'] : [])]));
  const r = app.analyze(docs, { min: 9 });
  assert(r.macro.selectionInfo.relaxed === true && r.macro.N === 4, `主分析應放寬為 4 個節點，實得 relaxed=${r.macro.selectionInfo.relaxed}, N=${r.macro.N}`);
  const res = await app.sensitivity({ thresholds: '1,8,9,11' });
  const by = t => res.configs.find(c => c.minOcc === t);
  assert(by(1).computable && by(1).isRef && by(1).N === 4, '門檻 1 應等同目前分群');
  for (const [t, n] of [[8, 2], [9, 1], [11, 0]]) {
    const c = by(t);
    assert(c.N === n, `門檻 ${t}：預期 ${n} 個節點（嚴格、不放寬），實得 ${c.N}`);
    assert(!c.computable && c.Qgamma === null && c.ari === null, `門檻 ${t}：不應進行分群`);
    assert(c.sel.relaxed === false, `門檻 ${t}：不應放寬`);
  }
  assert(by(11).reason.includes('沒有出現篇數'), `門檻 11 原因文字：${by(11).reason}`);
  assert(by(8).reason.includes('少於 3'), `門檻 8 原因文字：${by(8).reason}`);
  const rows = await app.csv('exportSensConfigsCsv');
  for (const row of rows) assert(row.Threshold_Relaxed === 'no', 'CSV：敏感度分析不應出現放寬');
  for (const row of rows.filter(x => x.Requested_Min_Occurrences !== '1')) {
    assert(row.Clustering_Computed === 'no' && row.Objective_Q_gamma === '' && row.ARI_vs_Current === '', `CSV 門檻 ${row.Requested_Min_Occurrences}：未分群的列不應有 Q 或 ARI`);
  }
  return '主分析 4 節點；敏感度 2／1／0 節點未分群；CSV 一致';
});

test('16. 整合：同分整批納入時，等效門檻不低於要求門檻（畫面與 CSV）', async () => {
  const app = loadApp();
  const highs = Array.from({ length: 12 }, (_, i) => 'high' + i);
  const docs = kwDocs([...Array.from({ length: 5 }, () => highs), ['low']]);
  const r = app.analyze(docs, { min: 5, cap: 10, tie: 'include' });
  const sel = r.macro.selectionInfo;
  assert(r.macro.N === 12 && sel.truncated && sel.equivalentMin === 5, `入圖 ${r.macro.N}、等效門檻 ${sel.equivalentMin}`);
  const text = app.ctx.inclusionText(sel);
  assert(text.startsWith('出現篇數 ≥ 5'), `入圖條件文字：${text}`);
  await app.sensitivity({ thresholds: '5' });
  const rows = await app.csv('exportSensConfigsCsv');
  assert(rows[0].Equivalent_Min_Occurrences === '5' && rows[0].Applied_Min_Occurrences === '5', `CSV 等效門檻 ${rows[0].Equivalent_Min_Occurrences}`);
});

test('17. 整合：候選全數因上限與同分排除時，原因文字正確；目前網路為空時停用敏感度分析', async () => {
  const app = loadApp();
  const highs = Array.from({ length: 12 }, (_, i) => 'high' + i);
  const r = app.analyze(kwDocs(Array.from({ length: 5 }, () => highs)), { min: 5, cap: 10, tie: 'exclude' });
  assert(r.macro.N === 0 && r.macro.selectionInfo.eligible === 12, `主分析 N=${r.macro.N}`);
  const reason = app.ctx.sensNotComputedReason({ N: 0, selection: r.macro.selectionInfo });
  assert(reason.includes('節點上限') && reason.includes('12 個候選'), `原因文字：${reason}`);
  const res = await app.sensitivity({ thresholds: '5' });
  assert(res === null && app.el('sensRun').disabled === true, '目前網路未分群時，敏感度分析應停用');
});

test('18. 整合：零邊網路不顯示聚落編號與聚落數', async () => {
  const app = loadApp();
  const r = app.analyze(kwDocs([['A'], ['B'], ['C']]), { min: 1 });
  assert(r.macro.N === 3 && r.macro.clusterInfo.computable === false, '應為 3 個節點、未分群');
  assert(r.nodes.every(n => n.cluster === null), `聚落編號應為 null，實得 ${r.nodes.map(n => n.cluster)}`);
  assert(r.macro.clusterCount === null, `聚落數應為 null，實得 ${r.macro.clusterCount}`);
  const stats = app.el('snaMacroStats').textContent;
  assert(stats.includes('聚落數: 不適用') && stats.includes('模組度：不適用'), `主統計：${stats}`);
  const res = await app.sensitivity({ thresholds: '1' });
  assert(res === null, '零邊網路不應執行敏感度分析');
});

// ---------- 執行與輸出 ----------
(async () => {
  const results = [];
  for (const { name, fn } of queue) {
    try { const detail = await fn(); results.push({ name, ok: true, detail: detail || '' }); }
    catch (e) { results.push({ name, ok: false, detail: e.message }); }
  }
  console.log(`\n工作台數值核心回歸測試（受測檔：${path.basename(htmlPath)}，版本 ${versionMatch ? versionMatch[1] : '未知'}）\n`);
  for (const r of results) console.log(`  [${r.ok ? '通過' : '失敗'}] ${r.name}${r.detail ? '：' + r.detail : ''}`);
  const passed = results.filter(r => r.ok).length;
  console.log(`\n結果：${passed} / ${results.length} 項通過\n`);
  process.exit(passed === results.length ? 0 : 1);
})();
