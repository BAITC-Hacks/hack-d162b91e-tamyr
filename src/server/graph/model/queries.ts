import {
	type Analysis,
	type Collector,
	type CollectorsInput,
	type CoverageGap,
	type Flow,
	type FlowInput,
	type NodeCard,
	type RemovalImpact,
} from '@server/graph/model/graph.schema';
import 'server-only';

/**
 * Read-only questions over a finished analysis. The agent's tools are thin wrappers over these.
 *
 * STUBS — Саян, Chunk 3. `nodeCard` is real enough to use; the rest return empty results with the
 * real shapes, so the tools and the mock scenario can be built now.
 */

export function nodeCard(a: Analysis, gid: string): NodeCard | null {
	const node = a.nodes.find((candidate) => candidate.gid === gid);

	if (node === undefined) return null;

	const roleOf = new Map(a.nodes.map((candidate) => [candidate.gid, candidate.role]));
	const top = (edges: Analysis['edges'], pick: (edge: Analysis['edges'][number]) => string) =>
		[...edges]
			.sort((x, y) => y.sumKzt - x.sumKzt)
			.slice(0, 5)
			.map((edge) => ({
				gid: pick(edge),
				nTx: edge.nTx,
				role: roleOf.get(pick(edge)) ?? 'peripheral',
				sumKzt: edge.sumKzt,
			}));

	return {
		node,
		topIn: top(
			a.edges.filter((edge) => edge.dst === gid),
			(edge) => edge.src,
		),
		topOut: top(
			a.edges.filter((edge) => edge.src === gid),
			(edge) => edge.dst,
		),
	};
}

export function findCollectors(_a: Analysis, _input: CollectorsInput): Collector[] {
	return [];
}

export function traceFlow(_a: Analysis, input: FlowInput): Flow {
	return { ...input, edges: [], nodes: [] };
}

export function simulateRemoval(_a: Analysis, gids: string[]): RemovalImpact {
	const empty = { components: 0, largest: 0, seedsInLargest: 0 };

	return { after: empty, before: empty, removed: gids };
}

export function coverageGaps(_a: Analysis): CoverageGap[] {
	return [];
}
