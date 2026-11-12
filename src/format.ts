const TZ = "Asia/Jakarta";

const dateFmt = new Intl.DateTimeFormat("id-ID", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const timeFmt = new Intl.DateTimeFormat("id-ID", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: TZ,
});

/** 'YYYY-MM-DD' (tanggal kalender WIB) menjadi teks, mis. "Kamis, 12 November 2026". */
export function formatDate(date: string): string {
  return dateFmt.format(new Date(`${date}T00:00:00Z`));
}

/** Epoch ms menjadi jam WIB, mis. "15.42". */
export function formatTime(epochMs: number): string {
  return timeFmt.format(epochMs);
}
