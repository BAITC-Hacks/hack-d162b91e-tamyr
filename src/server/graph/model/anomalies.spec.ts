import { detectAnomalies } from '@server/graph/model/anomalies';
import { type RawGraph } from '@server/graph/model/graph.schema';
import { describe, expect, it } from 'vitest';

type Tx = RawGraph['transactions'][number];

function tx(src: string, input: { date?: string; dst: string; sumKzt?: number }): Tx {
	return { date: input.date ?? '2024-01-01', dst: input.dst, src, sumKzt: input.sumKzt ?? 100 };
}

function graph(input: { edges?: [string, string][]; transactions?: Tx[] }): RawGraph {
	const edges = (input.edges ?? []).map(([src, dst]) => ({ depth: 1, dst, nTx: 1, src, sumKzt: 1 }));
	const gids = new Set([...edges.flatMap((edge) => [edge.src, edge.dst])]);
	return {
		edges,
		nodes: [...gids].map((gid) => ({ depth: 1, gid, isSeed: false })),
		transactions: input.transactions ?? [],
	};
}

function flagsOf(raw: RawGraph, gid: string): string[] {
	return detectAnomalies(raw).get(gid) ?? [];
}

describe('detectAnomalies', () => {
	it('flags split on the receiver of three near-equal same-day transfers from one sender', () => {
		const raw = graph({
			transactions: [
				tx('1', { dst: '2', sumKzt: 100 }),
				tx('1', { dst: '2', sumKzt: 105 }),
				tx('1', { dst: '2', sumKzt: 95 }),
			],
		});
		expect(flagsOf(raw, '2')).toContain('split');
		expect(flagsOf(raw, '1')).not.toContain('split');
	});

	it('does not flag split when amounts spread beyond ten percent or dates differ', () => {
		const spread = graph({
			transactions: [
				tx('1', { dst: '2', sumKzt: 100 }),
				tx('1', { dst: '2', sumKzt: 130 }),
				tx('1', { dst: '2', sumKzt: 100 }),
			],
		});
		const days = graph({
			transactions: [
				tx('1', { date: '2024-01-01', dst: '2' }),
				tx('1', { date: '2024-01-02', dst: '2' }),
				tx('1', { date: '2024-01-03', dst: '2' }),
			],
		});
		expect(flagsOf(spread, '2')).not.toContain('split');
		expect(flagsOf(days, '2')).not.toContain('split');
	});

	it('flags sync_inflow when three distinct payers pay one node on one date', () => {
		const raw = graph({ transactions: [tx('1', { dst: '9' }), tx('2', { dst: '9' }), tx('3', { dst: '9' })] });
		expect(flagsOf(raw, '9')).toContain('sync_inflow');
	});

	it('does not flag sync_inflow for repeated transfers from the same two payers', () => {
		const raw = graph({
			transactions: [tx('1', { dst: '9' }), tx('1', { dst: '9', sumKzt: 300 }), tx('2', { dst: '9' })],
		});
		expect(flagsOf(raw, '9')).not.toContain('sync_inflow');
	});

	it('flags every node of a short directed cycle and not its tail', () => {
		const raw = graph({
			edges: [
				['1', '2'],
				['2', '3'],
				['3', '1'],
				['3', '4'],
			],
		});
		expect(['1', '2', '3'].map((gid) => flagsOf(raw, gid).includes('cycle'))).toEqual([true, true, true]);
		expect(flagsOf(raw, '4')).not.toContain('cycle');
	});

	it('ignores self-loops and cycles longer than six', () => {
		const ring = ['1', '2', '3', '4', '5', '6', '7'];
		const raw = graph({
			edges: [...ring.map((gid, index): [string, string] => [gid, ring[(index + 1) % ring.length]!]), ['8', '8']],
		});
		expect(detectAnomalies(raw).size).toBe(0);
	});
});
