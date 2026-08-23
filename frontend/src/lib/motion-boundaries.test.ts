import { describe, expect, it } from "vitest";

const interfaceSources = import.meta.glob(
  ["../components/**/*.tsx", "../features/**/*.tsx", "../pages/**/*.tsx"],
  {
    eager: true,
    import: "default",
    query: "?raw",
  },
) as Record<string, string>;

describe("Motion ownership boundaries", () => {
  it("does not reintroduce legacy or CSS-driven finite interaction animation", () => {
    const forbidden = [
      /touch-(?:press|surface|rebound)/,
      /\btw-animate-css\b/,
      /\banimate-(?:in|out)\b/,
      /\btransition-(?:all|colors|opacity|transform|\[[^\]]+\])\b/,
    ];

    const violations = Object.entries(interfaceSources).flatMap(
      ([path, source]) =>
        forbidden
          .filter((pattern) => pattern.test(source))
          .map((pattern) => `${path}: ${pattern.source}`),
    );

    expect(violations).toEqual([]);
  });

  it("routes press feedback through a single ownership-aware boundary", () => {
    const directPressHelpers = /\bpress(?:State)?MotionProps\s*\(/;
    const violations = Object.entries(interfaceSources).flatMap(
      ([path, source]) => {
        const errors = [];
        if (directPressHelpers.test(source)) {
          errors.push(`${path}: bypasses press ownership`);
        }
        if (
          source.includes("useOwnedPress") &&
          !source.includes("PressMotionBoundary")
        ) {
          errors.push(`${path}: does not publish press ownership`);
        }
        return errors;
      },
    );

    expect(violations).toEqual([]);
  });
});
