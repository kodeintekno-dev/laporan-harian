const TZ = "Asia/Jakarta";

const dateFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Tanggal kalender WIB ('YYYY-MM-DD') untuk sebuah instan waktu. Pergantian hari pukul 00:00 WIB. */
export function dateWib(at: Date | number = Date.now()): string {
  return dateFormat.format(at);
}

/** Geser tanggal 'YYYY-MM-DD' sejumlah hari (bisa negatif). Aman terhadap zona waktu karena memakai UTC. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

/** Sabtu atau Minggu pada tanggal kalender 'YYYY-MM-DD'. Laporan di hari ini menjadikan Staff sebagai Staff Piket. */
export function isWeekend(date: string): boolean {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}
