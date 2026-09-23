import { type NodeMetrics, type RawGraph } from '@server/graph/model/graph.schema';
import 'server-only';

/**
 * Per-node metrics over the directed, KZT-weighted transfer graph.
 *
 * STUB — Саян, Chunk 1 in `docs/plan.md`. The signature is the contract; only degrees, sums and
 * truncation are real so far, which is enough for the pipeline to write valid rows.
 */
export function computeMetrics(raw: RawGraph): Map<string, NodeMetrics> {
	const metrics = new Map<string, NodeMetrics>();

	for (const node of raw.nodes) {
		metrics.set(node.gid, {
			authority: 0,
			betweenness: 0,
			depth: node.depth,
			fastTransitShare: 0,
			gid: node.gid,
			hub: 0,
			inDeg: 0,
			inKzt: 0,
			inTx: 0,
			isSeed: node.isSeed,
			outDeg: 0,
			outKzt: 0,
			outTx: 0,
			pagerank: 0,
			passThrough: null,
			seedsUpstream: 0,
			truncated: false,
		});
	}

	for (const edge of raw.edges) {
		const src = metrics.get(edge.src);
		const dst = metrics.get(edge.dst);

		if (src !== undefined) {
			src.outDeg += 1;
			src.outKzt += edge.sumKzt;
			src.outTx += edge.nTx;
		}

		if (dst !== undefined) {
			dst.inDeg += 1;
			dst.inKzt += edge.sumKzt;
			dst.inTx += edge.nTx;
		}
	}

	for (const metric of metrics.values()) {
		metric.passThrough = metric.inKzt > 0 ? metric.outKzt / metric.inKzt : null;
		metric.truncated = metric.depth === 4 && metric.outDeg === 0;
	}

	return metrics;
}
