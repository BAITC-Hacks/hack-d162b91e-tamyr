import { type NodeMetrics, type RawGraph, roleVerdictSchema } from '@server/graph/model/graph.schema';
import { assignRoles } from '@server/graph/model/roles';
import { describe, expect, it } from 'vitest';

function metric(overrides: Partial<NodeMetrics> & Pick<NodeMetrics, 'gid'>): NodeMetrics {
	return {
		authority: 0,
		betweenness: 0,
		depth: 2,
		fastTransitShare: 0,
		hub: 0,
		inDeg: 0,
		inKzt: 0,
		inTx: 0,
		isSeed: false,
		outDeg: 0,
		outKzt: 0,
		outTx: 0,
		pagerank: 0,
		passThrough: null,
		seedsUpstream: 0,
		truncated: false,
		...overrides,
	};
}

function raw(gids: string[], edges: RawGraph['edges'] = []): RawGraph {
	return {
		edges,
		nodes: gids.map((gid) => ({ depth: 2, gid, isSeed: false })),
		transactions: [],
	};
}

function roleFor(graph: RawGraph, input: { gid: string; metrics: NodeMetrics[] }): string {
	return assignRoles(graph, new Map(input.metrics.map((item) => [item.gid, item]))).get(input.gid)!.role;
}

describe('assignRoles', () => {
	it('assigns coordinator when an early node reaches two collection candidates', () => {
		const coordinator = metric({ depth: 1, gid: '1', outDeg: 2 });
		const firstTarget = metric({ gid: '2', inDeg: 5, inKzt: 100_000 });
		const secondTarget = metric({ gid: '3', inDeg: 5, inKzt: 100_000 });
		const graph = raw(
			['1', '2', '3'],
			[
				{ depth: 1, dst: '2', nTx: 1, src: '1', sumKzt: 1 },
				{ depth: 1, dst: '3', nTx: 1, src: '1', sumKzt: 1 },
			],
		);

		expect(roleFor(graph, { gid: '1', metrics: [coordinator, firstTarget, secondTarget] })).toBe('coordinator');
	});

	it.each([
		['distributor', metric({ gid: '10', inDeg: 2, outDeg: 10, outKzt: 500_000 })],
		['consolidator', metric({ gid: '11', inDeg: 5, inKzt: 500_000, outDeg: 1, outKzt: 100_000, passThrough: 0.2 })],
		[
			'transit',
			metric({
				fastTransitShare: 0.8,
				gid: '12',
				inDeg: 1,
				inKzt: 100_000,
				outDeg: 1,
				outKzt: 100_000,
				passThrough: 1,
			}),
		],
		['terminal', metric({ gid: '13', inDeg: 1, inKzt: 50_000 })],
		['peripheral', metric({ gid: '14', inDeg: 1, inKzt: 1_000 })],
	] as const)('assigns the %s role from its numeric rule', (expected, nodeMetric) => {
		expect(roleFor(raw([nodeMetric.gid]), { gid: nodeMetric.gid, metrics: [nodeMetric] })).toBe(expected);
	});

	it('flags a depth-four sink, caps its score and never calls it terminal', () => {
		const truncated = metric({ depth: 4, gid: '20', inDeg: 1, inKzt: 500_000, truncated: true });
		const verdict = assignRoles(raw(['20']), new Map([['20', truncated]])).get('20')!;

		expect(verdict.role).toBe('peripheral');
		expect(verdict.flags).toContain('truncated');
		expect(verdict.roleScore).toBeLessThanOrEqual(0.5);
		expect(verdict.evidence).toContain('обход остановлен на 4-м колене');
	});

	it('does not use a seed pass-through ratio to assign transit', () => {
		const seed = metric({
			gid: '30',
			inDeg: 1,
			inKzt: 100_000,
			isSeed: true,
			outDeg: 1,
			outKzt: 100_000,
			passThrough: 1,
		});

		expect(roleFor(raw(['30']), { gid: '30', metrics: [seed] })).toBe('peripheral');
	});

	it('keeps every verdict schema-valid, concise and numeric', () => {
		const nodes = [
			metric({ gid: '40', inDeg: 1, inKzt: 50_000 }),
			metric({ fastTransitShare: 1, gid: '41', inDeg: 1, inKzt: 10_000, outDeg: 1, outKzt: 10_000, passThrough: 1 }),
		];

		for (const verdict of assignRoles(raw(['40', '41']), new Map(nodes.map((node) => [node.gid, node]))).values()) {
			expect(() => roleVerdictSchema.parse(verdict)).not.toThrow();
			expect(verdict.evidence).toMatch(/\d/);
			expect(verdict.evidence.length).toBeLessThanOrEqual(200);
		}
	});
});
