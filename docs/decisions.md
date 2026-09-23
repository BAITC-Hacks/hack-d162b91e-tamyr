# Decisions

Newest entry last. A timed line saying what was chosen, and what it was chosen over.

This file exists because an agent's own memory lives on one laptop, for one tool, for one person —
and there are three of us and two different agents. If it is not written here it does not exist
an hour from now. Keep entries short; the reasoning matters more than the prose.

```
**14:20 — <what was chosen>.**
<why, in two or three lines>. Chosen over: <the alternative, and why not>.
```

---

**14:40 — Case: Track 2 «Граф денег».**
It suits the team: the core is a graph algorithm (Саян), an analyst assistant over tools (Бекжан)
and a network screen (Ораз).

**14:40 — The pipeline is TypeScript in this repo, not Python.**
One runtime means one install for the jury, whose failure to run the project eliminates us
(§5.4.16). The agent tools call the same functions that produce the CSVs. Our PageRank, HITS and
betweenness were checked against networkx on all 2 248 nodes and differ by less than 1e-14. The
full compute takes 0.35 s. Chosen over: a Python pipeline with networkx. The ТЗ only *recommends*
it, it needs a second runtime, and the organiser's own starter crashes on a clean machine
(`nx.pagerank` needs scipy, which its requirements do not list).

**14:40 — Sigma.js (WebGL) with a layout precomputed by ForceAtlas2 in the pipeline.**
It shares graphology with the clustering. WebGL handles 2 248 nodes with a wide margin. A
precomputed layout keeps the picture identical on every run, which matters for a demo. Chosen over:
Cytoscape.js (canvas, near its limit, synchronous layout), Reagraph (three.js weight, layout in the
browser) and react-force-graph (a live layout that keeps moving).

**14:40 — `data/*.parquet` is committed.**
Must-have 1 demands a run with no manual steps. The files are 87 KB and the licence allows use
within the hackathon. Chosen over: asking the jury to place the archive.

**14:40 — Exactly the six ТЗ roles. Truncation is a flag.**
The CSV is checked mechanically against the dictionary. A depth-4 node with no outgoing transfers
is never `terminal`: it is `peripheral` or `consolidator`, carries `truncated` and has its
`role_score` capped. Chosen over: a seventh role, which is allowed but risks the mechanical check.

**14:40 — The app reads `output/analysis.json` written by the pipeline, and `predev` and
`prebuild` run the pipeline.**
Tool handlers are synchronous, and parsing parquet per request is pointless for a batch dataset.
The output dir is `output/`, because `out/` is gitignored as Next's export dir. Chosen over:
computing on the first request (async inside sync tools).

**14:40 — A gid is a string, a date is a `'YYYY-MM-DD'` string.**
Gids are ~1e17, above `Number.MAX_SAFE_INTEGER`. `Number(gid)` silently merges distinct clients.

**14:40 — The UI and all generated text are in Russian. The code is in English.**

**14:55 — Live model: OpenAI `gpt-6-luna` through the Responses adapter.**
The budget is $50. It costs $0.10 per 1M input tokens and $0.50 per 1M output. It called a
function tool correctly on the first try with 0 reasoning tokens. A demo turn of ~15k input and
~1k output tokens costs about $0.002. Chosen over: `gpt-5.6-luna` (2× the price, spends reasoning
tokens), `gpt-5-mini` (6× the reasoning tokens) and `gpt-6-sol` (20× the price; the fallback only
if luna's answers are weak). `.env.example` stays on `mock` for reviewers.
