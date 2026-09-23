import { type NodeMetrics, type RawGraph, type RoleVerdict } from '@server/graph/model/graph.schema';
import 'server-only';

/** Every numeric constant used by the role rules; also exported into analysis.json. */
export const ROLE_THRESHOLDS: Record<string, number> = {
	consolidatorMaxOutDeg: 2,
	consolidatorMaxPassThrough: 0.5,
	consolidatorMinInDeg: 5,
	consolidatorSeedMinInDeg: 3,
	consolidatorSeedMinUpstream: 2,
	coordinatorMaxDepth: 1,
	coordinatorMaxHops: 2,
	coordinatorMinCentrality: 0,
	coordinatorMinTargets: 2,
	coordinatorTopFraction: 0.05,
	distributorMinOutDeg: 10,
	distributorOutInRatio: 3,
	fastTransitFlagMinShare: 0.5,
	terminalMinInDeg: 2,
	terminalMinInKzt: 30_000,
	transitMaxDegree: 8,
	transitMaxPassThrough: 1.2,
	transitMinPassThrough: 0.8,
	truncatedMaxScore: 0.5,
	truncatedMinDepth: 4,
};

function clamp(value: number): number {
	return Math.max(0, Math.min(1, value));
}

function clearsConsolidatorInputs(metric: NodeMetrics): boolean {
	return (
		metric.inDeg >= ROLE_THRESHOLDS.consolidatorMinInDeg! ||
		(metric.inDeg >= ROLE_THRESHOLDS.consolidatorSeedMinInDeg! &&
			metric.seedsUpstream >= ROLE_THRESHOLDS.consolidatorSeedMinUpstream!)
	);
}

function isConsolidator(metric: NodeMetrics): boolean {
	const forwardsLittle =
		(metric.passThrough !== null && metric.passThrough < ROLE_THRESHOLDS.consolidatorMaxPassThrough!) ||
		metric.outDeg <= ROLE_THRESHOLDS.consolidatorMaxOutDeg!;
	return clearsConsolidatorInputs(metric) && forwardsLittle;
}

function isDistributor(metric: NodeMetrics): boolean {
	return (
		metric.outDeg >= ROLE_THRESHOLDS.distributorMinOutDeg! &&
		metric.outDeg >= ROLE_THRESHOLDS.distributorOutInRatio! * metric.inDeg
	);
}

function flagsFor(metric: NodeMetrics): string[] {
	const flags: string[] = [];
	if (metric.isSeed) flags.push('seed');
	if (metric.fastTransitShare >= ROLE_THRESHOLDS.fastTransitFlagMinShare!) flags.push('fast_transit');
	if (metric.truncated) flags.push('truncated');
	return flags;
}

function topCutoff(metrics: NodeMetrics[], field: 'betweenness' | 'hub'): number {
	const sorted = metrics.map((metric) => metric[field]).sort((left, right) => right - left);
	const count = Math.max(1, Math.ceil(sorted.length * ROLE_THRESHOLDS.coordinatorTopFraction!));
	return sorted[count - 1] ?? Number.POSITIVE_INFINITY;
}

function countTargetsWithinTwoHops(raw: RawGraph, input: { gid: string; targets: Set<string> }): number {
	const outgoing = new Map<string, Set<string>>();
	for (const edge of raw.edges) {
		const neighbours = outgoing.get(edge.src) ?? new Set<string>();
		neighbours.add(edge.dst);
		outgoing.set(edge.src, neighbours);
	}

	const reached = new Set<string>();
	const visited = new Set([input.gid]);
	let frontier = [input.gid];
	for (let hop = 1; hop <= ROLE_THRESHOLDS.coordinatorMaxHops!; hop += 1) {
		const next: string[] = [];
		for (const current of frontier) {
			for (const neighbour of outgoing.get(current) ?? []) {
				if (input.targets.has(neighbour)) reached.add(neighbour);
				if (!visited.has(neighbour)) {
					visited.add(neighbour);
					next.push(neighbour);
				}
			}
		}
		frontier = next;
	}

	return reached.size;
}

function percent(value: number | null): number {
	return Math.round((value ?? 0) * 100);
}

/** Assigns the first matching explainable role from the ordered rules in docs/plan.md. */
/* eslint-disable no-continue -- Each continue encodes the documented first-match role decision table. */
export function assignRoles(raw: RawGraph, metrics: Map<string, NodeMetrics>): Map<string, RoleVerdict> {
	const verdicts = new Map<string, RoleVerdict>();
	const allMetrics = [...metrics.values()];
	const candidateTargets = new Set(
		allMetrics.filter((metric) => isDistributor(metric) || isConsolidator(metric)).map((metric) => metric.gid),
	);
	const hubCutoff = topCutoff(allMetrics, 'hub');
	const betweennessCutoff = topCutoff(allMetrics, 'betweenness');

	for (const metric of allMetrics) {
		const flags = flagsFor(metric);

		if (metric.truncated || (metric.depth >= ROLE_THRESHOLDS.truncatedMinDepth! && metric.outDeg === 0)) {
			const role = clearsConsolidatorInputs(metric) ? 'consolidator' : 'peripheral';
			const inputScore = clamp(metric.inDeg / ROLE_THRESHOLDS.consolidatorMinInDeg!);
			verdicts.set(metric.gid, {
				evidence: `обход остановлен на 4-м колене; входящих ${metric.inDeg}, от seed ${metric.seedsUpstream}`,
				flags: flags.includes('truncated') ? flags : [...flags, 'truncated'],
				role,
				roleScore: Math.min(ROLE_THRESHOLDS.truncatedMaxScore!, inputScore),
			});
			continue;
		}

		const targetCount = countTargetsWithinTwoHops(raw, { gid: metric.gid, targets: candidateTargets });
		const central =
			metric.hub > ROLE_THRESHOLDS.coordinatorMinCentrality! &&
			metric.betweenness > ROLE_THRESHOLDS.coordinatorMinCentrality! &&
			metric.hub >= hubCutoff &&
			metric.betweenness >= betweennessCutoff;
		const coordinatorEligible = metric.isSeed || metric.depth <= ROLE_THRESHOLDS.coordinatorMaxDepth!;
		if (coordinatorEligible && (targetCount >= ROLE_THRESHOLDS.coordinatorMinTargets! || central)) {
			const reachScore = targetCount / ROLE_THRESHOLDS.coordinatorMinTargets!;
			const centralityScore = Math.max(metric.hub / (hubCutoff || 1), metric.betweenness / (betweennessCutoff || 1));
			verdicts.set(metric.gid, {
				evidence: `достигает ${targetCount} узлов сбора/раздачи за 2 шага; hub ${metric.hub.toFixed(3)}, мост ${metric.betweenness.toFixed(3)}`,
				flags,
				role: 'coordinator',
				roleScore: clamp(Math.max(reachScore, centralityScore)),
			});
			continue;
		}

		if (isDistributor(metric)) {
			const fanoutScore = metric.outDeg / ROLE_THRESHOLDS.distributorMinOutDeg!;
			const ratioScore = metric.outDeg / Math.max(1, metric.inDeg) / ROLE_THRESHOLDS.distributorOutInRatio!;
			verdicts.set(metric.gid, {
				evidence: `раздаёт ${metric.outDeg} получателям при ${metric.inDeg} входящих; исходящих ${Math.round(metric.outKzt)} ₸`,
				flags,
				role: 'distributor',
				roleScore: clamp(Math.min(fanoutScore, ratioScore)),
			});
			continue;
		}

		if (isConsolidator(metric)) {
			const degreeScore = metric.inDeg / ROLE_THRESHOLDS.consolidatorMinInDeg!;
			const seedScore = metric.seedsUpstream / ROLE_THRESHOLDS.consolidatorSeedMinUpstream!;
			verdicts.set(metric.gid, {
				evidence: `получает от ${metric.inDeg} плательщиков (${metric.seedsUpstream} seed), отдаёт ${percent(metric.passThrough)}% входящего`,
				flags,
				role: 'consolidator',
				roleScore: clamp(Math.max(degreeScore, seedScore)),
			});
			continue;
		}

		const transitDegree = metric.inDeg + metric.outDeg;
		const transit =
			!metric.isSeed &&
			metric.inDeg > 0 &&
			metric.outDeg > 0 &&
			metric.passThrough !== null &&
			metric.passThrough >= ROLE_THRESHOLDS.transitMinPassThrough! &&
			metric.passThrough <= ROLE_THRESHOLDS.transitMaxPassThrough! &&
			transitDegree <= ROLE_THRESHOLDS.transitMaxDegree!;
		if (transit) {
			const distanceFromEdge = Math.min(
				(metric.passThrough! - ROLE_THRESHOLDS.transitMinPassThrough!) /
					(1 - ROLE_THRESHOLDS.transitMinPassThrough!),
				(ROLE_THRESHOLDS.transitMaxPassThrough! - metric.passThrough!) /
					(ROLE_THRESHOLDS.transitMaxPassThrough! - 1),
			);
			verdicts.set(metric.gid, {
				evidence: `передаёт ${percent(metric.passThrough)}% входящего; ${percent(metric.fastTransitShare)}% исходящих — за 2 дня`,
				flags,
				role: 'transit',
				roleScore: clamp(0.6 + 0.2 * distanceFromEdge + 0.2 * metric.fastTransitShare),
			});
			continue;
		}

		const terminal =
			metric.outDeg === 0 &&
			metric.depth < ROLE_THRESHOLDS.truncatedMinDepth! &&
			(metric.inKzt >= ROLE_THRESHOLDS.terminalMinInKzt! || metric.inDeg >= ROLE_THRESHOLDS.terminalMinInDeg!);
		if (terminal) {
			const volumeScore = metric.inKzt / ROLE_THRESHOLDS.terminalMinInKzt!;
			const degreeScore = metric.inDeg / ROLE_THRESHOLDS.terminalMinInDeg!;
			verdicts.set(metric.gid, {
				evidence: `получено ${Math.round(metric.inKzt)} ₸ от ${metric.inDeg} плательщиков; исходящих 0`,
				flags,
				role: 'terminal',
				roleScore: clamp(Math.max(volumeScore, degreeScore)),
			});
			continue;
		}

		verdicts.set(metric.gid, {
			evidence: `входящих ${metric.inDeg}, исходящих ${metric.outDeg}; поток ${Math.round(metric.inKzt + metric.outKzt)} ₸`,
			flags,
			role: 'peripheral',
			roleScore: clamp((metric.inDeg + metric.outDeg) / ROLE_THRESHOLDS.transitMaxDegree!),
		});
	}

	return verdicts;
}
/* eslint-enable no-continue */
