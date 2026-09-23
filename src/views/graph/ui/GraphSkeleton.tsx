/**
 * Loading states that copy the real layout, widths included (`docs/ui-patterns.md` §8), so nothing
 * jumps when the data or the WebGL bundle arrives.
 */

const BLOCK = 'bg-surface-sunken animate-pulse rounded-md';

/** Stands in for the canvas while sigma's bundle loads. Same box, same height. */
export function CanvasSkeleton() {
	return (
		<div aria-busy aria-label="Загружаем граф" className="flex h-full items-center justify-center" role="status">
			<div className={`${BLOCK} h-full w-full`} />
			<span className="sr-only">Загружаем граф…</span>
		</div>
	);
}

/** The whole screen: header stats, the canvas card and the side panel. */
export function GraphScreenSkeleton() {
	return (
		<div aria-busy aria-label="Загружаем анализ" className="flex flex-col gap-4" role="status">
			<div className="flex flex-col gap-1">
				<div className={`${BLOCK} h-7 w-48`} />
				<div className={`${BLOCK} h-4 w-96 max-w-full`} />
			</div>
			<div className="border-border bg-surface grid grid-cols-2 gap-3 rounded-lg border px-5 py-3 sm:grid-cols-3 lg:grid-cols-5">
				{['nodes', 'edges', 'seeds', 'kzt', 'period'].map((key) => (
					<div className="flex flex-col gap-1.5" key={key}>
						<div className={`${BLOCK} h-3 w-16`} />
						<div className={`${BLOCK} h-6 w-24`} />
					</div>
				))}
			</div>
			<div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_30rem]">
				<div className="border-border bg-surface flex flex-col gap-3 rounded-lg border p-4">
					<div className={`${BLOCK} h-9 w-full max-w-xl`} />
					<div className={`${BLOCK} h-[36rem] w-full`} />
					<div className={`${BLOCK} h-4 w-2/3`} />
				</div>
				<div className="border-border bg-surface flex flex-col gap-3 rounded-lg border p-4">
					<div className={`${BLOCK} h-9 w-full`} />
					{[1, 2, 3, 4, 5, 6].map((key) => (
						<div className={`${BLOCK} h-10 w-full`} key={key} />
					))}
				</div>
			</div>
			<span className="sr-only">Загружаем анализ…</span>
		</div>
	);
}
