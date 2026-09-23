'use client';

import { SigmaContainer, useRegisterEvents, useSetSettings, useSigma } from '@react-sigma/core';
import { type Analysis } from '@server/graph/model/graph.schema';
import { useEffect, useMemo, useRef } from 'react';
import { type Settings } from 'sigma/settings';
import { buildGraph, type GraphEdgeAttributes, type GraphNodeAttributes } from '../model/buildGraph';
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
	// Two thousand labels are noise. Only large nodes, or the focused one and its neighbours, are
	// labelled; zooming in brings the rest.
	labelDensity: 0.5,
	labelFont: 'Inter, ui-sans-serif, system-ui, sans-serif',
	labelRenderedSizeThreshold: 9,
	labelSize: 12,
	renderEdgeLabels: false,
	zIndex: true,
};

const CONTAINER_STYLE = { background: 'transparent', height: '100%', width: '100%' } as const;

/** How close the camera comes to a focused node. Sigma's ratio: smaller is closer. */
const FOCUS_RATIO = 0.35;

function nodeColor(palette: GraphPalette, input: { attributes: GraphNodeAttributes; mode: ColorMode }): string {
	const { attributes, mode } = input;

	return mode === 'role'
		? palette.roles[attributes.role]
		: (palette.clusters[clusterSlot(attributes.clusterId) - 1] ?? palette.dim);
}

function Controller({ colorMode, focus, highlightCluster, onSelectNode }: Omit<GraphCanvasProps, 'analysis'>) {
	const sigma = useSigma<GraphNodeAttributes, GraphEdgeAttributes>();
	const setSettings = useSetSettings<GraphNodeAttributes, GraphEdgeAttributes>();
	const registerEvents = useRegisterEvents<GraphNodeAttributes, GraphEdgeAttributes>();
	const palette = usePalette();
	// The latest handler, read at click time, so re-rendering the screen never re-registers events.
	const onSelect = useRef(onSelectNode);
	const focusedGid = focus?.gid ?? null;

	useEffect(() => {
		onSelect.current = onSelectNode;
	}, [onSelectNode]);

	useEffect(() => {
		const container = sigma.getContainer();

		registerEvents({
			clickNode: (event) => onSelect.current(event.node),
			enterNode: () => {
				container.style.cursor = 'pointer';
			},
			leaveNode: () => {
				container.style.cursor = '';
			},
		});
	}, [registerEvents, sigma]);

	useEffect(() => {
		const graph = sigma.getGraph();
		const focused = focusedGid !== null && graph.hasNode(focusedGid) ? focusedGid : null;
		const neighbours = new Set(focused === null ? [] : graph.neighbors(focused));
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

				if (focused !== null) {
					// Larger rather than `highlighted`: sigma's highlight draws a white label box that is
					// unreadable under the dark theme's light label colour.
					if (node === focused) return { ...data, color, forceLabel: true, size: data.size * 1.4, zIndex: 2 };
					if (neighbours.has(node)) return { ...data, color, forceLabel: true, zIndex: 1 };

					return { ...data, color: palette.dim, label: null, zIndex: 0 };
				}

				if (highlightCluster !== null) {
					return data.clusterId === highlightCluster
						? { ...data, color, zIndex: 1 }
						: { ...data, color: palette.dim, label: null, zIndex: 0 };
				}

				return { ...data, color };
			},
		});
	}, [colorMode, focusedGid, highlightCluster, palette, setSettings, sigma]);

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
