/**
 * 錯誤注入檢查：確認 regression_tests.cjs 能抓到已知錯誤
 *
 * 對 index.html 逐一植入一個已知錯誤（只寫入暫存檔，不修改原始檔），再執行回歸測試。
 * 每個錯誤都必須讓回歸測試失敗（結束碼非 0）；若有錯誤未被抓到，表示測試存在盲點。
 * 錯誤清單來自 v5.7 的兩項問題，以及 ChatGPT 複核報告（2026-11-01）指出的 v5.8 問題。
 *
 * 執行（需 Node.js 18 以上）：
 *   node validation/mutation_check.cjs index.html
 * 全部錯誤皆被抓到時結束碼為 0；任一錯誤未被抓到，或錯誤無法植入（程式已變更）時為 1。
 */
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const htmlPath = path.resolve(process.argv[2] || path.join(__dirname, '..', 'index.html'));
const html = fs.readFileSync(htmlPath, 'utf8');
const suite = path.join(__dirname, 'regression_tests.cjs');

const mutants = [
  ['候選改回以 Q1 選解（v5.7 問題一）',
    'objectiveQ: modularityOf(W, N, m, gamma)', 'objectiveQ: modularityOf(W, N, m, 1)'],
  ['回報的 Q1 錯誤',
    'info.Q1 = modularityOf(W, N, ref, 1);', 'info.Q1 = 0;'],
  ['敏感度分析改回自動放寬門檻（v5.7 問題二；v5.8 測試未能抓到）',
    'minOcc, getNodeCap(), getTieMode(), false);', 'minOcc, getNodeCap(), getTieMode(), true);'],
  ['等效門檻改回未設下限（v5.8 問題 §5.1）',
    'info.equivalentMin = Math.max(info.appliedMin, maxExcluded + 1);', 'info.equivalentMin = maxExcluded + 1;'],
  ['空集合原因改回只依節點數判斷（v5.8 問題 §5.3）',
    "      if (net.N === 0) return `${sel.eligible} 個候選關鍵字全數因節點上限", "      if (false) return `${sel.eligible} 個候選關鍵字全數因節點上限"],
  ['零邊網路改回占位聚落編號（v5.8 問題 §5.4）',
    'nodes.forEach(n => { n.cluster = null; n.stability = null; });', 'nodes.forEach((n, i) => { n.cluster = i + 1; n.stability = null; });'],
  ['零邊網路的模組度改回 0',
    'if (total2m === 0) return null;', 'if (total2m === 0) return 0;']
];

// 暫存檔放在原檔所在資料夾，讓測試能找到 lib/papaparse.min.js
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ana-mutation-'));
fs.mkdirSync(path.join(tmpDir, 'lib'));
const papaSrc = [path.join(path.dirname(htmlPath), 'lib', 'papaparse.min.js'), path.join(__dirname, '..', 'lib', 'papaparse.min.js')].find(p => fs.existsSync(p));
if (papaSrc) fs.copyFileSync(papaSrc, path.join(tmpDir, 'lib', 'papaparse.min.js'));

const baseline = spawnSync(process.execPath, [suite, htmlPath], { encoding: 'utf8' });
let allCaught = baseline.status === 0;
console.log(`\n錯誤注入檢查（受測檔：${path.basename(htmlPath)}）\n`);
console.log(`  未植入錯誤的原始檔：${baseline.status === 0 ? '回歸測試全部通過' : '回歸測試未全部通過，無法作為比較基準'}`);

for (const [name, from, to] of mutants) {
  const count = html.split(from).length - 1;
  if (count !== 1) {
    console.log(`  [無法植入] ${name}：原始碼中找到 ${count} 處目標字串（程式可能已變更，請更新本檢查）`);
    allCaught = false;
    continue;
  }
  const file = path.join(tmpDir, 'index.html');
  fs.writeFileSync(file, html.replace(from, to));
  const run = spawnSync(process.execPath, [suite, file], { encoding: 'utf8' });
  const failed = (run.stdout.match(/\[失敗\] (\d+)\./g) || []).map(x => x.match(/\d+/)[0]);
  const caught = run.status !== 0;
  if (!caught) allCaught = false;
  console.log(`  [${caught ? '已抓到' : '未抓到'}] ${name}${caught ? `：失敗項目 ${failed.join('、')}` : ''}`);
}
fs.rmSync(tmpDir, { recursive: true, force: true });
console.log(`\n結果：${allCaught ? '所有植入的錯誤都被回歸測試抓到' : '有錯誤未被抓到或無法植入'}\n`);
process.exit(allCaught ? 0 : 1);
