/**
 * Client-side downloads for GST data — JSON, CSV, and (lazily-loaded) Excel.
 * SheetJS is imported on demand so it never bloats the initial bundle.
 */

function saveBlob(filename: string, blob: Blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadJson(filename: string, obj: unknown) {
    saveBlob(filename, new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" }));
}

function toCsv(rows: Record<string, any>[]): string {
    if (!rows.length) return "";
    const set = new Set<string>();
    for (const r of rows) for (const k of Object.keys(r)) set.add(k);
    const cols = Array.from(set);
    const esc = (v: any) => {
        const s = v == null ? "" : String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}

export function downloadCsv(filename: string, rows: Record<string, any>[]) {
    saveBlob(filename, new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" }));
}

/** Lazily loads SheetJS and writes a multi-sheet .xlsx workbook. */
export async function downloadWorkbook(filename: string, sheets: { name: string; rows: Record<string, any>[] }[]) {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    for (const s of sheets) {
        const ws = XLSX.utils.json_to_sheet(s.rows.length ? s.rows : [{ note: "no data" }]);
        XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31)); // Excel sheet names ≤ 31 chars
    }
    XLSX.writeFile(wb, filename);
}
