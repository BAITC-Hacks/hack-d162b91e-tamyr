import { ChatBubbleLeftRightIcon, SwatchIcon } from '@heroicons/react/24/outline';
import { ChatScreen } from '@pages/chat';
import { GraphScreen, SAMPLE_ANALYSIS } from '@pages/graph';
import { AppShell, type NavigationSection } from '@widgets/appShell';

/**
 * «Граф денег»: the network with the priority list beside it, and the assistant under it.
 *
 * Sections are passed in rather than read from anywhere, because a widget may not import from
 * `src/server/`. Whoever renders the shell decides what this visitor sees.
 *
 * The chat stays on this page, under the graph, until Chunk 3 docks it beside the graph as
 * `widgets/assistant` (`docs/plan.md`).
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
			<div className="flex flex-col gap-8">
				<GraphScreen analysis={analysis} />
				<ChatScreen
					emptyHint="Например: «Кого проверять первым и почему?»"
					placeholder="Спросите ассистента…"
					subtitle="Ассистент сам выбирает инструменты анализа графа и показывает каждый вызов."
					title="Ассистент"
				/>
			</div>
		</AppShell>
	);
}
