import { type ClusterRow, type NodeRow, type RawGraph } from '@server/graph/model/graph.schema';
import 'server-only';

/**
 * gid → cluster id, for every node including isolated ones.
 *
 * STUB — Саян, Chunk 2: Louvain on the undirected weighted projection with a fixed rng. Everything
 * is cluster 0 until then.
 */
export function detectClusters(raw: RawGraph): Map<string, number> {
	return new Map(raw.nodes.map((node) => [node.gid, 0]));
}

/**
 * One row per cluster, with a Russian hypothesis about its purpose.
 *
 * STUB — Саян, Chunk 2.
 */
export function summarizeClusters(raw: RawGraph, nodes: NodeRow[]): ClusterRow[] {
	const byCluster = new Map<number, NodeRow[]>();

	for (const node of nodes) {
		byCluster.set(node.clusterId, [...(byCluster.get(node.clusterId) ?? []), node]);
	}

	return [...byCluster.entries()].map(([clusterId, members]) => {
		const inside = new Set(members.map((member) => member.gid));

		return {
			clusterId,
			hypothesis: 'гипотеза ещё не сформирована',
			nNodes: members.length,
			nSeed: members.filter((member) => member.isSeed).length,
			sumKztInternal: raw.edges
				.filter((edge) => inside.has(edge.src) && inside.has(edge.dst))
				.reduce((sum, edge) => sum + edge.sumKzt, 0),
			topGids: [...members]
				.sort((a, b) => b.priorityScore - a.priorityScore)
				.slice(0, 5)
				.map((member) => member.gid),
		};
	});
}
