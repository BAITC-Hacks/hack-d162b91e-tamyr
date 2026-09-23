import { type RawGraph, rawGraphSchema } from '@server/graph/model/graph.schema';
import { asyncBufferFromFile, parquetReadObjects } from 'hyparquet';
import { compressors } from 'hyparquet-compressors';
import { join } from 'node:path';
import 'server-only';

/**
 * Reads `nodes.parquet`, `edges.parquet` and `transactions.parquet` into a `RawGraph`.
 *
 * Only the pipeline calls this. The application reads `analysis.json` instead, so this is the one
 * place that knows the files' column names and physical types. Two conversions here are the ones
 * that silently corrupt the result if done anywhere else:
 *
 * - A gid is INT64 around 1e17, above `Number.MAX_SAFE_INTEGER`. hyparquet returns it as a
 *   `bigint`; it becomes a string here and is never a number again. `Number(gid)` merges distinct
 *   clients, and the schema's digit regex is what catches it if somebody tries.
 * - A DATE arrives as a UTC-midnight `Date`. The calendar date is the ISO prefix; formatting it in
 *   local time moves every transaction to the previous day west of Greenwich.
 *
 * The files are ZSTD-compressed. hyparquet alone speaks only snappy, hence `hyparquet-compressors`.
 *
 * Measured on the real data: all three files in about 44 ms.
 */

type Row = Record<string, unknown>;

async function readTable(dataDir: string, name: string): Promise<Row[]> {
	const file = await asyncBufferFromFile(join(dataDir, `${name}.parquet`));

	return parquetReadObjects({ compressors, file });
}

function gid(value: unknown, column: string): string {
	if (typeof value === 'bigint') return value.toString();
	if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value);

	throw new TypeError(`${column}: expected an integer id, got ${typeof value}`);
}

/** Small integers — depth, n_tx — arrive as bigint (INT64) or number (INT32) depending on the column. */
function int(value: unknown, column: string): number {
	if (typeof value === 'number') return value;
	if (typeof value === 'bigint' && value <= BigInt(Number.MAX_SAFE_INTEGER)) return Number(value);

	throw new TypeError(`${column}: expected an integer, got ${typeof value}`);
}

function kzt(value: unknown, column: string): number {
	if (typeof value === 'number') return value;
	if (typeof value === 'bigint') return Number(value);

	throw new TypeError(`${column}: expected an amount, got ${typeof value}`);
}

function bool(value: unknown, column: string): boolean {
	if (typeof value === 'boolean') return value;

	throw new TypeError(`${column}: expected a boolean, got ${typeof value}`);
}

function isoDate(value: unknown, column: string): string {
	if (value instanceof Date) return value.toISOString().slice(0, 10);
	if (typeof value === 'string') return value.slice(0, 10);

	throw new TypeError(`${column}: expected a date, got ${typeof value}`);
}

export async function readRawGraph(dataDir: string): Promise<RawGraph> {
	const nodes = await readTable(dataDir, 'nodes');
	const edges = await readTable(dataDir, 'edges');
	const transactions = await readTable(dataDir, 'transactions');

	// The schema is the last word: a file with a missing column or a negative amount fails here,
	// with the row and the field named, rather than three functions later as a NaN in a CSV.
	return rawGraphSchema.parse({
		edges: edges.map((row) => ({
			depth: int(row.depth, 'edges.depth'),
			dst: gid(row.dst, 'edges.dst'),
			nTx: int(row.n_tx, 'edges.n_tx'),
			src: gid(row.src, 'edges.src'),
			sumKzt: kzt(row.sum_kzt, 'edges.sum_kzt'),
		})),
		nodes: nodes.map((row) => ({
			depth: int(row.depth, 'nodes.depth'),
			gid: gid(row.gid, 'nodes.gid'),
			isSeed: bool(row.is_seed, 'nodes.is_seed'),
		})),
		transactions: transactions.map((row) => ({
			date: isoDate(row.date, 'transactions.date'),
			dst: gid(row.dst, 'transactions.dst'),
			src: gid(row.src, 'transactions.src'),
			sumKzt: kzt(row.sum_kzt, 'transactions.sum_kzt'),
		})),
	});
}
