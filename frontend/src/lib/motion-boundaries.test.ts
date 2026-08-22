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
});
