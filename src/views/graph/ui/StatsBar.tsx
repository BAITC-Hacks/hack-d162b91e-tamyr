import { type AnalysisStats } from '@server/graph/model/graph.schema';
import { formatDate, formatInteger, formatKzt, formatKztCompact, formatPeriod } from '../model/format';

/** The size of what is on screen, in the header: the first thing the jury reads. */
export function StatsBar({ stats }: { stats: AnalysisStats }) {
	const items = [
		{ label: 'Узлов', title: undefined, value: formatInteger(stats.nodes) },
		{ label: 'Связей', title: undefined, value: formatInteger(stats.edges) },
		{ label: 'Seed-клиентов', title: undefined, value: formatInteger(stats.seeds) },
		{ label: 'Оборот', title: formatKzt(stats.totalKzt), value: formatKztCompact(stats.totalKzt) },
		{
			label: 'Период',
			title: `${formatDate(stats.periodFrom)} – ${formatDate(stats.periodTo)}`,
			value: formatPeriod(stats.periodFrom, stats.periodTo),
		},
	];

	return (
		<dl className="border-border bg-surface grid grid-cols-2 gap-x-6 gap-y-2 rounded-lg border px-5 py-2 sm:grid-cols-3 lg:grid-cols-5">
			{items.map((item) => (
				<div className="min-w-0" key={item.label}>
					<dt className="text-fg-muted text-xs">{item.label}</dt>
					<dd className="text-fg tabular text-base font-semibold whitespace-nowrap" title={item.title}>
						{item.value}
					</dd>
				</div>
			))}
		</dl>
	);
}
