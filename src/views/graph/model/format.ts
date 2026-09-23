/**
 * Number formatting for the screen, written out rather than delegated to `Intl`.
 *
 * The screen renders on the server and again in the browser, and `Intl` output depends on the
 * ICU build: one side printing a narrow no-break space where the other prints a no-break space is
 * a hydration mismatch over a character nobody can see. Doing it by hand makes both sides agree.
 */

const NBSP = ' ';

/** 1234567.8 → «1 234 568», grouped with no-break spaces the way ru-RU writes it. */
export function formatInteger(value: number): string {
	const rounded = Math.round(value);
	const sign = rounded < 0 ? '−' : '';

	return sign + String(Math.abs(rounded)).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}

export function formatKzt(value: number): string {
	return `${formatInteger(value)}${NBSP}₸`;
}

const COMPACT_STEPS = [
	{ divisor: 1e9, unit: 'млрд' },
	{ divisor: 1e6, unit: 'млн' },
	{ divisor: 1e3, unit: 'тыс.' },
] as const;

/** 1 234 567 890 → «1,2 млрд ₸». For the header, where the exact figure is in the tooltip. */
export function formatKztCompact(value: number): string {
	const step = COMPACT_STEPS.find(({ divisor }) => Math.abs(value) >= divisor);

	if (step === undefined) return formatKzt(value);

	return `${(value / step.divisor).toFixed(1).replace('.', ',')}${NBSP}${step.unit}${NBSP}₸`;
}

/** A 0–1 score with two decimals and a decimal comma. */
export function formatScore(value: number): string {
	return value.toFixed(2).replace('.', ',');
}

export function formatShare(value: number): string {
	return `${Math.round(value * 100)}%`;
}

/** 'YYYY-MM-DD' → «DD.MM.YYYY», by the string: a Date would move it a day west of Greenwich. */
export function formatDate(iso: string): string {
	const [year, month, day] = iso.split('-');

	return `${day}.${month}.${year}`;
}

/** Two ISO dates → «01.07–31.07.2026» within one year, the full pair otherwise. Fits a stats cell. */
export function formatPeriod(from: string, to: string): string {
	if (from.slice(0, 4) !== to.slice(0, 4)) return `${formatDate(from)} – ${formatDate(to)}`;

	return `${formatDate(from).slice(0, 5)}–${formatDate(to)}`;
}
