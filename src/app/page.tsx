import { ChatBubbleLeftRightIcon, SwatchIcon } from '@heroicons/react/24/outline';
import { GraphScreen, SAMPLE_ANALYSIS } from '@pages/graph';
import { AppShell, type NavigationSection } from '@widgets/appShell';

/**
 * «Граф денег»: the network, and beside it the card, the priority list, the clusters and the
 * assistant — one screen, so a gid the assistant cites can be shown on the graph with one click.
 *
 * Sections are passed in rather than read from anywhere, because a widget may not import from
 * `src/server/`. Whoever renders the shell decides what this visitor sees.
 */
const SECTIONS: readonly NavigationSection[] = [
	{ href: '/', Icon: ChatBubbleLeftRightIcon, label: 'Граф и ассистент' },
	{ href: '/design', Icon: SwatchIcon, label: 'Дизайн-система' },
];

export default function HomePage() {
	// TODO(16:00): replace with getAnalysis(createCtx()) from src/server/graph/usecase/getAnalysis.ts
	const analysis = SAMPLE_ANALYSIS;

	return (
		<AppShell sections={SECTIONS} title="Граф денег">
			<GraphScreen analysis={analysis} />
		</AppShell>
	);
}
