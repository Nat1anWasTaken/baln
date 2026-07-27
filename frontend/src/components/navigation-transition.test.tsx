import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

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
  it("wraps supported in-app navigation in one native view transition", async () => {
    mockMatchMedia({});
    const startViewTransition = vi.fn((update: () => void | Promise<void>) => {
      const updateCallbackDone = Promise.resolve().then(update);
      return {
        finished: updateCallbackDone.then(() => undefined),
        ready: updateCallbackDone.then(() => undefined),
        skipTransition: vi.fn(),
        types: new Set<string>(),
        updateCallbackDone,
      } as unknown as ViewTransition;
    });
    Object.defineProperty(document, "startViewTransition", {
      configurable: true,
      value: startViewTransition,
    });
    const user = userEvent.setup();
    render(<Fixture />);

    await user.click(screen.getByRole("link", { name: "前往目的地" }));

    expect(startViewTransition).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("/entries")).toBeInTheDocument();
    expect(
      document.querySelector('[data-slot="app-route-content"]'),
    ).not.toHaveAttribute("data-entry-direction");
  });

  it("adds a directional entry fallback when native transitions are unavailable", async () => {
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
