import {
  createContext,
  forwardRef,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Link,
  type LinkProps,
  NavLink,
  type NavLinkProps,
  type NavigateOptions,
  type To,
  resolvePath,
  useLocation,
  useNavigate,
  useNavigationType,
  useResolvedPath,
} from "react-router-dom";

import { useIsMobile } from "@/hooks/use-mobile";
import {
  getNavigationDirection,
  isEntryEditorPath,
  type NavigationDirection,
  type NavigationIntent,
} from "@/lib/navigation-transition";

type TransitionMode = "idle" | "native" | "entry";

type TransitionState = {
  direction: NavigationDirection;
  mode: TransitionMode;
  sequence: number;
};

type PendingNavigation = {
  direction: NavigationDirection;
  native: boolean;
};

type NavigationTransitionContextValue = {
  beginNavigation: (direction: NavigationDirection, native: boolean) => void;
  canUseNativeTransition: (direction: NavigationDirection) => boolean;
  isMobile: boolean;
};

const NavigationTransitionContext =
  createContext<NavigationTransitionContextValue | null>(null);
const NavigationVisualTransitionContext = createContext<TransitionState | null>(
  null,
);

const navigationTransitionFallback: NavigationTransitionContextValue = {
  beginNavigation: () => {},
  canUseNativeTransition: () => false,
  isMobile: false,
};

const navigationVisualTransitionFallback: TransitionState = {
  direction: "none",
  mode: "idle",
  sequence: 0,
};

function motionIsAllowed() {
  return (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function" ||
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function nativeViewTransitionsAreSupported() {
  return (
    typeof document !== "undefined" &&
    typeof document.startViewTransition === "function"
  );
}

function setDocumentDirection(direction: NavigationDirection) {
  if (typeof document === "undefined") return;
  if (direction === "none") {
    delete document.documentElement.dataset.navigationDirection;
    return;
  }
  document.documentElement.dataset.navigationDirection = direction;
}

export function NavigationTransitionProvider({
  children,
}: {
  children: ReactNode;
}) {
  const location = useLocation();
  const navigationType = useNavigationType();
  const isMobile = useIsMobile();
  const [motionAllowed, setMotionAllowed] = useState(motionIsAllowed);
  const [transition, setTransition] = useState<TransitionState>({
    direction: "none",
    mode: "idle",
    sequence: 0,
  });
  const pendingNavigation = useRef<PendingNavigation | null>(null);
  const previousLocation = useRef(location);
  const history = useRef({ keys: [location.key], index: 0 });
  const mounted = useRef(false);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setMotionAllowed(!media.matches);
    media.addEventListener("change", update);
    update();
    return () => media.removeEventListener("change", update);
  }, []);

  const canUseNativeTransition = useCallback(
    (direction: NavigationDirection) =>
      direction !== "none" &&
      motionAllowed &&
      nativeViewTransitionsAreSupported(),
    [motionAllowed],
  );

  const beginNavigation = useCallback(
    (direction: NavigationDirection, native: boolean) => {
      pendingNavigation.current = { direction, native };
      if (!native) return;
      setDocumentDirection(direction);
    },
    [],
  );

  useLayoutEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      previousLocation.current = location;
      return;
    }
    if (previousLocation.current.key === location.key) return;

    const pending = pendingNavigation.current;
    pendingNavigation.current = null;
    let direction = pending?.direction ?? "none";
    const routeHistory = history.current;
    let knownHistoryDestination = false;

    if (navigationType === "POP") {
      const destinationIndex = routeHistory.keys.indexOf(location.key);
      knownHistoryDestination = destinationIndex >= 0;
      if (!pending && destinationIndex >= 0) {
        direction = destinationIndex < routeHistory.index ? "back" : "forward";
      }
      if (destinationIndex >= 0) {
        routeHistory.index = destinationIndex;
      } else {
        routeHistory.keys = [location.key];
        routeHistory.index = 0;
      }
    } else if (navigationType === "PUSH") {
      routeHistory.keys = [
        ...routeHistory.keys.slice(0, routeHistory.index + 1),
        location.key,
      ];
      routeHistory.index += 1;
    } else {
      routeHistory.keys[routeHistory.index] = location.key;
    }

    if (!pending && (navigationType !== "POP" || !knownHistoryDestination)) {
      direction = getNavigationDirection(
        previousLocation.current.pathname,
        location.pathname,
      );
    }
    previousLocation.current = location;

    if (direction === "none") {
      setDocumentDirection("none");
      setTransition((current) => ({
        direction: "none",
        mode: "idle",
        sequence: current.sequence + 1,
      }));
      return;
    }
    if (pending?.native) {
      setTransition((current) => ({
        direction,
        mode: "native",
        sequence: current.sequence + 1,
      }));
    } else if (motionAllowed) {
      setTransition((current) => ({
        direction,
        mode: "entry",
        sequence: current.sequence + 1,
      }));
    }
  }, [location, motionAllowed, navigationType]);

  useEffect(() => {
    if (transition.mode === "idle") return;
    const timeout = window.setTimeout(() => {
      setDocumentDirection("none");
      setTransition((current) =>
        current.sequence === transition.sequence
          ? {
              direction: "none",
              mode: "idle",
              sequence: current.sequence,
            }
          : current,
      );
    }, 260);
    return () => window.clearTimeout(timeout);
  }, [transition.mode, transition.sequence]);

  const value = useMemo(
    () => ({
      beginNavigation,
      canUseNativeTransition,
      isMobile,
    }),
    [beginNavigation, canUseNativeTransition, isMobile],
  );

  return (
    <NavigationTransitionContext.Provider value={value}>
      <NavigationVisualTransitionContext.Provider value={transition}>
        {children}
      </NavigationVisualTransitionContext.Provider>
    </NavigationTransitionContext.Provider>
  );
}

function useNavigationTransition() {
  return (
    useContext(NavigationTransitionContext) ?? navigationTransitionFallback
  );
}

function useNavigationVisualTransition() {
  return (
    useContext(NavigationVisualTransitionContext) ??
    navigationVisualTransitionFallback
  );
}

function shouldHandleClick(
  event: MouseEvent<HTMLAnchorElement>,
  target?: string,
) {
  return (
    !event.defaultPrevented &&
    event.button === 0 &&
    (!target || target === "_self") &&
    !event.metaKey &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.shiftKey
  );
}

function startNativeNavigation(
  update: () => void | Promise<void>,
  onUnavailable: () => void,
): Promise<void> {
  try {
    return document.startViewTransition(update).finished;
  } catch {
    onUnavailable();
    return Promise.resolve(update());
  }
}

function usePreparedNavigation(
  to: To,
  intent: NavigationIntent,
  reloadDocument = false,
) {
  const location = useLocation();
  const destination = useResolvedPath(to);
  const transition = useNavigationTransition();
  const effectiveIntent =
    intent === "auto" &&
    transition.isMobile &&
    isEntryEditorPath(destination.pathname)
      ? "overlay"
      : intent;
  const direction = getNavigationDirection(
    location.pathname,
    destination.pathname,
    effectiveIntent,
  );
  const native =
    !reloadDocument && transition.canUseNativeTransition(direction);

  return {
    direction,
    native,
    fallback: () => transition.beginNavigation(direction, false),
    prepare: () => transition.beginNavigation(direction, native),
  };
}

export type AppLinkProps = Omit<LinkProps, "viewTransition"> & {
  transitionIntent?: NavigationIntent;
};

export const AppLink = forwardRef<HTMLAnchorElement, AppLinkProps>(
  function AppLink(
    {
      defaultShouldRevalidate,
      mask,
      onClick,
      preventScrollReset,
      relative,
      reloadDocument,
      replace,
      state,
      target,
      to,
      transitionIntent = "auto",
      ...props
    },
    ref,
  ) {
    const navigate = useNavigate();
    const navigation = usePreparedNavigation(
      to,
      transitionIntent,
      reloadDocument,
    );

    return (
      <Link
        {...props}
        ref={ref}
        to={to}
        target={target}
        mask={mask}
        state={state}
        replace={replace}
        relative={relative}
        preventScrollReset={preventScrollReset}
        reloadDocument={reloadDocument}
        defaultShouldRevalidate={defaultShouldRevalidate}
        viewTransition={false}
        data-navigation-transition={
          navigation.direction === "none"
            ? "none"
            : navigation.native
              ? "native"
              : "fallback"
        }
        onClick={(event) => {
          onClick?.(event);
          if (!shouldHandleClick(event, target)) return;
          navigation.prepare();
          if (!navigation.native) return;
          event.preventDefault();
          void startNativeNavigation(
            () =>
              navigate(to, {
                flushSync: true,
                mask,
                preventScrollReset,
                relative,
                replace,
                state,
                viewTransition: false,
                defaultShouldRevalidate,
              }),
            navigation.fallback,
          );
        }}
      />
    );
  },
);

export type AppNavLinkProps = Omit<NavLinkProps, "viewTransition"> & {
  transitionIntent?: NavigationIntent;
};

export const AppNavLink = forwardRef<HTMLAnchorElement, AppNavLinkProps>(
  function AppNavLink(
    {
      defaultShouldRevalidate,
      mask,
      onClick,
      preventScrollReset,
      relative,
      reloadDocument,
      replace,
      state,
      target,
      to,
      transitionIntent = "auto",
      ...props
    },
    ref,
  ) {
    const navigate = useNavigate();
    const navigation = usePreparedNavigation(
      to,
      transitionIntent,
      reloadDocument,
    );

    return (
      <NavLink
        {...props}
        ref={ref}
        to={to}
        target={target}
        mask={mask}
        state={state}
        replace={replace}
        relative={relative}
        preventScrollReset={preventScrollReset}
        reloadDocument={reloadDocument}
        defaultShouldRevalidate={defaultShouldRevalidate}
        viewTransition={false}
        data-navigation-transition={
          navigation.direction === "none"
            ? "none"
            : navigation.native
              ? "native"
              : "fallback"
        }
        onClick={(event) => {
          onClick?.(event);
          if (!shouldHandleClick(event, target)) return;
          navigation.prepare();
          if (!navigation.native) return;
          event.preventDefault();
          void startNativeNavigation(
            () =>
              navigate(to, {
                flushSync: true,
                mask,
                preventScrollReset,
                relative,
                replace,
                state,
                viewTransition: false,
                defaultShouldRevalidate,
              }),
            navigation.fallback,
          );
        }}
      />
    );
  },
);

export type AppNavigateOptions = NavigateOptions & {
  transitionIntent?: NavigationIntent;
};

export type AppNavigateFunction = {
  (to: To, options?: AppNavigateOptions): void | Promise<void>;
  (
    delta: number,
    options?: Pick<AppNavigateOptions, "transitionIntent">,
  ): void | Promise<void>;
};

export function useAppNavigate(): AppNavigateFunction {
  const location = useLocation();
  const navigate = useNavigate();
  const transition = useNavigationTransition();

  return useCallback(
    (to: To | number, options: AppNavigateOptions = {}) => {
      if (typeof to === "number") {
        const direction = getNavigationDirection(
          location.pathname,
          location.pathname,
          options.transitionIntent ??
            (to < 0 ? "back" : to > 0 ? "forward" : "none"),
        );
        transition.beginNavigation(direction, false);
        return navigate(to);
      }

      const destination = resolvePath(to, location.pathname);
      const { transitionIntent = "auto", ...navigateOptions } = options;
      const effectiveIntent =
        transitionIntent === "auto" &&
        transition.isMobile &&
        isEntryEditorPath(destination.pathname)
          ? "overlay"
          : transitionIntent;
      const direction = getNavigationDirection(
        location.pathname,
        destination.pathname,
        effectiveIntent,
      );
      const native = transition.canUseNativeTransition(direction);
      transition.beginNavigation(direction, native);
      const finalOptions = {
        ...navigateOptions,
        flushSync: native || navigateOptions.flushSync,
        viewTransition: false,
      };
      if (native) {
        return startNativeNavigation(
          () => navigate(to, finalOptions),
          () => transition.beginNavigation(direction, false),
        );
      }
      return navigate(to, finalOptions);
    },
    [location.pathname, navigate, transition],
  ) as AppNavigateFunction;
}

export function useSuppressNextNavigationTransition() {
  const transition = useNavigationTransition();
  return useCallback(
    () => transition.beginNavigation("none", false),
    [transition],
  );
}

export function AppRouteTransition({ children }: { children: ReactNode }) {
  const location = useLocation();
  const transition = useNavigationVisualTransition();
  const entryDirection =
    transition.mode === "entry" ? transition.direction : undefined;

  return (
    <div
      key={location.pathname}
      data-slot="app-route-content"
      data-entry-direction={entryDirection}
      className="app-route-content"
    >
      {children}
    </div>
  );
}

export function ActiveNavigationIndicator({
  className = "",
}: {
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      data-slot="active-navigation-indicator"
      className={`app-active-navigation-indicator pointer-events-none absolute inset-0 -z-10 rounded-[inherit] ${className}`}
    />
  );
}
