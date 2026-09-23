import { type Analysis, type Role } from '@server/graph/model/graph.schema';
import { DirectedGraph } from 'graphology';

/**
 * The graphology graph sigma draws, built from the analysis as it is.
 *
 * No layout runs in the browser: the pipeline computed x/y with a fixed seed, so the picture is the
 * same on every machine and every reload, and the jury sees the network the README describes.
 */

// The index signatures are what graphology's `Attributes` constraint asks for; an interface without
// one is not assignable to it.
export interface GraphNodeAttributes {
	[key: string]: unknown;
	clusterId: number;
	label: string;
	role: Role;
	size: number;
	x: number;
	y: number;
}

export interface GraphEdgeAttributes {
	[key: string]: unknown;
	size: number;
	type: 'arrow';
}

export type MoneyGraph = DirectedGraph<GraphNodeAttributes, GraphEdgeAttributes>;

/** Pixels at the default zoom. The top of the priority list must stand out from two thousand dots. */
export const NODE_SIZE = { max: 12, min: 2 } as const;
export const EDGE_SIZE = { max: 3, min: 0.4 } as const;

export function nodeSize(priorityScore: number): number {
	return NODE_SIZE.min + (NODE_SIZE.max - NODE_SIZE.min) * Math.min(1, Math.max(0, priorityScore));
}

/** Transfers span 7k to 3M KZT, so thickness follows the logarithm or the graph is all hairlines. */
function edgeSizer(amounts: readonly number[]): (sumKzt: number) => number {
	const logs = amounts.map((amount) => Math.log10(amount + 1));
	const low = Math.min(...logs);
	const span = Math.max(...logs) - low;

	return (sumKzt) => {
		if (span <= 0) return (EDGE_SIZE.min + EDGE_SIZE.max) / 2;

		return EDGE_SIZE.min + ((EDGE_SIZE.max - EDGE_SIZE.min) * (Math.log10(sumKzt + 1) - low)) / span;
	};
}

export function buildGraph(analysis: Pick<Analysis, 'edges' | 'nodes'>): MoneyGraph {
	const graph: MoneyGraph = new DirectedGraph();

	for (const node of analysis.nodes) {
		graph.mergeNode(node.gid, {
			clusterId: node.clusterId,
			label: node.gid,
			role: node.role,
			size: nodeSize(node.priorityScore),
			x: node.x,
			y: node.y,
		});
	}

	const sizeOf = edgeSizer(analysis.edges.map((edge) => edge.sumKzt));

	for (const edge of analysis.edges) {
		// An edge to a node that is not in the list would make graphology invent a node with no
		// position, and sigma refuses to render one. Skip it rather than lose the whole picture.
		if (graph.hasNode(edge.src) && graph.hasNode(edge.dst)) {
			graph.mergeEdge(edge.src, edge.dst, { size: sizeOf(edge.sumKzt), type: 'arrow' });
		}
	}

	return graph;
}
