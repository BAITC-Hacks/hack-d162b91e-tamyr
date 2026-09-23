import { type Counterparty, type NodeRow } from '@server/graph/model/graph.schema';
import { Badge } from '@shared/ui/Badge';
import { Button } from '@shared/ui/Button';
import { type ReactNode } from 'react';
import { formatInteger, formatKzt, formatScore, formatShare } from '../model/format';
import { flagMeta } from '../model/roles';
import { GidButton, RoleTag } from './RoleTag';

/**
 * Everything needed to defend one node's role in a minute: the verdict, the evidence in words, the
 * metrics the rule looked at, and the five biggest counterparties each way.
 *
 * The evaluation is "the jury names a gid and the team explains its role from its own metrics", so
 * the evidence sits at the top and the numbers it cites sit right under it.
 */
export interface NodeCardProps {
	node: NodeRow;
	/** Puts a question about this node into the assistant's draft. */
	onAsk?: (gid: string) => void;
	onSelect: (gid: string) => void;
	topIn: readonly Counterparty[];
	topOut: readonly Counterparty[];
}

function Metric({ label, value }: { label: string; value: ReactNode }) {
	return (
		<div className="flex items-baseline justify-between gap-3 py-1">
			<dt className="text-fg-muted text-xs">{label}</dt>
			<dd className="text-fg tabular text-sm">{value}</dd>
		</div>
	);
}

function CounterpartyList(props: {
	empty: string;
	onSelect: (gid: string) => void;
	rows: readonly Counterparty[];
	title: string;
}) {
	const { empty, onSelect, rows, title } = props;

	return (
		<section aria-label={title} className="flex flex-col gap-1.5">
			<h3 className="text-fg-muted text-xs font-medium">{title}</h3>
			{rows.length === 0 ? (
				<p className="text-fg-subtle text-xs">{empty}</p>
			) : (
				<ul className="flex flex-col">
					{rows.map((row) => (
						<li className="border-border flex items-center gap-2 border-b py-1.5 last:border-0" key={row.gid}>
							<GidButton gid={row.gid} onSelect={onSelect} />
							<RoleTag className="text-fg-muted text-xs" role={row.role} />
							<span className="text-fg tabular ml-auto text-xs whitespace-nowrap">
								{formatKzt(row.sumKzt)} · {row.nTx} тр.
							</span>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}

export function NodeCard({ node, onAsk, onSelect, topIn, topOut }: NodeCardProps) {
	return (
		<article aria-label={`Узел ${node.gid}`} className="flex flex-col gap-4">
			<header className="flex flex-col gap-2">
				<p className="text-fg tabular font-mono text-sm font-medium break-all">{node.gid}</p>
				<div className="flex flex-wrap items-center gap-2">
					<RoleTag className="text-fg text-md font-semibold" role={node.role} />
					<span className="text-fg-muted text-xs">уверенность {formatScore(node.roleScore)}</span>
				</div>
				{node.flags.length > 0 && (
					<ul aria-label="Флаги" className="flex flex-wrap gap-1.5">
						{node.flags.map((flag) => {
							const meta = flagMeta(flag);

							return (
								<li key={flag}>
									<Badge tone={meta.tone}>{meta.label}</Badge>
								</li>
							);
						})}
					</ul>
				)}
			</header>

			<p className="bg-surface-sunken text-fg rounded-md px-3 py-2.5 text-sm">{node.evidence}</p>

			{onAsk !== undefined && (
				<Button className="self-start" onClick={() => onAsk(node.gid)} variant="secondary">
					Спросить ассистента
				</Button>
			)}

			<dl className="divide-border grid grid-cols-1 gap-x-6 sm:grid-cols-2">
				<Metric label="Приоритет" value={formatScore(node.priorityScore)} />
				<Metric label="Кластер" value={node.clusterId} />
				<Metric label="Входящих связей" value={formatInteger(node.inDeg)} />
				<Metric label="Исходящих связей" value={formatInteger(node.outDeg)} />
				<Metric label="Получено" value={formatKzt(node.inKzt)} />
				<Metric label="Отправлено" value={formatKzt(node.outKzt)} />
				<Metric label="Пропуск (out/in)" value={node.passThrough === null ? '—' : formatShare(node.passThrough)} />
				<Metric label="Колено обхода" value={node.depth} />
				<Metric label="Seed выше по потоку" value={formatInteger(node.seedsUpstream)} />
				<Metric label="Seed" value={node.isSeed ? 'да' : 'нет'} />
			</dl>

			<CounterpartyList
				empty="Входящих переводов нет в выгрузке."
				onSelect={onSelect}
				rows={topIn}
				title="Крупнейшие отправители"
			/>
			<CounterpartyList
				empty={
					node.truncated ? 'Обход остановлен на 4-м колене: исходящие неизвестны.' : 'Исходящих переводов нет.'
				}
				onSelect={onSelect}
				rows={topOut}
				title="Крупнейшие получатели"
			/>
		</article>
	);
}
