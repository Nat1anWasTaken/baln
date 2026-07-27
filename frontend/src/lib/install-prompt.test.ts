import { beforeEach, describe, expect, it, vi } from "vitest";

describe("PWA install prompt controller", () => {
  beforeEach(() => {
    vi.resetModules();
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  it("captures and invokes the browser installation prompt", async () => {
    const controller = await import("@/lib/install-prompt");
    const prompt = vi.fn().mockResolvedValue(undefined);
    const event = new Event("beforeinstallprompt") as BeforeInstallPromptEvent;
    Object.defineProperties(event, {
      prompt: { value: prompt },
      userChoice: {
        value: Promise.resolve({
          outcome: "accepted",
          platform: "web",
        }),
      },
    });

    window.dispatchEvent(event);
    expect(controller.getInstallState().promptReady).toBe(true);

    await expect(controller.requestInstall()).resolves.toEqual({
      kind: "installed",
    });
    expect(prompt).toHaveBeenCalledOnce();
    expect(controller.getInstallState().installed).toBe(true);
  });
});
