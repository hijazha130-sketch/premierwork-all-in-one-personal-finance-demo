import { describe, it, expect } from "vitest";
import { addMinor, subMinor, sumMinor, parseMajorToMinor, minorToMajor, formatMoney } from "@/lib/money";

describe("money utility — integer minor units, no float error", () => {
  it("adds minor units exactly", () => {
    expect(addMinor(10, 20, 30)).toBe(60);
    expect(subMinor(100, 45)).toBe(55);
    expect(sumMinor([1, 2, 3, 4])).toBe(10);
  });

  it("rejects non-integer minor amounts", () => {
    expect(() => addMinor(10.5)).toThrow();
  });

  it("parses major strings to minor units (rounds half up)", () => {
    expect(parseMajorToMinor("1,250")).toBe(125000);
    expect(parseMajorToMinor("1250.50")).toBe(125050);
    expect(parseMajorToMinor("0.005")).toBe(1); // half-up
    expect(parseMajorToMinor("0.004")).toBe(0);
    expect(parseMajorToMinor("")).toBeNull();
    expect(parseMajorToMinor("abc")).toBeNull();
    expect(parseMajorToMinor("-5")).toBeNull();
  });

  it("survives adversarial amounts with no float drift", () => {
    // 0.1 + 0.2 in the classic float trap — done in minor units.
    const a = parseMajorToMinor("0.10")!;
    const b = parseMajorToMinor("0.20")!;
    expect(addMinor(a, b)).toBe(30);
    expect(minorToMajor(addMinor(a, b))).toBe(0.3);

    // Large value summed many times.
    const big = parseMajorToMinor("999999.99")!;
    let total = 0;
    for (let i = 0; i < 1000; i++) total = addMinor(total, big);
    expect(total).toBe(99999999000);
  });

  it("formats with the native symbol, no extra space (Batch 8 §F1)", () => {
    // USD: symbol attaches with no space; cents only when non-zero.
    expect(formatMoney(16300, { code: "USD" })).toBe("$163");
    expect(formatMoney(16316, { code: "USD" })).toBe("$163.16");
    expect(formatMoney(-145000, { code: "USD" })).toBe("-$1,450");
    expect(formatMoney(5000, { code: "USD", signed: true })).toBe("+$50");
    // `whole` drops cents and rounds DOWN (never overstates).
    expect(formatMoney(13985, { code: "USD", whole: true })).toBe("$139");
    // No "$ " (symbol + space) anywhere for the space-less currencies.
    for (const code of ["USD", "GBP", "EUR", "CAD", "AUD"]) {
      expect(formatMoney(16316, { code })).not.toContain("$ ");
      expect(formatMoney(16316, { code })).not.toContain("Rs");
    }
    // PKR keeps its own spacing via the platform formatter.
    expect(formatMoney(2000000, { code: "PKR", locale: "en-PK", whole: true })).toContain("20,000");
  });
});
