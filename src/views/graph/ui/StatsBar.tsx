import {
	ArrowsRightLeftIcon,
	BanknotesIcon,
	ExclamationTriangleIcon,
	FlagIcon,
	RectangleGroupIcon,
	ShareIcon,
} from '@heroicons/react/24/outline';
import { type AnalysisStats } from '@server/graph/model/graph.schema';
import { type ComponentType, type SVGProps } from 'react';
import {
	formatDate,
	formatInteger,
	formatKzt,
	formatKztCompact,
	formatPeriod,
	formatScore,
	HIGH_PRIORITY_CUT,
} from '../model/format';

/**
 * The size of what is on screen, as a row of KPI cards: the first thing the jury reads.
 *
 * Every figure is a count or a sum from the analysis itself. There are no period-over-period deltas,
 * because the case has one month and a delta would be invented.
 */
export interface StatsBarProps {
	clusters: number;
	highPriority: number;
	stats: AnalysisStats;
}

interface Kpi {
	caption: string;
	chip: string;
	Icon: ComponentType<SVGProps<SVGSVGElement>>;
	label: string;
	title?: string;
	value: string;
}

export function StatsBar({ clusters, highPriority, stats }: StatsBarProps) {
	const period = formatPeriod(stats.periodFrom, stats.periodTo);
	const items: Kpi[] = [
		{
			caption: `${formatInteger(stats.edges)} связей`,
			chip: 'bg-identity-1-bg text-identity-1',
			Icon: ShareIcon,
			label: 'Узлов',
			value: formatInteger(stats.nodes),
		},
		{
			caption: period,
			chip: 'bg-identity-3-bg text-identity-3',
			Icon: ArrowsRightLeftIcon,
			label: 'Операций',
			value: formatInteger(stats.transactions),
		},
		{
			caption: period,
			chip: 'bg-identity-2-bg text-identity-2',
			Icon: BanknotesIcon,
			label: 'Оборот',
			title: formatKzt(stats.totalKzt),
			value: formatKztCompact(stats.totalKzt),
		},
		{
			caption: 'гипотезы',
			chip: 'bg-identity-4-bg text-identity-4',
			Icon: RectangleGroupIcon,
			label: 'Кластеров',
			value: formatInteger(clusters),
		},
		{
			caption: `приоритет ≥ ${formatScore(HIGH_PRIORITY_CUT)}`,
			chip: 'bg-danger-bg text-danger',
			Icon: ExclamationTriangleIcon,
			label: 'Приоритетных',
			title: `Высокий приоритет: узлы с приоритетом проверки не ниже ${formatScore(HIGH_PRIORITY_CUT)} из 1. Приоритет — очерёдность проверки, а не вывод о виновности.`,
			value: formatInteger(highPriority),
		},
		{
			caption: 'истоки обхода',
			chip: 'bg-accent-subtle text-accent-fg',
			Icon: FlagIcon,
			label: 'Seed',
			title: `Период выгрузки: ${formatDate(stats.periodFrom)} – ${formatDate(stats.periodTo)}`,
			value: formatInteger(stats.seeds),
		},
	];

	return (
		<dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
			{items.map((item) => (
				<div
					className="border-border bg-surface flex min-w-0 items-center gap-2.5 rounded-lg border px-3 py-2.5 2xl:gap-3 2xl:px-3.5"
					key={item.label}
					title={item.title}
				>
					<span
						aria-hidden
						className={`flex size-8 shrink-0 items-center justify-center rounded-md 2xl:size-9 ${item.chip}`}
					>
						<item.Icon className="size-5" />
					</span>
					<div className="min-w-0">
						<dt className="text-fg-muted truncate text-xs">{item.label}</dt>
						<dd className="text-fg tabular text-base leading-tight font-semibold whitespace-nowrap">
							{item.value}
						</dd>
						<dd className="text-fg-subtle truncate text-[11px] leading-tight">{item.caption}</dd>
					</div>
				</div>
			))}
		</dl>
	);
}
