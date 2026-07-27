import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const { preloadAppRoute } = vi.hoisted(() => ({
  preloadAppRoute: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/lib/route-modules", () => ({
  preloadAppRoute,
}));

import {
  AppLink,
  AppRouteTransition,
  NavigationTransitionProvider,
} from "@/components/navigation-transition";

const originalMatchMedia = window.matchMedia;

function LocationLabel() {
  const location = useLocation();
  return <p>{location.pathname}</p>;
}

function Fixture({ destination = "/entries" }: { destination?: string }) {
  return (
    <MemoryRouter initialEntries={["/"]}>
      <NavigationTransitionProvider>
        <AppLink to={destination}>前往目的地</AppLink>
        <AppRouteTransition>
          <Routes>
            <Route path="*" element={<LocationLabel />} />
          </Routes>
        </AppRouteTransition>
      </NavigationTransitionProvider>
    </MemoryRouter>
  );
}

function mockMatchMedia({
  mobile = false,
  reducedMotion = false,
}: {
  mobile?: boolean;
  reducedMotion?: boolean;
}) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn((query: string) => ({
      matches: query.includes("prefers-reduced-motion")
        ? reducedMotion
        : mobile,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

afterEach(() => {
  preloadAppRoute.mockReset();
  preloadAppRoute.mockResolvedValue();
  delete document.documentElement.dataset.navigationDirection;
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: originalMatchMedia,
  });
  Object.defineProperty(document, "startViewTransition", {
    configurable: true,
    value: undefined,
  });
});

describe("shared navigation transitions", () => {
  it("preloads then animates the real route content", async () => {
    mockMatchMedia({});
    let finishPreload = () => {};
    preloadAppRoute.mockReturnValue(
      new Promise<void>((resolve) => {
        finishPreload = resolve;
      }),
    );
    const startViewTransition = vi.fn();
    Object.defineProperty(document, "startViewTransition", {
      configurable: true,
      value: startViewTransition,
    });
    const user = userEvent.setup();
    render(<Fixture />);

    await user.click(screen.getByRole("link", { name: "前往目的地" }));

    expect(preloadAppRoute).toHaveBeenCalledWith("/entries");
    expect(startViewTransition).not.toHaveBeenCalled();
    expect(screen.getByText("/")).toBeInTheDocument();
    finishPreload();
    await waitFor(() => {
      expect(screen.getByText("/entries")).toBeInTheDocument();
    });
    expect(startViewTransition).not.toHaveBeenCalled();
    expect(
      document.querySelector('[data-slot="app-route-content"]'),
    ).toHaveAttribute("data-entry-direction", "forward");
  });

  it("adds a directional entry animation without browser-specific APIs", async () => {
    mockMatchMedia({});
    const user = userEvent.setup();
    render(<Fixture />);

    await user.click(screen.getByRole("link", { name: "前往目的地" }));

    expect(screen.getByText("/entries")).toBeInTheDocument();
    expect(
      document.querySelector('[data-slot="app-route-content"]'),
    ).toHaveAttribute("data-entry-direction", "forward");
  });

  it("does not animate route entry when reduced motion is requested", async () => {
    mockMatchMedia({ reducedMotion: true });
    const user = userEvent.setup();
    render(<Fixture />);

    await user.click(screen.getByRole("link", { name: "前往目的地" }));

    expect(screen.getByText("/entries")).toBeInTheDocument();
    expect(
      document.querySelector('[data-slot="app-route-content"]'),
    ).not.toHaveAttribute("data-entry-direction");
  });

  it("automatically treats mobile transaction editors as overlays", async () => {
    mockMatchMedia({ mobile: true });
    const user = userEvent.setup();
    render(<Fixture destination="/entries/new" />);

    await user.click(screen.getByRole("link", { name: "前往目的地" }));

    expect(screen.getByText("/entries/new")).toBeInTheDocument();
    expect(
      document.querySelector('[data-slot="app-route-content"]'),
    ).not.toHaveAttribute("data-entry-direction");
  });
});
