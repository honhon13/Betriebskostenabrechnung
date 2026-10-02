import { describe, expect, it } from "vitest";

import { centsToInput, parseEuroToCents } from "@/lib/money";

describe("parseEuroToCents", () => {
  it.each([
    ["1.234,56", 123456],
    ["1234,56", 123456],
    ["1234.56", 123456],
    ["1,234.56", 123456],
    ["12,5", 1250],
    ["12.50", 1250],
    ["80", 8000],
    ["€ 80,00", 8000],
    ["1.234", 123400],
    ["1.234.567", 123456700],
    ["0,05", 5],
    ["-50,00", -5000],
    [" 1 234,56 ", 123456],
  ])("liest %s", (input, expected) => {
    expect(parseEuroToCents(input)).toBe(expected);
  });

  it.each(["", "abc", "12,345", "1,2,3", "12..5", "--5", "1e3"])("lehnt %s ab", (input) => {
    expect(parseEuroToCents(input)).toBeNull();
  });
});

describe("centsToInput", () => {
  it("formatiert für Formularfelder", () => {
    expect(centsToInput(123456)).toBe("1234,56");
    expect(centsToInput(5)).toBe("0,05");
    expect(centsToInput(-5000)).toBe("-50,00");
    expect(centsToInput(null)).toBe("");
  });

  it("ist die Umkehrung von parseEuroToCents", () => {
    for (const cents of [1, 99, 100, 123456, -438_91]) {
      expect(parseEuroToCents(centsToInput(cents))).toBe(cents);
    }
  });
});
