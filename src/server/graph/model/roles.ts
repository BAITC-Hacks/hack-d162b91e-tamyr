import { type NodeMetrics, type RawGraph, type RoleVerdict } from '@server/graph/model/graph.schema';
import 'server-only';

/**
 * Every number the role rules use. Exported into `analysis.json` and copied into the README, so
 * the documented criteria and the applied ones cannot drift apart.
 *
 * STUB values — Саян tunes them against the data (see "Role rules" in `docs/plan.md`).
 */
export const ROLE_THRESHOLDS: Record<string, number> = {
	consolidatorMinInDeg: 5,
	distributorMinOutDeg: 10,
	transitMaxPassThrough: 1.2,
	transitMinPassThrough: 0.8,
};

/**
 * One verdict per node: role, confidence, Russian evidence with numbers, flags.
 *
 * STUB — Саян, Chunk 1. Everything is `peripheral` until the real rules land.
 */
export function assignRoles(_raw: RawGraph, metrics: Map<string, NodeMetrics>): Map<string, RoleVerdict> {
	const verdicts = new Map<string, RoleVerdict>();

	for (const metric of metrics.values()) {
		verdicts.set(metric.gid, {
			evidence: `входящих ${metric.inDeg}, исходящих ${metric.outDeg}; правила ролей ещё не подключены`,
			flags: metric.truncated ? ['truncated'] : [],
			role: 'peripheral',
			roleScore: 0,
		});
	}

	return verdicts;
}
