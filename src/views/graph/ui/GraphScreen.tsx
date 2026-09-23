'use client';

import { CursorArrowRaysIcon, InformationCircleIcon } from '@heroicons/react/24/outline';
import { type Analysis, type Role } from '@server/graph/model/graph.schema';
import { Button } from '@shared/ui/Button';
import { Callout } from '@shared/ui/Callout';
import { Card } from '@shared/ui/Card';
import { Input } from '@shared/ui/Input';
import { SegmentedControl } from '@shared/ui/SegmentedControl';
import { Assistant, type AssistantPrefill } from '@widgets/assistant';
import clsx from 'clsx';
import dynamic from 'next/dynamic';
import { Tabs } from 'radix-ui';
import { type FormEvent, type ReactNode, useCallback, useId, useMemo, useState } from 'react';
import { type ColorMode, type Focus } from '../model/focus';
import { formatInteger, HIGH_PRIORITY_CUT } from '../model/format';
import { buildIndex, counterparties, type GidLookup, lookupGid } from '../model/graphIndex';
import { countRoles } from '../model/roles';
import { CanvasErrorBoundary } from './CanvasErrorBoundary';
import { CanvasSkeleton } from './GraphSkeleton';
import { Legend } from './Legend';
import { NodeCard } from './NodeCard';
import { ClusterList, TopList } from './RankTables';
import { RoleDonut } from './RoleDonut';
import { RoleFilter } from './RoleFilter';
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

type PanelTab = 'assistant' | 'clusters' | 'node';

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

const TAB_CONTENT = 'max-h-[40rem] min-h-0 overflow-x-hidden overflow-y-auto p-3 xl:max-h-none xl:flex-1';

const TOP_HINT = 'Упорядочено по приоритету проверки (0–1). Наведите на строку, чтобы увидеть, из чего сложился балл.';

/** A titled column panel. Not `Card`: these need a tighter padding and to flex inside a fixed height. */
function Panel(props: {
	action?: ReactNode;
	children: ReactNode;
	className?: string;
	title: string;
	titleHint?: string;
}) {
	const { action, children, className, title, titleHint } = props;
	const titleId = useId();

	return (
		<section
			aria-labelledby={titleId}
			className={clsx('border-border bg-surface flex flex-col gap-2.5 rounded-lg border p-3.5', className)}
		>
			<div className="flex min-h-8 shrink-0 items-center justify-between gap-3">
				<h2 className="text-fg inline-flex items-center gap-1.5 text-sm font-semibold" id={titleId}>
					{title}
					{titleHint !== undefined && (
						<span className="inline-flex" title={titleHint}>
							<InformationCircleIcon aria-hidden className="text-fg-subtle size-4" />
							<span className="sr-only">{titleHint}</span>
						</span>
					)}
				</h2>
				{action}
			</div>
			{children}
		</section>
	);
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
	const [tab, setTab] = useState<PanelTab>('node');
	const [topExpanded, setTopExpanded] = useState(false);
	const [hiddenRoles, setHiddenRoles] = useState<ReadonlySet<Role>>(() => new Set());
	const roleCounts = useMemo(() => countRoles(analysis.nodes), [analysis]);
	const highPriority = useMemo(
		() => analysis.nodes.filter((node) => node.priorityScore >= HIGH_PRIORITY_CUT).length,
		[analysis],
	);

	const toggleRole = useCallback((role: Role) => {
		setHiddenRoles((previous) => {
			const next = new Set(previous);

			if (next.has(role)) next.delete(role);
			else next.add(role);

			return next;
		});
	}, []);
	const [draft, setDraft] = useState('');
	const [message, setMessage] = useState<string | null>(null);
	const [prefill, setPrefill] = useState<AssistantPrefill | undefined>(undefined);

	/** Flies the camera and highlights the neighbours; does not change the open tab. */
	const focusNode = useCallback((gid: string) => {
		setFocus((previous) => ({ gid, seq: (previous?.seq ?? 0) + 1 }));
		setHighlightCluster(null);
		setMessage(null);
		setDraft(gid);
	}, []);

	const selectNode = useCallback(
		(gid: string) => {
			focusNode(gid);
			setTab('node');
		},
		[focusNode],
	);

	// A gid the assistant cites is focused on the graph while the conversation stays open: switching
	// to the card would hide the answer the analyst is still reading.
	const focusFromAssistant = useCallback(
		(gid: string) => {
			if (index.nodes.has(gid)) focusNode(gid);
		},
		[focusNode, index],
	);

	const askAbout = useCallback((gid: string) => {
		setPrefill((previous) => ({
			nonce: (previous?.nonce ?? 0) + 1,
			text: `Почему узел ${gid} получил такую роль и что по нему проверить в первую очередь?`,
		}));
		setTab('assistant');
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
		<div className="flex flex-col gap-3">
			<div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
				<h1 className="text-lg font-semibold">Граф денег</h1>
				<p className="text-fg-muted text-xs">
					Кого из {formatInteger(analysis.stats.nodes)} участников проверять первым и почему. Роли и кластеры —
					гипотезы для проверки, а не выводы о виновности.
				</p>
			</div>

			<StatsBar clusters={analysis.clusters.length} highPriority={highPriority} stats={analysis.stats} />

			{/* Three columns from xl: the list to pick from, the network, the card to defend it with. All
			    three share one viewport-derived height so the whole board fits a 1366x768 laptop; each
			    scrolls inside itself. Below xl they stack. */}
			<div className="grid gap-3 xl:h-[calc(100dvh-14.25rem)] xl:min-h-[34rem] xl:grid-cols-[17rem_minmax(0,1fr)_21rem] 2xl:grid-cols-[20rem_minmax(0,1fr)_26rem]">
				<div className="flex min-h-0 flex-col gap-3 max-xl:order-2">
					<Panel className="min-h-0 flex-1" title="Топ приоритетных узлов" titleHint={TOP_HINT}>
						<TopList
							expanded={topExpanded}
							onSelect={selectNode}
							onToggleExpanded={() => setTopExpanded((previous) => !previous)}
							rows={analysis.top}
							selected={focus?.gid ?? null}
						/>
					</Panel>
					<Panel className="shrink-0" title="Распределение ролей">
						<RoleDonut counts={roleCounts} total={analysis.nodes.length} />
					</Panel>
				</div>

				<Panel
					action={
						<SegmentedControl
							name="graph-color-mode"
							onChange={(value) => setColorMode(value === 'cluster' ? 'cluster' : 'role')}
							options={COLOR_MODES}
							value={colorMode}
						/>
					}
					className="min-h-0 max-xl:order-1"
					title="Сеть переводов"
				>
					<form className="flex items-center gap-2" onSubmit={submit} role="search">
						<Input
							aria-label="gid узла"
							className="max-w-xs min-w-0 flex-1"
							inputMode="numeric"
							maxLength={40}
							onChange={(event) => setDraft(event.target.value)}
							placeholder="gid, например 770410000000010822"
							value={draft}
						/>
						<Button type="submit">Найти</Button>
						{(focus !== null || highlightCluster !== null) && (
							<Button onClick={clear} variant="ghost">
								Сбросить
							</Button>
						)}
					</form>
					{message !== null && <Callout tone="warning">{message}</Callout>}

					{colorMode === 'role' ? (
						<RoleFilter counts={roleCounts} hidden={hiddenRoles} onToggle={toggleRole} />
					) : (
						<Legend clusters={analysis.clusters} colorMode={colorMode} nodes={analysis.nodes} />
					)}

					{/* Below xl the column has no fixed height, so the canvas takes its own from the viewport. */}
					<div className="border-border bg-graph-bg relative h-[60dvh] min-h-[22rem] overflow-hidden rounded-md border xl:h-auto xl:min-h-0 xl:flex-1">
						<CanvasErrorBoundary>
							<GraphCanvas
								analysis={analysis}
								colorMode={colorMode}
								focus={focus}
								highlightCluster={highlightCluster}
								onSelectNode={selectNode}
								// TODO(integrate): hiddenRoles={hiddenRoles}
								// TODO(integrate): path={moneyPath}
							/>
						</CanvasErrorBoundary>
					</div>

					<p className="text-fg-subtle text-[11px] leading-tight">
						Стрелка — направление перевода, размер узла — приоритет проверки. Наведите на узел, чтобы увидеть
						полный gid.
					</p>
				</Panel>

				<Tabs.Root
					className="border-border bg-surface flex min-h-0 min-w-0 flex-col rounded-lg border max-xl:order-3"
					onValueChange={(value) => setTab(value as PanelTab)}
					value={tab}
				>
					<Tabs.List aria-label="Панель анализа" className="border-border flex shrink-0 gap-1 border-b px-3">
						<Tabs.Trigger className={TAB_TRIGGER} value="node">
							Узел
						</Tabs.Trigger>
						<Tabs.Trigger className={TAB_TRIGGER} value="clusters">
							Кластеры
						</Tabs.Trigger>
						<Tabs.Trigger className={TAB_TRIGGER} value="assistant">
							Ассистент
						</Tabs.Trigger>
					</Tabs.List>

					<Tabs.Content className={TAB_CONTENT} value="node">
						{focusedNode !== undefined && card !== null ? (
							<NodeCard
								node={focusedNode}
								onAsk={askAbout}
								onSelect={selectNode}
								topIn={card.topIn}
								topOut={card.topOut}
							/>
						) : (
							<div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
								<CursorArrowRaysIcon aria-hidden className="text-fg-subtle size-8" />
								<p className="text-fg text-sm font-medium">Узел не выбран</p>
								<p className="text-fg-muted text-xs">
									Выберите узел на графе, в топ-листе слева или найдите его по gid — здесь появятся роль,
									доказательства и крупнейшие контрагенты.
								</p>
							</div>
						)}
					</Tabs.Content>
					<Tabs.Content className={TAB_CONTENT} value="clusters">
						<ClusterList highlighted={highlightCluster} onSelect={selectCluster} rows={analysis.clusters} />
					</Tabs.Content>
					{/* Force-mounted and hidden when inactive: Radix unmounts inactive tabs, which would throw
					    away the conversation every time the analyst glanced at a card. */}
					<Tabs.Content
						className="h-[40rem] min-h-0 p-3 data-[state=inactive]:hidden xl:h-auto xl:flex-1"
						forceMount
						value="assistant"
					>
						<Assistant compact onGidClick={focusFromAssistant} prefill={prefill} />
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
