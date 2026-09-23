import { createEdgeCurveProgram } from '@sigma/edge-curve';
import { createNodeBorderProgram } from '@sigma/node-border';
import { type NodeHoverDrawingFunction } from 'sigma/rendering';
import { type GraphEdgeAttributes, type GraphNodeAttributes } from './buildGraph';

/**
 * The drawing pieces of the neon canvas: the glow program, colour alpha, and the hover label.
 *
 * Glow is a disc drawn as three concentric layers — a faint outer halo, a brighter inner ring, and
 * the node itself — by `@sigma/node-border`. A glowing node is drawn larger by `1 / GLOW_CORE`, so
 * its core keeps the size the priority gave it and the halo is extra.
 */

/** The share of a glowing disc's radius that is the node itself; the rest is halo. */
export const GLOW_CORE = 0.62;

export const GlowNodeProgram = createNodeBorderProgram<GraphNodeAttributes, GraphEdgeAttributes>({
	borders: [
		{ color: { attribute: 'glowOuter', defaultValue: '#00000000' }, size: { mode: 'relative', value: 0.24 } },
		{ color: { attribute: 'glowInner', defaultValue: '#00000000' }, size: { mode: 'relative', value: 0.14 } },
		{ color: { attribute: 'color' }, size: { fill: true } },
	],
});

/** Money flows along a gentle arc; the arrowhead at the receiver says which way. */
export const CurvedArrowProgram = createEdgeCurveProgram<GraphNodeAttributes, GraphEdgeAttributes>({
	arrowHead: { extremity: 'target', lengthToThicknessRatio: 2.5, widenessToThicknessRatio: 2 },
	curvatureAttribute: 'curvature',
	defaultCurvature: 0.22,
});

/** `#rrggbb` with an alpha byte appended; anything else is returned as it came. */
export function withAlpha(color: string, alpha: number): string {
	if (!/^#[\da-f]{6}$/i.test(color)) return color;

	const byte = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
		.toString(16)
		.padStart(2, '0');

	return `${color}${byte}`;
}

/**
 * Sigma's default hover draws a white box, which is unreadable under a light label on the dark
 * canvas. This one draws the label on a dark pill beside the node.
 */
export function createDrawHover(colors: {
	background: string;
	label: string;
}): NodeHoverDrawingFunction<GraphNodeAttributes, GraphEdgeAttributes> {
	// Sigma's hover drawer signature, not ours: it passes three arguments.
	// eslint-disable-next-line @typescript-eslint/max-params
	return (context, data, settings) => {
		if (typeof data.label !== 'string' || data.label === '') return;

		const { labelFont, labelSize: size } = settings;

		context.font = `600 ${size}px ${labelFont}`;

		const { width } = context.measureText(data.label);
		const { y } = data;
		const x = data.x + data.size + 4;
		const padX = 6;
		const height = size + 8;

		context.fillStyle = colors.background;
		context.beginPath();
		context.roundRect(x - padX, y - height / 2, width + padX * 2, height, 4);
		context.fill();
		context.fillStyle = colors.label;
		context.textBaseline = 'middle';
		context.fillText(data.label, x, y);
		context.textBaseline = 'alphabetic';
	};
}
