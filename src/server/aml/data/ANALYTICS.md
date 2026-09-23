# AML transaction-network analytics specification

This document is the algorithm contract for the data/repository lane. It deliberately separates
facts observed in the supplied subgraph from hypotheses that require analyst verification.

## Decision to support

Given 81 known seed clients and their outgoing transaction graph up to four hops, answer:

> Which previously unknown clients should an AML analyst inspect first, what network role do they
> appear to play, and which observed facts support that hypothesis?

The method must assign every node exactly one role, one cluster, a role confidence, a review
priority, and evidence of at most 200 characters. It must not claim criminality.

## Known limits and their consequences

| Limitation | Algorithmic treatment |
| --- | --- |
| Outgoing crawl ends at depth 4 | A depth-4 node with no outgoing edge is `boundary_censored`, not automatically `terminal`. |
| Incoming transfers from outside the crawl are absent | Amount balances are called *observed* balances and never treated as account balances. |
| Seed incoming amounts are incomplete | Flow-through and retention features are invalid for seeds and receive zero weight for their role. |
| Transfers below KZT 5,000 are absent | Evidence never says “all transfers”; it says “observed transfers above the extraction threshold”. |
| 31 seeds have no outgoing transfers | They remain in output, normally as `peripheral`, with evidence that no outgoing activity is observed. |
| No labelled roles exist | Scores express strength of rule-based evidence, not statistical probability or guilt. |
| Only July 2026 is observed | Temporal findings are hypotheses for this observation window only. |

The pipeline must preserve all 2,248 rows from `nodes.parquet`, including isolated nodes.

## Input validation

Fail before calculation, with an actionable error, if any of these invariants is violated:

- required columns are absent or have incompatible types;
- a `gid` is duplicated in `nodes`;
- an edge or transaction endpoint is missing from `nodes`;
- amount is non-positive, `n_tx < 1`, depth is outside 0..4, or dates are outside
  2026-07-01..2026-07-31;
- aggregated transaction count or amount disagrees with `edges` beyond a documented tolerance;
- there are not exactly 81 seed rows or the three required files are empty.

Log warnings, but continue, for self-loops, isolated seeds, observed outflow greater than observed
inflow, and depth-4 sinks. Self-loops are excluded from degree and centrality calculations but stay
in amount reconciliation; the other cases are declared properties of the dataset, not corrupt rows.

## Per-node features

All degree counts use distinct counterparties. Parallel transactions are aggregated only after the
transaction-level temporal features have been calculated.

### Structural and monetary

| Feature | Definition |
| --- | --- |
| `in_degree`, `out_degree` | Number of distinct observed senders and recipients. |
| `in_amount`, `out_amount` | Sum of observed KZT received and sent. |
| `in_tx_count`, `out_tx_count` | Number of individual observed transactions. |
| `throughput_similarity` | `min(in_amount, out_amount) / max(in_amount, out_amount)`, when both are positive. |
| `observed_retention` | `max(in_amount - out_amount, 0) / in_amount`, valid only for non-seed nodes at depth < 4. |
| `fan_in_score` | Depth-stratified percentile of `log1p(in_degree)`. |
| `fan_out_score` | Depth-stratified percentile of `log1p(out_degree)`. |
| `money_score` | Mean of depth-stratified percentiles of `log1p(in_amount)` and `log1p(out_amount)`. |
| `pagerank` | Weighted directed PageRank; edge weight is `log1p(sum_kzt)`. |
| `betweenness` | Directed unweighted Brandes betweenness, percentile-normalized. Exact calculation is small enough for 2,248 nodes and 3,119 edges. |
| `seed_reach` | Distinct seeds that can reach the node, normalized by the maximum observed count. |
| `seed_proximity` | Maximum `0.65^distance` across reachable seeds; zero if none is reachable. |
| `component_seed_density` | Seeds divided by nodes in the weakly connected component. |

Depth-stratified percentiles compare a node with nodes having the same observation depth. This
prevents the crawl design itself from making early-depth nodes appear systematically more central.
For strata smaller than 30 nodes, use the global empirical distribution.

### Temporal

For every non-seed node with both incoming and outgoing transactions:

1. Sort incoming and outgoing transfers by timestamp.
2. Greedily match each outgoing transfer to the earliest preceding unmatched incoming transfer
   within 48 hours, allowing partial amount matching.
3. `rapid_pass_ratio` is matched outgoing amount divided by `min(in_amount, out_amount)`.
4. `median_pass_hours` is the weighted median delay of matched amounts.

Additional interpretable signals:

- `active_days`: distinct transaction dates;
- `burst_score`: maximum daily transaction count divided by total count;
- `synchronized_in_score`: maximum distinct incoming senders on one day divided by `in_degree`;
- `round_amount_score`: share of transactions divisible by KZT 10,000;
- `split_score`: share of same-source, same-day groups containing at least three transfers whose
  amounts lie within 10% of their group median.

Temporal matching is supporting evidence only. It must not invent transaction ordering when the
source field is a calendar date rather than a timestamp; in that case report delays in whole days.

## Robust normalization

Never min-max scale raw values: one extreme hub would flatten the rest of the graph. Convert every
continuous feature to an empirical percentile in `[0, 1]`; use `log1p` before percentiles for
amounts and degrees. Thresholds are both absolute and distribution-aware:

- `high_in_degree = in_degree >= 8 AND fan_in_score >= 0.95`;
- `high_out_degree = out_degree >= 8 AND fan_out_score >= 0.95`;
- `high_centrality = mean(pagerank_percentile, betweenness_percentile) >= 0.90`.

The absolute floor makes criteria stable and explainable; the percentile adapts to the supplied
graph. Persist calculated thresholds in the run metadata so a result can be reproduced exactly.

## Role candidates and confidence

Each rule produces a candidate score in `[0, 1]`. A failed hard gate produces no candidate. The
assigned role is the candidate with the highest score; ties follow the order shown below. A role
score is rule strength, not a calibrated probability. If a supporting feature is unavailable rather
than zero (for example seed retention), renormalize the remaining weights to sum to one.

### 1. `coordinator`

Hard gates: non-seed, in-degree > 0, out-degree > 0, high centrality, and at least two reachable
seeds or membership in a multi-seed community.

`score = .30 betweenness + .20 pagerank + .20 seed_reach + .15 cross_cluster + .15 money`

`cross_cluster` is the percentile of distinct neighbouring communities. This label means
*candidate coordination position*, never “organizer”.

### 2. `consolidator`

Hard gates: high in-degree and either `observed_retention >= 0.30` or `out_degree <= 2`.

`score = .40 fan_in + .20 synchronized_in + .20 retention + .10 money + .10 seed_reach`

For a seed, retention is unavailable, so a seed cannot receive this role solely from an incomplete
balance. Multiple senders are the primary evidence.

### 3. `distributor`

Hard gates: high out-degree and `out_amount > 0`.

`score = .45 fan_out + .15 pagerank + .15 money + .15 burst + .10 seed_reach`

### 4. `transit`

Hard gates: non-seed, depth < 4, both degrees positive, `throughput_similarity >= 0.80`, and either
`rapid_pass_ratio >= 0.60` or dates are unavailable.

`score = .40 throughput_similarity + .30 rapid_pass_ratio + .15 betweenness + .15 seed_reach`

If only dates are available, replace `rapid_pass_ratio` with same/next-day matching and cap the role
score at 0.90 to reflect reduced temporal precision.

### 5. `terminal`

Hard gates: non-seed, depth < 4, in-degree > 0, out-degree == 0.

`score = .45 fan_in + .25 money + .20 seed_reach + .10 active_days`

Evidence must say “observed sink before the extraction boundary”. A depth-4 sink is never terminal
under this dataset.

### 6. `peripheral`

Fallback for every node with no qualifying specialized role. Confidence is
`1 - max(other candidate scores)`, clamped to `[0.25, 0.95]`. Depth-4 sinks include the phrase
“outgoing continuation is unobserved at depth-4 boundary”.

Specialized roles should not be selected from tiny score differences. Require winner score >= 0.60
and a margin >= 0.05 over the runner-up; otherwise assign `peripheral` with evidence that signals
are mixed. This is deliberately conservative for compliance use.

## Clustering

Use a deterministic weighted Louvain partition of the undirected projection:

- combine reciprocal edges;
- edge weight = `log1p(sum_kzt) + 0.25 * log1p(n_tx)`;
- fixed random seed `42`;
- run per weakly connected component;
- isolated nodes receive their own cluster;
- order final cluster IDs by descending internal KZT, then smallest gid, so IDs are stable.

Do not force the expected eight multi-seed communities: that number is a dataset note, not a target.
Report modularity and the number of communities on every run.

Cluster fields:

- `n_nodes`: all nodes assigned to the cluster;
- `n_seed`: seed nodes in the cluster;
- `sum_kzt_internal`: edge amount where both endpoints are in the cluster, counted once;
- `top_gids`: up to five gids by node priority, pipe-separated;
- `hypothesis`: deterministic template based on dominant roles, seed count, and internal flow.

Example hypothesis: “Multi-seed flow community with consolidation and onward distribution
signals; review shared intermediaries.” This is a review hypothesis, not a finding of wrongdoing.

## Review priority

Priority answers “what should an analyst inspect next?”, not “who is most guilty”. Rank previously
unknown, actionable nodes above already known seeds while keeping every node scored.

`base = .25 role_strength + .20 centrality + .20 seed_exposure + .15 money + .10 temporal + .10 cluster_relevance`

where:

- `role_strength` is the winning specialized-role score, or zero for `peripheral`;
- `centrality` is the mean PageRank/betweenness percentile;
- `seed_exposure` is the mean of seed reach and seed proximity;
- `temporal` is the maximum of rapid pass, synchronized incoming, burst, and split scores;
- `cluster_relevance` is the mean of normalized cluster seed count and cluster internal amount.

Then:

- multiply by `0.75` for a seed because it is already known to the analyst;
- multiply by `0.85` for a depth-4 node because outward behaviour is censored;
- add `0.05` (then clamp) for nodes connecting at least two seed-bearing communities;
- round only the final score to six decimal places.

The top list contains at least 20 nodes, sorted by priority descending and gid ascending. If fewer
than 20 non-seeds qualify, include seeds, but mark them as already known in `why`.

## Evidence generation

Evidence is assembled from facts, never generated by an LLM. Include two or three strongest facts,
then the limitation most relevant to the node. Examples:

- `Receives from 11 senders; retains 97% of observed inflow; reached by 6 seeds.`
- `Sends to 63 recipients; KZT 8.2m observed outflow; top 1% out-degree at depth 2.`
- `Passes 91% of comparable flow within 1 day; bridges 3 seed paths.`
- `Observed sink at depth 3; receives from 7 senders; no observed outgoing transfer.`
- `Depth-4 boundary node; outgoing continuation is outside the extracted graph.`

Build evidence from short pre-tested clauses in priority order and truncate at a clause boundary,
never mid-number or mid-word. Enforce 1..200 characters in output validation.

## Output acceptance checks

`nodes_roles.csv`:

- exactly one row per input gid and exactly 2,248 rows for the supplied dataset;
- no duplicate gid, null role, null cluster, null score, or empty evidence;
- role belongs to the six-value contract;
- role and priority scores are finite and within `[0, 1]`;
- every depth-4 sink labelled `terminal` causes the run to fail.

`clusters.csv`:

- every referenced cluster exists in node output;
- cluster node counts sum to 2,248;
- `n_seed` sums to 81;
- internal amounts are finite and non-negative;
- top gids belong to their cluster.

`top_nodes.csv`:

- at least 20 unique gids from node output;
- ranks are consecutive from 1;
- rows are sorted deterministically;
- priority agrees with `nodes_roles.csv`;
- `why` is non-empty and cautious in wording.

Also emit a machine-readable run summary containing input row counts, rejected rows, thresholds,
runtime, modularity, component count, cluster count, role counts, and SHA-256 hashes of inputs.

## Evaluation without ground truth

Accuracy cannot be claimed. Validate the method through:

1. **Invariants:** boundary sinks are not terminals; seeds do not use incomplete balance features;
   all rows and amounts reconcile.
2. **Stability:** perturb edge amounts by +/-5% and require at least 80% overlap in top 20 and 90%
   unchanged roles outside threshold ties.
3. **Ablation:** compare priority without centrality, temporal, and seed exposure; top explanations
   should remain intelligible and large changes must be documented.
4. **Analyst spot checks:** inspect at least two nodes for every specialized role and one depth-4
   censored node directly against transactions.
5. **Runtime:** cold full pipeline below five minutes on an ordinary laptop.

## Demo nodes to select after data arrives

Choose by rules, never hard-coded gids:

1. highest-priority non-seed consolidator reachable from at least three seeds;
2. highest rapid-pass transit node below depth 4;
3. highest out-degree distributor;
4. one depth-4 sink to demonstrate correct uncertainty handling.

For each, prepare a card showing its observed flows, counterparties, seed paths, role rule, competing
role score, cluster, priority decomposition, and explicit data limitation.

## Scaling to approximately one million nodes

Keep the same feature and evidence contract, but replace in-memory exact algorithms: use chunked
Parquet scans, integer-indexed adjacency in a graph engine, approximate/sample betweenness,
personalized PageRank from seeds, and distributed or Leiden/Louvain community detection. Persist
intermediate feature tables and recompute only affected partitions. Exact transaction matching can
be partitioned by gid and date. The explainable rule layer remains unchanged.
