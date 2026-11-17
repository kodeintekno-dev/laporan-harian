import type { Client } from "@libsql/client";
import { addDays, dateWib } from "./time.js";

export async function reportSchedule(db: Client, staffId: number, now: number) {
  const today = dateWib(now);
  const yesterday = addDays(today, -1);
  const noon = Date.parse(`${today}T12:00:00+07:00`);
  const { rows } = await db.execute({
    sql: `SELECT effective_date, musyrif FROM report_schedule
          WHERE staff_id = ? AND effective_date <= ?
          ORDER BY effective_date DESC LIMIT 2`,
    args: [staffId, today],
  });
  // Sebelum pukul 12.00, periode laporan untuk sif Musyrif kemarin masih berlaku.
  const wasMusyrif = Number(rows.find((row) => String(row.effective_date) <= yesterday)?.musyrif) === 1;
  const date = now < noon && wasMusyrif ? yesterday : today;
  const musyrif = date === yesterday ? wasMusyrif : Number(rows[0]?.musyrif) === 1;
  const openingDate = musyrif ? addDays(date, 1) : date;
  const opensAt = Date.parse(`${openingDate}T${musyrif ? "07:15" : "15:45"}:00+07:00`);
  const closesAt = Date.parse(musyrif ? `${openingDate}T12:00:00+07:00` : `${addDays(date, 1)}T00:00:00+07:00`);
  return {
    date,
    opensAt,
    closesAt,
    isOpen: now >= opensAt && now < closesAt,
    hours: musyrif ? "07.15–11.59 WIB esok hari" : "15.45–23.59 WIB",
  };
}
