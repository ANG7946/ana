# 演算法驗證

本資料夾提供獨立驗證工作台計算結果的腳本與驗證紀錄。驗證方式為以獨立開發、廣泛使用的開源套件重新計算同一份資料，逐項比對結果，不使用工作台本身的程式碼。

| 檔案 | 用途 |
|---|---|
| `verify_sna.py` | 以 NetworkX 重算工作台匯出的網路指標與模組度（使用者可自行執行） |
| `regression_tests.cjs` | 數值核心回歸測試（Node.js），每次修改程式後執行 |
| `v5.8_phase1_report.md` | v5.8 修正內容、驗收條件對照、受影響版本與重算範圍 |

## 自行驗證（verify_sna.py）

1. 安裝 Python 3 與 NetworkX：`pip install networkx`
2. 在工作台完成分析後，於步驟四下載「共現矩陣」與「SNA 中心性指標表」兩個 CSV 檔。
3. 執行：

   ```
   python verify_sna.py Cooccurrence_Matrix_日期.csv SNA_Centrality_Metrics_日期.csv
   ```

   若「分群邊權重」選的是「原始共現次數」，請在最後加上 `--raw`；若解析度 γ 不是 1，請加上 `--gamma 數值`（例如 `--gamma 1.2`）。

腳本會比對總連結強度、度中心性、正規化度中心性、中介中心性，以 NetworkX 重算工作台分群的 Qγ 與標準模組度 Q1，檢查各聚落內部是否連通，並以 NetworkX 的 Louvain 演算法（相同 γ）執行 100 次，確認工作台的 Qγ 接近參考實作的最佳值。

## 回歸測試（regression_tests.cjs）

需要 Node.js 18 以上。於部署資料夾根目錄執行：

```
node validation/regression_tests.cjs index.html
```

測試從 `index.html` 抽出分群與入圖節點篩選的函式執行，模組度一律以測試檔內獨立撰寫的逐對節點公式計算。共 12 項，涵蓋 Qγ 選解一致性（288 組隨機網路 × 邊權重 × γ）、模組度公式、Zachary 網路基準值、可重現性、零邊網路、ARI，以及嚴格與放寬門檻、節點上限與同分處理。全部通過時結束碼為 0。

## 驗證紀錄（2026-10-31，工作台 v5.8）

修正兩項經外部檢核發現的問題（詳見 `v5.8_phase1_report.md`）後，於 γ = 1 與 γ = 1.2 重新進行下列全部比對，並新增標準模組度 Q1 的核對。PBL 完整資料與 AI-TPACK 測試資料各兩組設定，四組皆 21 / 21 項通過；回歸測試 12 / 12 項通過。

| 資料／γ | 工作台 Qγ | NetworkX、igraph 重算 | 參考實作最佳 Qγ |
|---|---|---|---|
| PBL，γ = 1 | 0.5127 | 相同 | NetworkX Louvain 0.5117；igraph Leiden 0.5170 |
| PBL，γ = 1.2 | 0.4829（Q1 = 0.5075） | 相同 | NetworkX Louvain 0.4816；igraph Leiden 0.4872 |
| AI-TPACK，γ = 1 | 0.5372 | 相同 | 0.5372 |
| AI-TPACK，γ = 1.2 | 0.5062（Q1 = 0.5372） | 相同 | 0.5062 |

## 驗證紀錄（2026-10-27，工作台 v5.7）

> **補註（2026-10-31）：**本次驗證只在 γ = 1 下進行，因此未能發現 v4–v5.7 在 γ ≠ 1 時以 Q1 選擇候選分群的問題，也未檢查敏感度分析的門檻放寬揭露。以下 γ = 1 的結果經 v5.8 重測維持不變。

使用預設設定（作者關鍵字、入圖門檻 ≥ 2、節點上限 120、association strength、γ = 1），以 NetworkX 3.7、python-igraph 1.0.0、scikit-learn 1.9.1 重新計算。兩份資料皆 20 / 20 項通過。

| 驗證項目 | 參考實作 | AI-TPACK 測試資料（78 篇） | PBL 完整資料（1,453 筆） |
|---|---|---|---|
| 檔案解析：筆數、標題與作者關鍵字逐筆一致 | Python csv | 78 筆一致 | 1,453 筆一致 |
| 重複文獻剔除（DOI，其次標題特徵碼） | 依相同規則獨立實作 | 剔除 0 篇 | 剔除 2 篇 |
| 節點出現篇數、共現矩陣逐格 | 由每篇文獻的最終關鍵字重新計數 | 40 × 40 一致 | 95 × 95 一致 |
| 入圖節點集合（門檻、上限、同分整批排除）、涵蓋率 | 獨立實作 | 一致 | 一致（候選 624 → 95） |
| TLS、度中心性 | NetworkX | 一致 | 一致 |
| 中介中心性 | NetworkX、igraph | 差異 < 0.00005（四捨五入） | 差異 < 0.00005（四捨五入） |
| 工作台分群的模組度 Q | NetworkX、igraph | 0.5372，三者相同 | 0.5127，三者相同 |
| 聚落內部連通 | NetworkX | 7 個聚落皆連通 | 7 個聚落皆連通 |
| 分群品質（Q 與參考實作最佳值比較） | NetworkX Louvain、igraph Louvain／Leiden，各 100 次 | 工作台 0.5372；最佳 0.5372 | 工作台 0.5127；NetworkX Louvain 0.5117、igraph Leiden 0.5170 |
| 調整蘭德指數（ARI）函式 | scikit-learn | 差異 < 1e-16 | 差異 < 1e-16 |

另以 Zachary 空手道俱樂部網路（Zachary, 1977）測試分群函式，得 Q = 0.4198，與該網路已知的模組度最佳值相同。

## 解讀與限制

- 計數、矩陣與中心性屬確定性計算，與參考實作一致，可直接報告。
- 分群屬啟發式最佳化，沒有唯一正確解。工作台的 Q 值與 NetworkX Louvain 的最佳值相當；在 PBL 完整資料上，igraph 的 Leiden 演算法（Traag et al., 2019）找到略高的 Q（0.5170，高出 0.0043），符合 Leiden 一般優於 Louvain 的既有發現。
- PBL 完整資料中，工作台分群與 NetworkX 最佳分群的 ARI 為 0.630，NetworkX 自身 100 次的平均 ARI 為 0.540，與工作台報告的穩定性 ARI（0.579）相近。這表示該資料存在多個模組度相近、但分群不同的解，屬於資料本身的特性，並非實作差異。
- 單複數歸併、括號縮寫歸併、亂碼過濾等清洗步驟屬規則式處理，無「正確答案」可比對，宜由研究者在關鍵字表格中逐一檢查。
- 驗證涵蓋 WoS Tab-delimited 格式，以及 γ = 1、1.2 兩種解析度；其他 γ 值由回歸測試涵蓋選解一致性。WoS Plain Text、Scopus CSV 解析，以及分群穩定性檢驗的內部程序，未以外部實作逐項比對。
- 通過驗證代表在所測資料與設定下，計算結果與參考實作一致，不代表軟體不存在其他錯誤。

## 參考文獻

Hagberg, A. A., Schult, D. A., & Swart, P. J. (2008). Exploring network structure, dynamics, and function using NetworkX. In G. Varoquaux, T. Vaught, & J. Millman (Eds.), *Proceedings of the 7th Python in Science Conference* (pp. 11–15).

Traag, V. A., Waltman, L., & van Eck, N. J. (2019). From Louvain to Leiden: Guaranteeing well-connected communities. *Scientific Reports, 9*, 5233. https://doi.org/10.1038/s41598-019-41695-z

Zachary, W. W. (1977). An information flow model for conflict and fission in small groups. *Journal of Anthropological Research, 33*(4), 452–473. https://doi.org/10.1086/jar.33.4.3629752
