import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { contrastRatio, parseHex, readTokens } from "./contrast";

describe("contrast math", () => {
  it("matches WCAG reference values", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBe(21);
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 1);
    expect(parseHex("#abc")).toEqual([170, 187, 204]);
    expect(parseHex("not-a-color")).toBeNull();
  });
});

/**
 * Contrast fixture (Prom Design → CI): ทุกคู่ "ข้อความ × พื้น" ของ token
 * ในทั้งสองธีมต้อง ≥ 4.5:1 (WCAG AA ข้อความปกติ). ถ้าใครแก้ token แล้ว
 * ตกเกณฑ์ เทสนี้ fail ก่อน merge — บั๊ก r20 (faint 2.9:1) จะไม่กลับมาเงียบๆ.
 */
describe("design tokens pass WCAG AA on every surface", () => {
  const css = readFileSync(join(__dirname, "..", "app", "globals.css"), "utf8");
  const TEXT = ["--color-text", "--color-text-muted", "--color-text-faint"];
  const SURFACES = ["--color-surface", "--color-surface-2", "--color-surface-3"];

  for (const [theme, selector] of [["light", ":root"], ["dark", "html.dark"]] as const) {
    it(`${theme} theme`, () => {
      const tokens = readTokens(css, selector);
      for (const t of TEXT) expect(tokens.get(t), `${t} missing in ${selector}`).toBeTruthy();
      for (const s of SURFACES) expect(tokens.get(s), `${s} missing in ${selector}`).toBeTruthy();
      const failures: string[] = [];
      for (const t of TEXT) {
        for (const s of SURFACES) {
          const ratio = contrastRatio(tokens.get(t)!, tokens.get(s)!);
          if (ratio < 4.5) failures.push(`${t} on ${s} = ${ratio}:1`);
        }
      }
      expect(failures, `contrast below 4.5:1 (${theme}):\n${failures.join("\n")}`).toEqual([]);
    });
  }

  /**
   * V2 group D: report charts draw every bar and line in --chart-series.
   * A graphical mark needs 3:1 against the surface it sits on (WCAG
   * 1.4.11) — the value labels beside it are in text tokens, so 3:1 is
   * the right floor, not 4.5.
   */
  it("chart series colour reads as a mark on the card surface in both themes", () => {
    const failures: string[] = [];
    for (const selector of [":root", "html.dark"]) {
      const tokens = readTokens(css, selector);
      const series = tokens.get("--chart-series");
      expect(series, `--chart-series missing in ${selector}`).toBeTruthy();
      const ratio = contrastRatio(series!, tokens.get("--color-surface")!);
      if (ratio < 3) failures.push(`${selector}: --chart-series on --color-surface = ${ratio}:1`);
    }
    expect(failures).toEqual([]);
  });

  /**
   * V2: the brand green carries real text — the primary button's label
   * and the page hero band — so it needs the same 4.5:1 floor the text
   * tokens have. The gradient is checked at BOTH stops: the band it
   * replaced ended in teal-600, which measured 3.74:1 against the white
   * subtitle sitting on it.
   */
  it("brand green carries text at AA in both themes", () => {
    const failures: string[] = [];
    for (const selector of [":root", "html.dark"]) {
      const tokens = readTokens(css, selector);
      const brand = tokens.get("--color-brand")!;
      const on = tokens.get("--color-brand-on")!;
      expect(brand, `--color-brand missing in ${selector}`).toBeTruthy();
      const btn = contrastRatio(on, brand);
      if (btn < 4.5) failures.push(`${selector}: --color-brand-on on --color-brand = ${btn}:1`);

    }

    // --brand-gradient holds a linear-gradient(), which readTokens skips
    // (it keeps plain hex only) — read every declaration of it straight
    // out of the stylesheet and check each colour stop. The band's ink is
    // white in BOTH themes, declared once in :root.
    const bandInk = readTokens(css, ":root").get("--brand-gradient-on")!;
    expect(bandInk, "--brand-gradient-on missing").toBeTruthy();
    const declarations = css.match(/--brand-gradient:\s*[^;]+;/g) ?? [];
    expect(declarations.length, "no --brand-gradient declarations").toBeGreaterThan(0);
    for (const decl of declarations) {
      const stops = decl.match(/#[0-9A-Fa-f]{3,6}\b/g) ?? [];
      expect(stops.length, `no colour stops in: ${decl}`).toBeGreaterThan(1);
      for (const stop of stops) {
        const ratio = contrastRatio(bandInk, stop);
        if (ratio < 4.5) failures.push(`band ink on ${stop} = ${ratio}:1`);
      }
    }
    expect(failures, `brand contrast below 4.5:1:\n${failures.join("\n")}`).toEqual([]);
  });

  /* ---- V2 Direction B guards ------------------------------------ */

  /** CSS color-mix(in srgb, A p%, B) — per-channel in gamma space, which
   *  is exactly what the browser does for the srgb interpolation space. */
  const mixHex = (a: string, b: string, p: number): string => {
    const A = parseHex(a)!, B = parseHex(b)!;
    return "#" + A.map((c, i) => Math.round(c * p + B[i] * (1 - p)).toString(16).padStart(2, "0")).join("");
  };
  const themeTokens = (theme: "light" | "dark") => {
    const root = readTokens(css, ":root");
    if (theme === "light") return root;
    return new Map([...root, ...readTokens(css, "html.dark")]);
  };
  /** Resolve `var(--x)` / a hex / `color-mix(in srgb, var(--a) P%, var(--b))`. */
  const resolve = (expr: string, t: Map<string, string>): string => {
    expr = expr.trim();
    const v = expr.match(/^var\((--[a-z0-9-]+)\)$/);
    if (v) return t.get(v[1])!;
    if (expr.startsWith("#")) return expr;
    const m = expr.match(/^color-mix\(in srgb,\s*(var\(--[a-z0-9-]+\))\s+(\d+)%,\s*(var\(--[a-z0-9-]+\))\)$/);
    if (!m) throw new Error(`unparsed colour: ${expr}`);
    return mixHex(resolve(m[1], t), resolve(m[3], t), Number(m[2]) / 100);
  };

  it("room-status ink reads on its own tint (tiles, active chips) in both themes", () => {
    const block = css.slice(css.indexOf(":root, html.dark {"));
    const decl = (name: string) => block.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1];
    const failures: string[] = [];
    for (const theme of ["light", "dark"] as const) {
      const t = themeTokens(theme);
      for (const st of ["occupied", "ready", "pending", "moveout", "qc", "repair", "inactive"]) {
        const ink = resolve(decl(`--status-${st}-ink`)!, t);
        const soft = resolve(decl(`--status-${st}-soft`)!, t);
        const ratio = contrastRatio(ink, soft);
        if (ratio < 4.5) failures.push(`${theme} ${st}: ink ${ink} on ${soft} = ${ratio}:1`);
      }
    }
    expect(failures, `status ink below 4.5:1:\n${failures.join("\n")}`).toEqual([]);
  });

  it("white text on the hero band's glass cards stays at AA", () => {
    const glass = css.match(/--hero-glass:\s*rgba\(255,\s*255,\s*255,\s*([0-9.]+)\)/);
    expect(glass, "--hero-glass missing").toBeTruthy();
    const alpha = Number(glass![1]);
    const ink = readTokens(css, ":root").get("--brand-gradient-on")!;
    const failures: string[] = [];
    for (const decl of css.match(/--brand-gradient:\s*[^;]+;/g) ?? []) {
      for (const stop of decl.match(/#[0-9A-Fa-f]{3,6}\b/g) ?? []) {
        const ground = mixHex("#ffffff", stop, alpha); // white glass over the band
        const ratio = contrastRatio(ink, ground);
        if (ratio < 4.5) failures.push(`${stop} + ${alpha} glass = ${ground}: ${ratio}:1`);
      }
    }
    expect(failures, `band glass below 4.5:1:\n${failures.join("\n")}`).toEqual([]);
  });

  it("accent (link/button text colour) is readable on the surface", () => {
    for (const selector of [":root", "html.dark"]) {
      const tokens = readTokens(css, selector);
      const ratio = contrastRatio(tokens.get("--color-accent")!, tokens.get("--color-surface")!);
      expect(ratio, `${selector} accent on surface = ${ratio}`).toBeGreaterThanOrEqual(3); // large/bold UI text
    }
  });
});
