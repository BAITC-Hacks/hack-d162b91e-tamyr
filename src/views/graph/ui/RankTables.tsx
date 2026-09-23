import { type ClusterRow, type TopRow } from '@server/graph/model/graph.schema';
import { Button } from '@shared/ui/Button';
import { Table, TableHead, Td, Th, Tr } from '@shared/ui/Table';
import clsx from 'clsx';
import { formatInteger, formatKzt, formatScore } from '../model/format';
import { GidButton, RoleTag } from './RoleTag';

/**
 * The two lists beside the graph: whom to check first, and which groups the network splits into.
 *
 * A row is acted on through the button in its first cell rather than a click anywhere on the `<tr>`:
 * a button is reachable by keyboard and says what it does, a clickable row is neither.
 */

export function TopList({ onSelect, rows }: { onSelect: (gid: string) => void; rows: readonly TopRow[] }) {
	if (rows.length === 0) {
		return <p className="text-fg-muted text-sm">Топ-лист пуст. Перезапустите `pnpm pipeline`.</p>;
	}

	return (
		<Table label="Топ-лист: кого проверять первым">
			<TableHead>
				<Th className="w-10">#</Th>
				<Th>gid и роль</Th>
				<Th className="text-right">Приоритет</Th>
			</TableHead>
			<tbody>
				{rows.map((row) => (
					<Tr key={row.gid}>
						<Td className="text-fg-muted tabular align-top">{row.rank}</Td>
						<Td className="align-top">
							<div className="flex flex-col gap-1">
								<GidButton gid={row.gid} onSelect={onSelect} />
								<RoleTag className="text-fg text-xs" role={row.role} />
								<p className="text-fg-muted text-xs">{row.why}</p>
							</div>
						</Td>
						<Td className="tabular text-right align-top">{formatScore(row.priorityScore)}</Td>
					</Tr>
				))}
			</tbody>
		</Table>
	);
}

export interface ClusterListProps {
	highlighted: number | null;
	onSelect: (clusterId: number) => void;
	rows: readonly ClusterRow[];
}

export function ClusterList({ highlighted, onSelect, rows }: ClusterListProps) {
	if (rows.length === 0) {
		return <p className="text-fg-muted text-sm">Кластеры не найдены. Перезапустите `pnpm pipeline`.</p>;
	}

	return (
		<Table label="Кластеры">
			<TableHead>
				<Th>Кластер</Th>
				<Th className="text-right">Узлов / seed</Th>
				<Th className="text-right">Внутри, ₸</Th>
			</TableHead>
			<tbody>
				{rows.map((row) => {
					const active = row.clusterId === highlighted;

					return (
						<Tr className={clsx(active && 'bg-accent-subtle')} key={row.clusterId}>
							<Td className="align-top">
								<div className="flex flex-col items-start gap-1">
									<Button
										aria-pressed={active}
										onClick={() => onSelect(row.clusterId)}
										size="sm"
										variant={active ? 'primary' : 'secondary'}
									>
										Кластер {row.clusterId}
									</Button>
									<p className="text-fg-muted text-xs">{row.hypothesis}</p>
								</div>
							</Td>
							<Td className="tabular text-right align-top whitespace-nowrap">
								{formatInteger(row.nNodes)} / {formatInteger(row.nSeed)}
							</Td>
							<Td className="tabular text-right align-top whitespace-nowrap">{formatKzt(row.sumKztInternal)}</Td>
						</Tr>
					);
				})}
			</tbody>
		</Table>
	);
}
