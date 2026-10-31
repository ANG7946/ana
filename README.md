# VOSviewer & SNA 知識結構分析工作台

在瀏覽器中執行的書目計量前處理與共字網路分析工具。匯入 Web of Science 或 Scopus 匯出檔後，可完成跨庫重複文獻剔除、關鍵字清洗與同義詞整併、社會網路分析（SNA）指標計算，並匯出可直接匯入 VOSviewer 的檔案與期刊等級的網路圖。

**所有資料皆在使用者自己的瀏覽器中處理，不會上傳到任何伺服器。**

- 線上版本：https://ang7946.github.io/ana/
- 開發者：林祖強（國立高雄師範大學 科學教育暨環境教育研究所）／ Tzu-Chiang Lin, Graduate Institute of Science Education and Environmental Education, National Kaohsiung Normal University, Taiwan
- 版本：5.8（2026-10-31）

## 功能

1. **匯入與重複文獻剔除**：支援 WoS Tab-delimited（.txt）、WoS Plain Text（.txt）與 Scopus（.csv），可同時匯入多個檔案，並以 DOI 與標題特徵碼剔除跨庫重複文獻。
2. **關鍵字清洗**：四種關鍵字採用策略（作者關鍵字、索引字、遞補、合併）；自動單複數歸併；連字號與空白變體提示；手動或批次同義詞替換與剔除。清洗規則可匯出為 JSON 重複使用。
3. **SNA 指標與分群**：共現矩陣、總連結強度（TLS）、正規化度中心性、中介中心性（Brandes 演算法）。分群採兩階段 Louvain 演算法（Blondel et al., 2008），邊權重可選 association strength 正規化（預設，van Eck & Waltman, 2009）或原始共現次數，並可調整解析度 γ。每次分群皆以固定亂數種子進行 100 次隨機順序重複的穩定性檢驗，報告各關鍵字的分群穩定度、平均調整蘭德指數（ARI）與模組度（γ ≠ 1 時分別報告選解依據 Qγ 與標準模組度 Q1）。另提供分群敏感度分析：依指定的 γ、入圖門檻與邊權重組合重新分群，報告各設定的節點數、涵蓋率、聚落數、Q 值與穩定性，與目前分群的 ARI，以及每個關鍵字的跨設定一致度（核心詞與邊界詞）；也可用來比較不同入圖門檻。
4. **文獻追溯**：點選網路圖上的節點、連線，或指標報表中的任一列，即可列出構成該節點（或兩個關鍵字共同出現）的文獻，並標示經同義詞整併歸入的原始關鍵字；清單可排序並下載為 CSV。
5. **網路圖**：預覽小圖；全螢幕大圖模式提供版面微調、節點固定、白底／深色主題、弧形連線、結構橋樑標示，並可匯出 SVG 向量圖與 300 DPI PNG（圖例與網路指標嵌入圖中）。
6. **匯出**：VOSviewer 專用 Scopus 格式 CSV、VOSviewer thesaurus 檔、SNA 指標表、共現矩陣。

## 使用方式

- **線上使用**：開啟 GitHub Pages 網址即可。
- **離線使用**：下載整個資料夾（GitHub 頁面上 Code → Download ZIP），解壓縮後以瀏覽器開啟 `index.html`。所有函式庫都已包含在資料夾內，不需網路連線。

請保持資料夾結構完整，`index.html` 需要與 `lib/`、`css/` 資料夾放在一起才能正常運作。

## 部署到 GitHub Pages

1. 在 GitHub 建立新的 repository，將本資料夾內所有檔案上傳至根目錄。
2. 進入 repository 的 Settings → Pages，Source 選擇「Deploy from a branch」，分支選擇 `main`、資料夾選擇 `/ (root)`，儲存。
3. 約一至兩分鐘後，即可透過 `https://<帳號>.github.io/<repository 名稱>/` 開啟。

## 方法學注意事項

- 報告的分群取「固定順序 + 100 次隨機順序重複」中，指定 γ 的模組度 Qγ 最高者；搜尋與選解使用同一個目標函數。γ ≠ 1 時另列標準模組度 Q1，僅作描述。固定亂數種子確保同一份資料與設定每次得到相同結果。不同 γ、邊權重或節點集合下的 Qγ 建立在不同的目標函數或網路上，不可直接比較大小來決定最佳設定。
- 主分析在要求門檻下節點少於 3 個時，會自動放寬為 ≥ 1 篇並提示原因；敏感度分析一律嚴格執行要求門檻，節點少於 3 個或沒有連線的設定不進行分群，也不納入 ARI 與一致度。
- VOSviewer 使用其自身的分群技術（Waltman et al., 2010），即使正規化方式相同，分群結果仍不必然一致。若論文中的網路圖來自 VOSviewer，聚落命名與詮釋應以 VOSviewer 的分群為準；引用本工具的分群時，請寫明演算法、邊權重、γ、Q 值與穩定性檢驗結果。
- 分群穩定度與跨設定一致度皆以 0.70 作為提示門檻，屬於經驗值，並非統計檢定標準。
- 穩定性檢驗評估「同一設定下結果是否可重現」，敏感度分析評估「改變設定時主要聚落是否依然存在」，兩者宜一併報告。改變入圖門檻會改變節點集合與正規化基準，聚落重組的幅度通常大於改變 γ；文獻量較小時尤其明顯。
- 入圖節點預設上限 120 個（可調整為 10–500）。超過上限時，若上限落在出現篇數相同的一群關鍵字之間，這群關鍵字會整批排除（預設）或整批納入，不會任意截取其中一部分；畫面會提示實際的入圖條件，論文中請報告實際條件。
- 「自動歸併結尾括號縮寫」會將「全名 (縮寫)」歸併為全名，屬規則式處理，請在關鍵字表格中以「僅顯示已替換」篩選檢查，必要時逐一還原。
- 入圖門檻宜比較數個候選值後決定：可在敏感度分析中固定 γ、列出多個門檻，依「不發生截斷、網路可辨讀、分群穩定、涵蓋率」等條件選擇，並於論文中報告。涵蓋率定義為入圖關鍵字的出現篇數總和，佔全部關鍵字（整併與剔除後）出現篇數總和的比例。文獻量大時，較低門檻的候選關鍵字可能超過節點上限，經截斷後的結果會彼此相同；敏感度分析會以「候選 → 入圖」欄與黃色提示標出，此時請先提高節點上限再比較。
- 中介中心性以無權重最短路徑計算。
- 變體提示僅比對去除連字號與空白後的字串，英美拼法（如 modeling／modelling）需手動合併。
- 清洗規則儲存在瀏覽器本機儲存空間，並依網址分開保存。更換瀏覽器、裝置或開啟方式（本機檔案與網路版）時，請先以「匯出規則」備份，再以「載入規則」匯入。

## 檔案結構

```
index.html                 主程式
LICENSE                    本工具授權（MIT License）
validation/                演算法獨立驗證腳本、回歸測試與驗證紀錄
lib/d3.min.js              D3.js v7.8.5（網路圖與力導向佈局）
lib/papaparse.min.js       PapaParse v5.4.1（CSV／Tab 分隔檔解析）
css/tailwind.min.css       Tailwind CSS v3.4.19（預先編譯，僅含本程式用到的樣式）
```

## 演算法驗證

`validation/` 資料夾提供以 NetworkX 獨立重算網路指標與模組度的腳本（`verify_sna.py`）、數值核心回歸測試（`regression_tests.cjs`），以及以 NetworkX、igraph、scikit-learn 逐項比對的驗證紀錄，詳見 `validation/README.md`。

## 已知問題與修正紀錄

| 修正版本 | 問題 | 受影響版本 | 觸發條件 | 是否需重算 |
|---|---|---|---|---|
| 5.8 | γ ≠ 1 時，分群搜尋使用 Qγ，最終選解卻使用 Q1 | 4–5.7 | 解析度 γ ≠ 1 | γ ≠ 1 的分群、穩定性與敏感度結果需重算；γ = 1 不受影響 |
| 5.8 | 敏感度分析在節點不足時自動放寬門檻，表格與 CSV 未揭露 | 5–5.7 | 要求門檻下節點少於 3 個 | 若曾觸發，需確認實際比較的網路 |

修正內容、驗收證據與修正前後差異詳見 `validation/v5.8_phase1_report.md`。

## 授權

本工具以 MIT License 釋出，授權全文見 `LICENSE`。

## AI 輔助開發聲明

本工具開發過程使用生成式 AI（Google Gemini、Anthropic Claude）協助撰寫程式碼；功能設計、方法學決策與結果驗證由開發者負責。

## 第三方函式庫授權

| 函式庫 | 授權 | 授權全文 |
|---|---|---|
| D3.js | ISC License | `lib/LICENSE-d3.txt` |
| PapaParse | MIT License | `lib/LICENSE-papaparse.txt` |
| Tailwind CSS | MIT License | `css/LICENSE-tailwindcss.txt` |

## 參考文獻

Blondel, V. D., Guillaume, J.-L., Lambiotte, R., & Lefebvre, E. (2008). Fast unfolding of communities in large networks. *Journal of Statistical Mechanics: Theory and Experiment, 2008*(10), P10008. https://doi.org/10.1088/1742-5468/2008/10/P10008

Brandes, U. (2001). A faster algorithm for betweenness centrality. *Journal of Mathematical Sociology, 25*(2), 163–177. https://doi.org/10.1080/0022250X.2001.9990249

Fortunato, S., & Barthélemy, M. (2007). Resolution limit in community detection. *Proceedings of the National Academy of Sciences, 104*(1), 36–41. https://doi.org/10.1073/pnas.0605965104

Good, B. H., de Montjoye, Y.-A., & Clauset, A. (2010). Performance of modularity maximization in practical contexts. *Physical Review E, 81*(4), 046106. https://doi.org/10.1103/PhysRevE.81.046106

Hubert, L., & Arabie, P. (1985). Comparing partitions. *Journal of Classification, 2*(1), 193–218. https://doi.org/10.1007/BF01908075

van Eck, N. J., & Waltman, L. (2009). How to normalize cooccurrence data? An analysis of some well-known similarity measures. *Journal of the American Society for Information Science and Technology, 60*(8), 1635–1651. https://doi.org/10.1002/asi.21075

Waltman, L., van Eck, N. J., & Noyons, E. C. M. (2010). A unified approach to mapping and clustering of bibliometric networks. *Journal of Informetrics, 4*(4), 629–635. https://doi.org/10.1016/j.joi.2010.07.002
