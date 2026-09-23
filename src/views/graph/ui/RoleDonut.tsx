import { type Role } from '@server/graph/model/graph.schema';
import { formatInteger } from '../model/format';
import { ROLE_HINTS, ROLE_ORDER, roleColor } from '../model/roles';
import { RoleTag } from './RoleTag';

/**
 * How the nodes split across roles: a hand-drawn donut and, beside it, every role with its count
 * and share in words — the ring is a picture of the table, never the only place a number lives.
 */
export function RoleDonut({ counts, total }: { counts: ReadonlyMap<Role, number>; total: number }) {
	const radius = 42;
	const circumference = 2 * Math.PI * radius;
	const dashes = ROLE_ORDER.map((role) => (total === 0 ? 0 : ((counts.get(role) ?? 0) / total) * circumference));
	const arcs = ROLE_ORDER.map((role, index) => ({
		dash: dashes[index] ?? 0,
		offset: dashes.slice(0, index).reduce((sum, dash) => sum + dash, 0),
		role,
	}));

	return (
		<div className="flex items-center gap-2">
			<svg aria-hidden className="size-[4.5rem] shrink-0 -rotate-90" viewBox="0 0 100 100">
				<circle className="stroke-surface-sunken" cx="50" cy="50" fill="none" r={radius} strokeWidth="12" />
				{arcs.map((arc) =>
					arc.dash === 0 ? null : (
						<circle
							cx="50"
							cy="50"
							fill="none"
							key={arc.role}
							r={radius}
							stroke={roleColor(arc.role)}
							strokeDasharray={`${Math.max(arc.dash - 0.8, 0.4)} ${circumference}`}
							strokeDashoffset={-arc.offset}
							strokeWidth="12"
						/>
					),
				)}
				<text
					className="fill-fg rotate-90 text-[15px] font-semibold"
					style={{ transformOrigin: '50px 50px' }}
					textAnchor="middle"
					x="50"
					y="50"
				>
					{formatInteger(total)}
				</text>
				<text
					className="fill-fg-muted rotate-90 text-[9px]"
					style={{ transformOrigin: '50px 50px' }}
					textAnchor="middle"
					x="50"
					y="62"
				>
					узлов
				</text>
			</svg>
			<ul
				aria-label="Распределение ролей"
				className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] gap-x-1.5 gap-y-0.5 text-[11px] 2xl:grid-cols-[minmax(0,1fr)_auto_auto]"
			>
				{ROLE_ORDER.map((role) => {
					const count = counts.get(role) ?? 0;

					return (
						<li className="contents" key={role}>
							<span className="min-w-0 overflow-hidden" title={ROLE_HINTS[role]}>
								<RoleTag className="text-fg" role={role} />
							</span>
							<span
								className="text-fg-muted tabular hidden text-right 2xl:block"
								title={`${formatInteger(count)} узлов`}
							>
								{formatInteger(count)}
							</span>
							<span className="text-fg-subtle tabular text-right">
								{total === 0 ? '0%' : `${Math.round((count / total) * 100)}%`}
							</span>
						</li>
					);
				})}
			</ul>
		</div>
	);
}
