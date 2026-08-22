import { render, screen, waitFor, within } from "@testing-library/react";
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
const originalInnerWidth = window.innerWidth;

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
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: mobile ? 390 : 1024,
  });
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

function currentRoute() {
  const route = document.querySelector<HTMLElement>(
    '[data-slot="app-route-content"]:not([aria-hidden="true"])',
  );
  expect(route).not.toBeNull();
  return route as HTMLElement;
}

afterEach(() => {
  preloadAppRoute.mockReset();
  preloadAppRoute.mockResolvedValue();
  delete document.documentElement.dataset.navigationDirection;
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: originalMatchMedia,
  });
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: originalInnerWidth,
  });
  Object.defineProperty(document, "startViewTransition", {
    configurable: true,
    value: undefined,
  });
});

describe("shared navigation transitions", () => {
  it("preloads then hands the real route content to Motion", async () => {
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

    expect(screen.getByRole("link", { name: "前往目的地" })).toHaveAttribute(
      "data-navigation-transition",
      "motion",
    );

    await user.click(screen.getByRole("link", { name: "前往目的地" }));

    expect(preloadAppRoute).toHaveBeenCalledWith("/entries");
    expect(startViewTransition).not.toHaveBeenCalled();
    expect(within(currentRoute()).getByText("/")).toBeInTheDocument();
    finishPreload();
    await waitFor(() => {
      expect(within(currentRoute()).getByText("/entries")).toBeInTheDocument();
    });
    expect(startViewTransition).not.toHaveBeenCalled();
    expect(currentRoute()).not.toHaveAttribute("data-entry-direction");
  });

  it("navigates without browser-specific transition APIs", async () => {
    mockMatchMedia({});
    const user = userEvent.setup();
    render(<Fixture />);

    await user.click(screen.getByRole("link", { name: "前往目的地" }));

    expect(within(currentRoute()).getByText("/entries")).toBeInTheDocument();
    expect(currentRoute()).not.toHaveAttribute("data-entry-direction");
  });

  it("does not animate route entry when reduced motion is requested", async () => {
    mockMatchMedia({ reducedMotion: true });
    const user = userEvent.setup();
    render(<Fixture />);

    expect(screen.getByRole("link", { name: "前往目的地" })).toHaveAttribute(
      "data-navigation-transition",
      "none",
    );

    await user.click(screen.getByRole("link", { name: "前往目的地" }));

    expect(within(currentRoute()).getByText("/entries")).toBeInTheDocument();
    expect(currentRoute()).not.toHaveAttribute("data-entry-direction");
  });

  it("automatically treats mobile transaction editors as overlays", async () => {
    mockMatchMedia({ mobile: true });
    const user = userEvent.setup();
    render(<Fixture destination="/entries/new" />);

    await user.click(screen.getByRole("link", { name: "前往目的地" }));

    expect(
      within(currentRoute()).getByText("/entries/new"),
    ).toBeInTheDocument();
    expect(currentRoute()).not.toHaveAttribute("data-entry-direction");
    expect(
      document.querySelector('[data-slot="edge-back-trigger"]'),
    ).not.toBeInTheDocument();
  });

  it("offers edge-back on hierarchical detail routes in an installed app", async () => {
    mockMatchMedia({ mobile: true });
    const user = userEvent.setup();
    render(<Fixture destination="/entries/entry-1" />);

    await user.click(screen.getByRole("link", { name: "前往目的地" }));

    expect(
      within(currentRoute()).getByText("/entries/entry-1"),
    ).toBeInTheDocument();
    expect(
      document.querySelector('[data-slot="edge-back-trigger"]'),
    ).toBeInTheDocument();
  });
});
