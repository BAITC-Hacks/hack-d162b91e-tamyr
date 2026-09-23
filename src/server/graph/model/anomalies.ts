import { type RawGraph } from '@server/graph/model/graph.schema';
import 'server-only';

/** Thresholds of the anomaly flags; merged into ROLE_THRESHOLDS so they reach analysis.json. */
export const ANOMALY_THRESHOLDS: Record<string, number> = {
	cycleMaxLength: 6,
	splitMaxSpread: 0.1,
	splitMinTransfers: 3,
	syncInflowMinPayers: 3,
};

type Transaction = RawGraph['transactions'][number];

function median(values: number[]): number {
	const sorted = [...values].sort((left, right) => left - right);
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function groupBy(transactions: Transaction[], key: (tx: Transaction) => string): Map<string, Transaction[]> {
	const groups = new Map<string, Transaction[]>();
	for (const tx of transactions) {
		const k = key(tx);
		const group = groups.get(k) ?? [];
		group.push(tx);
		groups.set(k, group);
	}
	return groups;
}

function isSplitGroup(group: Transaction[]): boolean {
	if (group.length < ANOMALY_THRESHOLDS.splitMinTransfers!) return false;
	const amounts = group.map((tx) => tx.sumKzt);
	const center = median(amounts);
	if (center <= 0) return false;
	return amounts.every((amount) => Math.abs(amount - center) <= ANOMALY_THRESHOLDS.splitMaxSpread! * center);
}

/** Receivers that got ≥ 3 near-equal transfers from one sender on one date. */
function splitReceivers(raw: RawGraph): Set<string> {
	const receivers = new Set<string>();
	const groups = groupBy(raw.transactions, (tx) => `${tx.src}|${tx.dst}|${tx.date}`);
	for (const group of groups.values()) {
		if (isSplitGroup(group)) receivers.add(group[0]!.dst);
	}
	return receivers;
}

/** Receivers that got money from ≥ 3 distinct payers on one date. */
function syncInflowReceivers(raw: RawGraph): Set<string> {
	const receivers = new Set<string>();
	const groups = groupBy(raw.transactions, (tx) => `${tx.dst}|${tx.date}`);
	for (const group of groups.values()) {
		const payers = new Set(group.map((tx) => tx.src));
		if (payers.size >= ANOMALY_THRESHOLDS.syncInflowMinPayers!) receivers.add(group[0]!.dst);
	}
	return receivers;
}

function returnsWithin(outgoing: Map<string, Set<string>>, start: string): boolean {
	const seen = new Set<string>();
	let frontier = [...(outgoing.get(start) ?? [])].filter((gid) => gid !== start);
	for (let length = 2; length <= ANOMALY_THRESHOLDS.cycleMaxLength! && frontier.length > 0; length += 1) {
		const next: string[] = [];
		for (const current of frontier) {
			for (const neighbour of outgoing.get(current) ?? []) {
				if (neighbour === start) return true;
				if (!seen.has(neighbour)) {
					seen.add(neighbour);
					next.push(neighbour);
				}
			}
		}
		frontier = next;
	}
	return false;
}

/** Nodes on a directed cycle of length ≤ cycleMaxLength (self-loops ignored); bounded BFS per node. */
function cycleNodes(raw: RawGraph): Set<string> {
	const outgoing = new Map<string, Set<string>>();
	for (const edge of raw.edges) {
		if (edge.src !== edge.dst) {
			const neighbours = outgoing.get(edge.src) ?? new Set<string>();
			neighbours.add(edge.dst);
			outgoing.set(edge.src, neighbours);
		}
	}
	return new Set([...outgoing.keys()].filter((gid) => returnsWithin(outgoing, gid)));
}

/** Pure anomaly detection: gid → anomaly flags ('split', 'sync_inflow', 'cycle'). */
export function detectAnomalies(raw: RawGraph): Map<string, string[]> {
	const result = new Map<string, string[]>();
	const detected: [string, Set<string>][] = [
		['split', splitReceivers(raw)],
		['sync_inflow', syncInflowReceivers(raw)],
		['cycle', cycleNodes(raw)],
	];
	for (const [flag, gids] of detected) {
		for (const gid of gids) result.set(gid, [...(result.get(gid) ?? []), flag]);
	}
	return result;
}
