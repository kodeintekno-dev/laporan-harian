import { describe, expect, it } from "vitest";
import { addDays, dateWib, isWeekend } from "./time.js";

describe("isWeekend", () => {
  it("Sabtu dan Minggu true, hari kerja false", () => {
    expect(isWeekend("2026-11-14")).toBe(true); // Sabtu
    expect(isWeekend("2026-11-15")).toBe(true); // Minggu
    expect(isWeekend("2026-11-16")).toBe(false); // Senin
    expect(isWeekend("2026-11-13")).toBe(false); // Jumat
  });
});

describe("dateWib", () => {
  it("memakai tanggal WIB, bukan UTC", () => {
    // 2026-11-11 17:30 UTC = 2026-11-12 00:30 WIB
    expect(dateWib(new Date("2026-11-11T17:30:00Z"))).toBe("2026-11-12");
  });

  it("23:59 WIB masih tanggal yang sama", () => {
    // 2026-11-11 16:59 UTC = 2026-11-11 23:59 WIB
    expect(dateWib(new Date("2026-11-11T16:59:00Z"))).toBe("2026-11-11");
  });

  it("tepat 00:00 WIB berganti tanggal", () => {
    expect(dateWib(new Date("2026-11-11T17:00:00Z"))).toBe("2026-11-12");
  });
});

describe("addDays", () => {
  it("melewati batas bulan dan tahun", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("jendela Tidak Hadir -31 dan +100 hari", () => {
    expect(addDays("2026-11-11", -31)).toBe("2026-10-11");
    expect(addDays("2026-11-11", 100)).toBe("2027-02-19");
  });
});
