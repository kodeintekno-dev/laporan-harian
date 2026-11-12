/**
 * Satu sel CSV. Sel yang diawali = + - @ (atau tab/CR) diberi awalan apostrof supaya Excel dan
 * Sheets tidak menjalankannya sebagai rumus (CSV injection). Sel dengan koma, kutip, atau baris baru dikutip.
 */
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function csvLine(cells: string[]): string {
  return cells.map(csvCell).join(",");
}

/** WIB tidak memakai waktu musim panas, jadi selalu UTC+7. Format 'YYYY-MM-DD HH:mm:ss'. */
export function formatWib(epochMs: number): string {
  return new Date(epochMs + 7 * 3600_000).toISOString().replace("T", " ").slice(0, 19);
}
