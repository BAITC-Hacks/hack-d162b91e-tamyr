'use client';

import { SigmaContainer, useRegisterEvents, useSetSettings, useSigma } from '@react-sigma/core';
import { type Analysis } from '@server/graph/model/graph.schema';
import { useEffect, useMemo, useRef, useState } from 'react';
import { type Settings } from 'sigma/settings';
import { buildGraph, type GraphEdgeAttributes, type GraphNodeAttributes, type MoneyGraph } from '../model/buildGraph';
import { type ColorMode, type Focus } from '../model/focus';
import { clusterSlot } from '../model/roles';
import { type GraphPalette, usePalette } from '../model/usePalette';

/**
 * The network, drawn by sigma on WebGL.
 *
 * This module touches `window` and WebGL on import, so it is only ever loaded through
 * `next/dynamic` with `ssr: false` — see `GraphScreen`. A WebGL failure throws out of sigma's
 * constructor inside an effect, which the error boundary around it catches.
 *
 * Settings passed to `SigmaContainer` are compared deeply and a change **recreates sigma**, so they
 * are a constant here. Everything that changes — colours, focus, the highlighted cluster — goes
 * through `useSetSettings` as reducers, which repaint without rebuilding.
 */

export interface GraphCanvasProps {
	analysis: Pick<Analysis, 'edges' | 'nodes'>;
	colorMode: ColorMode;
	focus: Focus | null;
	highlightCluster: number | null;
	onSelectNode: (gid: string) => void;
}

type CanvasSettings = Partial<Settings<GraphNodeAttributes, GraphEdgeAttributes>>;

const SETTINGS: CanvasSettings = {
	defaultEdgeType: 'arrow',
	// Two thousand labels are noise. The overview labels only the top of the priority list — sigma's
	// collision grid keeps one label per cell — and zooming in brings the rest.
	labelDensity: 0.25,
	labelFont: 'Inter, ui-sans-serif, system-ui, sans-serif',
	labelGridCellSize: 160,
	labelRenderedSizeThreshold: 8,
	labelSize: 12,
	renderEdgeLabels: false,
	zIndex: true,
	// Sigma's default grows nodes by √(zoom), so zooming into the dense core only makes the blob
	// bigger. A flatter curve lets zoom separate the nodes instead.
	zoomToSizeRatioFunction: (ratio) => ratio ** 0.2,
};

/** How many of the focused node's counterparties are labelled: the largest by transfer amount. */
const FOCUS_LABELS = 5;
/** A node that is not in focus shrinks to this share of its size, so it recedes rather than blots. */
const DIM_SIZE = 0.4;

const CONTAINER_STYLE = { background: 'transparent', height: '100%', width: '100%' } as const;

/** How close the camera comes to a focused node. Sigma's ratio: smaller is closer. */
const FOCUS_RATIO = 0.35;

function nodeColor(palette: GraphPalette, input: { attributes: GraphNodeAttributes; mode: ColorMode }): string {
	const { attributes, mode } = input;

	return mode === 'role'
		? palette.roles[attributes.role]
		: (palette.clusters[clusterSlot(attributes.clusterId) - 1] ?? palette.dim);
}

/** The focused node's counterparties with the most money through them, in either direction. */
function largestCounterparties(graph: MoneyGraph, focused: string): string[] {
	const amounts = new Map<string, number>();

	for (const { attributes, source, target } of graph.edgeEntries(focused)) {
		const other = source === focused ? target : source;

		amounts.set(other, (amounts.get(other) ?? 0) + attributes.sumKzt);
	}

	return [...amounts.entries()]
		.sort((a, b) => b[1] - a[1])
		.slice(0, FOCUS_LABELS)
		.map(([node]) => node);
}

function Controller({ colorMode, focus, highlightCluster, onSelectNode }: Omit<GraphCanvasProps, 'analysis'>) {
	const sigma = useSigma<GraphNodeAttributes, GraphEdgeAttributes>();
	const setSettings = useSetSettings<GraphNodeAttributes, GraphEdgeAttributes>();
	const registerEvents = useRegisterEvents<GraphNodeAttributes, GraphEdgeAttributes>();
	const palette = usePalette();
	// The latest handler, read at click time, so re-rendering the screen never re-registers events.
	const onSelect = useRef(onSelectNode);
	const [hovered, setHovered] = useState<string | null>(null);
	const focusedGid = focus?.gid ?? null;

	useEffect(() => {
		onSelect.current = onSelectNode;
	}, [onSelectNode]);

	useEffect(() => {
		const container = sigma.getContainer();

		registerEvents({
			clickNode: (event) => onSelect.current(event.node),
			enterNode: (event) => {
				container.style.cursor = 'pointer';
				setHovered(event.node);
			},
			leaveNode: () => {
				container.style.cursor = '';
				setHovered(null);
			},
		});
	}, [registerEvents, sigma]);

	useEffect(() => {
		const graph = sigma.getGraph();
		const focused = focusedGid !== null && graph.hasNode(focusedGid) ? focusedGid : null;
		const neighbours = new Set(focused === null ? [] : graph.neighbors(focused));
		const labelled = new Set(focused === null ? [] : largestCounterparties(graph, focused));
		const inCluster = (node: string) => graph.getNodeAttribute(node, 'clusterId') === highlightCluster;

		setSettings({
			edgeReducer: (edge, data) => {
				if (focused !== null) {
					const touches = graph.source(edge) === focused || graph.target(edge) === focused;

					return touches ? { ...data, color: palette.edgeFocus, zIndex: 1 } : { ...data, hidden: true };
				}

				if (highlightCluster !== null) {
					return inCluster(graph.source(edge)) && inCluster(graph.target(edge))
						? { ...data, color: palette.edgeFocus }
						: { ...data, hidden: true };
				}

				return { ...data, color: palette.edge };
			},
			labelColor: { color: palette.label },
			nodeReducer: (node, data) => {
				const color = nodeColor(palette, { attributes: data, mode: colorMode });
				const dimmed = { ...data, color: palette.dim, label: null, size: data.size * DIM_SIZE, zIndex: 0 };
				// The hovered node shows its whole gid; everywhere else the canvas prints the short one.
				const shown = node === hovered ? { ...data, color, forceLabel: true, label: node, zIndex: 3 } : null;

				if (focused !== null) {
					// Larger rather than `highlighted`: sigma's highlight draws a white label box that is
					// unreadable under the dark theme's light label colour.
					if (node === focused) {
						return {
							...data,
							color,
							forceLabel: true,
							size: Math.min(Math.max(data.size * 1.3, 9), 13),
							zIndex: 2,
							...shown,
						};
					}
					if (neighbours.has(node)) {
						return { ...data, color, forceLabel: labelled.has(node), zIndex: 1, ...shown };
					}

					return dimmed;
				}

				if (highlightCluster !== null) {
					return data.clusterId === highlightCluster ? { ...data, color, zIndex: 1, ...shown } : dimmed;
				}

				return { ...data, color, ...shown };
			},
		});
	}, [colorMode, focusedGid, highlightCluster, hovered, palette, setSettings, sigma]);

	useEffect(() => {
		if (focus === null || !sigma.getGraph().hasNode(focus.gid)) return;

		// The settings effect above has just swapped the reducers, and sigma only schedules the
		// re-processing: until it runs, the display cache holds the node's raw graph coordinates
		// rather than the normalised ones the camera works in, and the camera flies off into empty
		// space. A synchronous refresh first makes the cache current.
		sigma.refresh();

		const target = sigma.getNodeDisplayData(focus.gid);
		const camera = sigma.getCamera();

		if (target !== undefined) {
			void camera.animate(
				{ ratio: Math.min(camera.getState().ratio, FOCUS_RATIO), x: target.x, y: target.y },
				{ duration: 600 },
			);
		}
	}, [focus, sigma]);

	useEffect(() => {
		const camera = sigma.getCamera();

		if (highlightCluster === null) {
			// Nothing in focus any more: show the whole network again.
			if (focusedGid === null) void camera.animatedReset({ duration: 400 });

			return;
		}

		sigma.refresh();

		const points = sigma
			.getGraph()
			.filterNodes((_node, attributes) => attributes.clusterId === highlightCluster)
			.map((node) => sigma.getNodeDisplayData(node))
			.filter((point) => point !== undefined);

		if (points.length === 0) return;

		const x = points.reduce((acc, point) => acc + point.x, 0) / points.length;
		const y = points.reduce((acc, point) => acc + point.y, 0) / points.length;
		const spread = Math.max(...points.map((point) => Math.hypot(point.x - x, point.y - y)));

		// Normalised coordinates span 0–1 at ratio 1, so a cluster of radius r fits at about 2.4r.
		void camera.animate({ ratio: Math.min(1, Math.max(0.15, spread * 2.4)), x, y }, { duration: 600 });
	}, [focusedGid, highlightCluster, sigma]);

	return null;
}

export function GraphCanvas({ analysis, ...props }: GraphCanvasProps) {
	const graph = useMemo(() => buildGraph(analysis), [analysis]);

	return (
		<SigmaContainer<GraphNodeAttributes, GraphEdgeAttributes>
			// react-sigma's own stylesheet is not imported — it hard-codes white grounds on :root — so
			// the one rule that matters from it is here: sigma refuses a container with no height.
			className="[&_.sigma-container]:h-full [&_.sigma-container]:w-full"
			graph={graph}
			settings={SETTINGS}
			style={CONTAINER_STYLE}
		>
			<Controller {...props} />
		</SigmaContainer>
	);
}
