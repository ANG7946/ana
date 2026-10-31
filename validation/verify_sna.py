"""
VOSviewer & SNA 知識結構分析工作台：網路指標獨立驗證腳本

用途：以 NetworkX（獨立於工作台的開源網路分析套件）重新計算工作台的網路指標，
      逐項比對兩者是否一致。只需要工作台本身就能下載的兩個 CSV 檔。

需要的檔案（皆在工作台步驟四下載）：
  1. 共現矩陣        Cooccurrence_Matrix_日期.csv
  2. SNA 中心性指標表 SNA_Centrality_Metrics_日期.csv

安裝（只需一次）：
  pip install networkx

執行：
  python verify_sna.py Cooccurrence_Matrix_日期.csv SNA_Centrality_Metrics_日期.csv
  若工作台的「分群邊權重」選的是「原始共現次數」，請在最後加上 --raw
  若解析度 γ 不是 1，請加上 --gamma 數值，例如 --gamma 1.2

驗證項目：
  - 總連結強度（TLS）、度中心性、正規化度中心性、中介中心性
  - 工作台分群的模組度：指定 γ 的 Qγ 與標準模組度 Q1（以 association strength 或原始次數為權重）
  - 每個聚落內部是否連通
  - 以 NetworkX 的 Louvain 演算法（相同 γ）執行 100 次，比較工作台的 Qγ 是否接近參考實作的最佳值
"""
import csv, sys, collections
import networkx as nx
from networkx.algorithms.community import louvain_communities, modularity

def read_matrix(path):
    with open(path, encoding='utf-8-sig', newline='') as f:
        rows = list(csv.reader(f))
    ids = rows[0][1:]
    M = [[float(v) for v in r[1:]] for r in rows[1:]]
    assert [r[0] for r in rows[1:]] == ids, '矩陣的列與欄關鍵字順序不一致'
    return ids, M

def read_metrics(path):
    with open(path, encoding='utf-8-sig', newline='') as f:
        return {r['Keyword']: r for r in csv.DictReader(f)}

def main():
    argv = sys.argv[1:]
    gamma = 1.0
    if '--gamma' in argv:
        k = argv.index('--gamma'); gamma = float(argv[k + 1]); del argv[k:k + 2]
    args = [a for a in argv if not a.startswith('--')]
    use_raw = '--raw' in argv
    if len(args) != 2:
        print(__doc__); sys.exit(1)
    ids, M = read_matrix(args[0])
    T = read_metrics(args[1])
    N = len(ids)
    results = []
    def check(name, ok, detail=''):
        results.append(ok); print(f"  [{'通過' if ok else '不一致'}] {name}　{detail}")

    print(f'\n節點 {N} 個；分群邊權重：{"原始共現次數" if use_raw else "association strength 正規化"}；解析度 γ = {gamma:g}\n')
    check('指標表與矩陣的關鍵字相同', set(ids) == set(T), f'{len(T)} 個')

    G = nx.Graph(); G.add_nodes_from(range(N))
    G.add_weighted_edges_from((i, j, M[i][j]) for i in range(N) for j in range(i + 1, N) if M[i][j] > 0)
    print(f'  （連線 {G.number_of_edges()} 條、網路密度 {nx.density(G):.4f}，可與工作台報表上方數字對照）')

    tls = dict(G.degree(weight='weight'))
    bad = [ids[i] for i in range(N) if abs(tls[i] - float(T[ids[i]]['Total_Link_Strength_TLS'])) > 1e-9]
    check('總連結強度 TLS', not bad, f'不一致：{bad[:5]}' if bad else '')
    deg = dict(G.degree())
    bad = [ids[i] for i in range(N) if deg[i] != int(float(T[ids[i]]['Degree_Centrality']))]
    check('度中心性（連線數）', not bad, f'不一致：{bad[:5]}' if bad else '')
    dc = nx.degree_centrality(G)
    e = max(abs(dc[i] - float(T[ids[i]]['Normalized_Degree'])) for i in range(N))
    check('正規化度中心性', e <= 5e-4, f'最大差 {e:.6f}（工作台四捨五入至小數 3 位，容許 0.0005）')
    bc = nx.betweenness_centrality(G, normalized=True)
    e = max(abs(bc[i] - float(T[ids[i]]['Betweenness_Centrality'])) for i in range(N))
    check('中介中心性', e <= 5e-5, f'最大差 {e:.7f}（工作台四捨五入至小數 4 位，容許 0.00005）')

    if use_raw:
        W = G
    else:
        c = [sum(r) for r in M]; twoM = sum(c)
        W = nx.Graph(); W.add_nodes_from(range(N))
        W.add_weighted_edges_from((i, j, twoM * M[i][j] / (c[i] * c[j])) for i in range(N) for j in range(i + 1, N) if M[i][j] > 0)
    part = collections.defaultdict(set)
    for i in range(N): part[T[ids[i]]['Cluster']].add(i)
    Q = modularity(W, list(part.values()), weight='weight', resolution=gamma)
    Q1 = modularity(W, list(part.values()), weight='weight', resolution=1)
    if gamma == 1:
        print(f'\n  工作台分群的模組度 Q（NetworkX 重算）= {Q:.4f}　← 請與工作台報表上方的 Q 值對照，應相同至小數 3 位')
    else:
        print(f'\n  工作台分群的 Qγ（γ = {gamma:g}，NetworkX 重算）= {Q:.4f}；標準模組度 Q1 = {Q1:.4f}')
        print('  ← 請與工作台報表上方的 Qγ 與 Q1 對照，應相同至小數 3 位')
    check('每個聚落內部皆連通', all(nx.is_connected(W.subgraph(s)) for s in part.values() if len(s) > 1), f'{len(part)} 個聚落')
    qs = [modularity(W, louvain_communities(W, weight='weight', resolution=gamma, seed=s), weight='weight', resolution=gamma) for s in range(100)]
    print(f'  NetworkX Louvain（γ = {gamma:g}）100 次：Qγ 最佳 {max(qs):.4f}、平均 {sum(qs)/len(qs):.4f}')
    check('工作台 Qγ 不低於參考實作最佳值（容許 0.005）', max(qs) - Q <= 0.005)

    print(f'\n結果：{sum(results)} / {len(results)} 項通過')

if __name__ == '__main__':
    main()
