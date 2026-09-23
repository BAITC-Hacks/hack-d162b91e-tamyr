import { type NodeRow, type TopRow } from '@server/graph/model/graph.schema';
import 'server-only';

/**
 * gid → priority for the analyst, 0–1.
 *
 * STUB — Саян, Chunk 2. Until the weighted formula lands, the score is flow volume relative to the
 * largest, which at least orders the list sensibly.
 */
export function scorePriority(nodes: Omit<NodeRow, 'priorityScore'>[]): Map<string, number> {
	const volume = (node: Omit<NodeRow, 'priorityScore'>) => node.inKzt + node.outKzt;
	const max = Math.max(1, ...nodes.map(volume));

	return new Map(nodes.map((node) => [node.gid, volume(node) / max]));
}

/**
 * The ranked list, highest priority first, with a Russian `why`.
 *
 * STUB — Саян, Chunk 2.
 */
export function rankTop(nodes: NodeRow[], limit: number): TopRow[] {
	return [...nodes]
		.sort((a, b) => b.priorityScore - a.priorityScore)
		.slice(0, limit)
		.map((node, index) => ({
			gid: node.gid,
			priorityScore: node.priorityScore,
			rank: index + 1,
			role: node.role,
			why: `оборот ${Math.round(node.inKzt + node.outKzt).toLocaleString('ru-RU')} KZT`,
		}));
}
