import { type RawGraph } from '@server/graph/model/graph.schema';
import Graph from 'graphology';
import forceAtlas2 from 'graphology-layout-forceatlas2';
import 'server-only';

/**
 * One position per node, computed once by the pipeline and stored in `analysis.json`.
 *
 * The screen draws the graph with Sigma from these coordinates and never runs a layout itself, so
 * the picture is identical on every run and on every machine — which matters when a jury member
 * names a gid and the presenter has rehearsed where it sits. See `docs/decisions.md`, 14:40.
 *
 * ForceAtlas2 is deterministic given a starting position for every node, so the start is fixed
 * too: nodes on a circle in gid order. The library also documents that it cannot compute a layout
 * from all-zero coordinates, which the circle avoids. Edges are weighted by the log of the KZT
 * moved, so a heavy pair sits closer without one 3M-tenge transfer folding the picture.
 */

export interface Position {
	x: number;
	y: number;
}

/**
 * More iterations converge tighter and cost linearly. With Barnes–Hut on (which `inferSettings`
 * turns on above 2 000 nodes) 300 iterations settle 2 248 nodes in about a second.
 */
const ITERATIONS = 300;

const round = (value: number): number => Math.round(value * 100) / 100;

export function computeLayout(raw: RawGraph): Map<string, Position> {
	const graph = new Graph<Position, { weight: number }>({ type: 'directed' });
	const gids = raw.nodes.map((node) => node.gid).sort();
	const radius = Math.max(100, gids.length);

	gids.forEach((gid, index) => {
		const angle = (2 * Math.PI * index) / gids.length;

		graph.addNode(gid, { x: round(Math.cos(angle) * radius), y: round(Math.sin(angle) * radius) });
	});

	// Sorted, so the iteration order — and with it the result — does not depend on parquet row order.
	const edges = [...raw.edges].sort((a, b) => a.src.localeCompare(b.src) || a.dst.localeCompare(b.dst));

	for (const edge of edges) {
		if (graph.hasNode(edge.src) && graph.hasNode(edge.dst)) {
			graph.mergeEdge(edge.src, edge.dst, { weight: Math.log10(1 + edge.sumKzt) });
		}
	}

	forceAtlas2.assign(graph, {
		getEdgeWeight: 'weight',
		iterations: ITERATIONS,
		settings: forceAtlas2.inferSettings(graph),
	});

	const positions = new Map<string, Position>();

	graph.forEachNode((gid, attributes) => {
		positions.set(gid, { x: round(attributes.x), y: round(attributes.y) });
	});

	return positions;
}
