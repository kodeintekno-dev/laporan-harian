import { describe, expect, it } from "vitest";
import { addDays, dateWib, isWeekend } from "../_lib/time.js";

describe("dateWib", () => {
  it("pergantian hari pukul 00:00 WIB (17:00 UTC)", () => {
    expect(dateWib(Date.parse("2026-11-11T16:59:59.999Z"))).toBe("2026-11-11");
    expect(dateWib(Date.parse("2026-11-11T17:00:00.000Z"))).toBe("2026-11-12");
  });

  it("pukul 23.59 WIB masih hari yang sama, 00.00 WIB sudah hari berikutnya", () => {
    expect(dateWib(Date.parse("2026-11-12T23:59:00+07:00"))).toBe("2026-11-12");
    expect(dateWib(Date.parse("2026-11-13T00:00:00+07:00"))).toBe("2026-11-13");
  });

  it("melewati pergantian bulan dan tahun", () => {
    expect(dateWib(Date.parse("2026-11-30T17:00:00Z"))).toBe("2026-12-01");
    expect(dateWib(Date.parse("2026-12-31T16:59:59Z"))).toBe("2026-12-31");
    expect(dateWib(Date.parse("2026-12-31T17:00:00Z"))).toBe("2027-01-01");
  });

  it("menerima Date maupun epoch ms", () => {
    const at = Date.parse("2026-11-12T03:00:00Z");
    expect(dateWib(new Date(at))).toBe(dateWib(at));
  });
});

describe("addDays", () => {
  it("menggeser maju dan mundur", () => {
    expect(addDays("2026-11-12", 1)).toBe("2026-11-13");
    expect(addDays("2026-11-12", -1)).toBe("2026-11-11");
    expect(addDays("2026-11-12", 0)).toBe("2026-11-12");
  });

  it("melewati bulan dan tahun", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
  });

  it("tahun kabisat", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2028-02-29", 1)).toBe("2028-03-01");
    expect(addDays("2027-02-28", 1)).toBe("2027-03-01");
  });

  it("jendela Tidak Hadir: -31 dan +100 hari dari 2026-11-12", () => {
    expect(addDays("2026-11-12", -31)).toBe("2026-10-12");
    expect(addDays("2026-11-12", 100)).toBe("2027-02-20");
  });

  it("tanggal yang tidak ada tidak lolos sebagai tanggal sama (dasar validasi dateSchema)", () => {
    expect(addDays("2026-02-30", 0)).not.toBe("2026-02-30");
  });
});

describe("isWeekend", () => {
  it("Sabtu dan Minggu saja", () => {
    expect(isWeekend("2026-11-06")).toBe(false); // Jumat
    expect(isWeekend("2026-11-07")).toBe(true); // Sabtu
    expect(isWeekend("2026-11-08")).toBe(true); // Minggu
    expect(isWeekend("2026-11-09")).toBe(false); // Senin
  });
});
