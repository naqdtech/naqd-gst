/** Indian-locale money + date helpers. */

export function inr(value: number | undefined | null, decimals = 0): string {
    const n = Number(value);
    const safe = Number.isFinite(n) ? n : 0;
    return `₹${safe.toLocaleString("en-IN", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    })}`;
}

export function round2(n: number): number {
    return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function todayISO(): string {
    return new Date().toISOString().split("T")[0];
}

export function prettyDate(iso?: string): string {
    if (!iso) return "—";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
