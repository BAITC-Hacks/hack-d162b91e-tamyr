'use client';

import { type Analysis } from '@server/graph/model/graph.schema';
import { Button } from '@shared/ui/Button';
import { Callout } from '@shared/ui/Callout';
import { Card } from '@shared/ui/Card';
import { Input } from '@shared/ui/Input';
import { SegmentedControl } from '@shared/ui/SegmentedControl';
import dynamic from 'next/dynamic';
import { Tabs } from 'radix-ui';
import { type FormEvent, useCallback, useMemo, useState } from 'react';
import { type ColorMode, type Focus } from '../model/focus';
import { formatInteger } from '../model/format';
import { buildIndex, counterparties, type GidLookup, lookupGid } from '../model/graphIndex';
import { CanvasErrorBoundary } from './CanvasErrorBoundary';
import { CanvasSkeleton } from './GraphSkeleton';
import { Legend } from './Legend';
import { NodeCard } from './NodeCard';
import { ClusterList, TopList } from './RankTables';
import { StatsBar } from './StatsBar';

/**
 * The analyst's one screen: the network, and beside it whom to check first and why.
 *
 * Every path to a node — a click on the canvas, a gid typed into the search, a row of the top
 * list, a counterparty on a card — goes through `selectNode`, so each of them flies the camera,
 * highlights the neighbours and opens the same card.
 *
 * The canvas is WebGL and loads in the browser only (`ssr: false`); everything else renders on the
 * server, so the lists are readable before the graph has drawn and even if it never does.
 */

const GraphCanvas = dynamic(() => import('./GraphCanvas').then((mod) => mod.GraphCanvas), {
	loading: () => <CanvasSkeleton />,
	ssr: false,
});

export interface GraphScreenProps {
	analysis: Analysis | null;
}

type PanelTab = 'clusters' | 'node' | 'top';

const COLOR_MODES = [
	{ label: 'По ролям', value: 'role' },
	{ label: 'По кластерам', value: 'cluster' },
] as const;

const TAB_TRIGGER =
	'text-fg-muted hover:text-fg data-[state=active]:border-accent data-[state=active]:text-fg -mb-px border-b-2 ' +
	'border-transparent px-3 py-2 text-sm font-medium transition-colors';

function searchMessage(result: GidLookup, total: number): string | null {
	if (result.kind === 'invalid') return 'gid состоит только из цифр — проверьте, что скопировано целиком.';
	if (result.kind === 'missing') return `Узел ${result.query} не найден среди ${formatInteger(total)} узлов графа.`;

	return null;
}

function EmptyState() {
	return (
		<Card description="Граф денег" title="Нет данных анализа">
			<p className="text-fg-muted text-sm">
				Данные анализа не найдены. Выполните{' '}
				<code className="bg-surface-sunken rounded-sm px-1">pnpm pipeline</code>.
			</p>
		</Card>
	);
}

function Screen({ analysis }: { analysis: Analysis }) {
	const index = useMemo(() => buildIndex(analysis), [analysis]);
	const [colorMode, setColorMode] = useState<ColorMode>('role');
	const [focus, setFocus] = useState<Focus | null>(null);
	const [highlightCluster, setHighlightCluster] = useState<number | null>(null);
	const [tab, setTab] = useState<PanelTab>('top');
	const [draft, setDraft] = useState('');
	const [message, setMessage] = useState<string | null>(null);

	const selectNode = useCallback((gid: string) => {
		setFocus((previous) => ({ gid, seq: (previous?.seq ?? 0) + 1 }));
		setHighlightCluster(null);
		setMessage(null);
		setDraft(gid);
		setTab('node');
	}, []);

	const selectCluster = (clusterId: number) => {
		setColorMode('cluster');
		setFocus(null);
		setHighlightCluster((previous) => (previous === clusterId ? null : clusterId));
	};

	const clear = () => {
		setFocus(null);
		setHighlightCluster(null);
		setMessage(null);
	};

	const submit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();

		const result = lookupGid(index, draft);

		if (result.kind === 'found') selectNode(result.gid);
		else setMessage(searchMessage(result, analysis.nodes.length));
	};

	const focusedNode = focus === null ? undefined : index.nodes.get(focus.gid);
	const card = focusedNode === undefined ? null : counterparties(index, focusedNode.gid);

	return (
		<div className="flex flex-col gap-4">
			<div>
				<h1 className="text-xl font-semibold">Граф денег</h1>
				<p className="text-fg-muted text-sm">
					Кого из {formatInteger(analysis.stats.nodes)} участников проверять первым и почему. Роли и кластеры —
					гипотезы для проверки, а не выводы о виновности.
				</p>
			</div>

			<StatsBar stats={analysis.stats} />

			<div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_30rem]">
				<Card
					action={
						<SegmentedControl
							name="graph-color-mode"
							onChange={(value) => setColorMode(value === 'cluster' ? 'cluster' : 'role')}
							options={COLOR_MODES}
							value={colorMode}
						/>
					}
					description="Стрелка — направление перевода. Размер узла — приоритет проверки."
					title="Сеть переводов"
				>
					<div className="flex flex-col gap-2">
						<form className="flex flex-wrap items-center gap-2" onSubmit={submit} role="search">
							<Input
								aria-label="gid узла"
								className="w-full max-w-xs"
								inputMode="numeric"
								maxLength={40}
								onChange={(event) => setDraft(event.target.value)}
								placeholder="gid, например 770410000000010822"
								value={draft}
							/>
							<Button type="submit">Найти</Button>
							{(focus !== null || highlightCluster !== null) && (
								<Button onClick={clear} variant="ghost">
									Сбросить выделение
								</Button>
							)}
						</form>
						{message !== null && <Callout tone="warning">{message}</Callout>}
					</div>

					<div className="border-border bg-canvas relative h-[36rem] overflow-hidden rounded-md border">
						<CanvasErrorBoundary>
							<GraphCanvas
								analysis={analysis}
								colorMode={colorMode}
								focus={focus}
								highlightCluster={highlightCluster}
								onSelectNode={selectNode}
							/>
						</CanvasErrorBoundary>
					</div>

					<Legend clusters={analysis.clusters} colorMode={colorMode} nodes={analysis.nodes} />
				</Card>

				<Tabs.Root
					className="border-border bg-surface flex min-w-0 flex-col rounded-lg border"
					onValueChange={(value) => setTab(value as PanelTab)}
					value={tab}
				>
					<Tabs.List aria-label="Панель анализа" className="border-border flex gap-1 border-b px-3">
						<Tabs.Trigger className={TAB_TRIGGER} value="node">
							Узел
						</Tabs.Trigger>
						<Tabs.Trigger className={TAB_TRIGGER} value="top">
							Топ-лист
						</Tabs.Trigger>
						<Tabs.Trigger className={TAB_TRIGGER} value="clusters">
							Кластеры
						</Tabs.Trigger>
					</Tabs.List>

					<Tabs.Content className="max-h-[48rem] overflow-y-auto p-3" value="node">
						{focusedNode !== undefined && card !== null ? (
							<NodeCard node={focusedNode} onSelect={selectNode} topIn={card.topIn} topOut={card.topOut} />
						) : (
							<p className="text-fg-muted text-sm">
								Выберите узел на графе, в топ-листе или найдите его по gid — здесь появятся роль, доказательства
								и крупнейшие контрагенты.
							</p>
						)}
					</Tabs.Content>
					<Tabs.Content className="max-h-[48rem] overflow-y-auto p-3" value="top">
						<TopList onSelect={selectNode} rows={analysis.top} />
					</Tabs.Content>
					<Tabs.Content className="max-h-[48rem] overflow-y-auto p-3" value="clusters">
						<ClusterList highlighted={highlightCluster} onSelect={selectCluster} rows={analysis.clusters} />
					</Tabs.Content>
				</Tabs.Root>
			</div>
		</div>
	);
}

export function GraphScreen({ analysis }: GraphScreenProps) {
	if (analysis === null || analysis.nodes.length === 0) return <EmptyState />;

	return <Screen analysis={analysis} />;
}
