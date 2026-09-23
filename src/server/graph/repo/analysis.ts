import { type Analysis, analysisSchema } from '@server/graph/model/graph.schema';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import 'server-only';

/**
 * Reads the finished analysis that `pnpm pipeline` wrote.
 *
 * This is the only way the application ever sees the graph. The parquet files are parsed once, by
 * the pipeline, and everything the screen and the agent's tools need is in `output/analysis.json`
 * — so a tool handler can stay synchronous (`executeTool` is sync) and a request never touches
 * parquet. See "Stack facts" in `docs/plan.md`.
 *
 * Three outcomes, kept distinct on purpose:
 *
 * - The file is missing → `null`. The pipeline has not run; the screen shows "run `pnpm pipeline`".
 * - The file is there and valid → the `Analysis`, cached until the file's mtime changes, so a
 *   re-run of the pipeline is picked up by the running dev server without a restart.
 * - The file is there and invalid → a thrown error naming the problem. A corrupt or stale file is
 *   a bug, not an empty state, and hiding it behind `null` would send someone to re-run a pipeline
 *   that is not the thing that is broken.
 */

/**
 * The directory the pipeline writes to, relative to the project root. Not `out/`: that is Next's
 * export directory and it is gitignored, while the CSVs are a required artifact.
 */
export const OUTPUT_DIR = 'output';
export const ANALYSIS_FILE = 'analysis.json';

interface CachedAnalysis {
	analysis: Analysis;
	mtimeMs: number;
	path: string;
}

let cached: CachedAnalysis | null = null;

export function readAnalysis(outDir: string): Analysis | null {
	const path = join(outDir, ANALYSIS_FILE);

	if (!existsSync(path)) return null;

	const { mtimeMs } = statSync(path);

	if (cached !== null && cached.path === path && cached.mtimeMs === mtimeMs) return cached.analysis;

	let parsed: unknown;

	try {
		parsed = JSON.parse(readFileSync(path, 'utf8'));
	} catch (cause) {
		throw new Error(
			`${path} is not valid JSON: ${cause instanceof Error ? cause.message : String(cause)}. Re-run \`pnpm pipeline\`.`,
		);
	}

	const result = analysisSchema.safeParse(parsed);

	if (!result.success) {
		const problems = result.error.issues
			.slice(0, 5)
			.map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`)
			.join('\n');

		throw new Error(`${path} does not match the analysis contract:\n${problems}\nRe-run \`pnpm pipeline\`.`);
	}

	cached = { analysis: result.data, mtimeMs, path };

	return result.data;
}

/** Tests write their own files; without this they would all see the first one read. */
export function resetAnalysisCache(): void {
	cached = null;
}
