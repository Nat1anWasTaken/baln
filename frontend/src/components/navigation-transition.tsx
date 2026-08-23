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
import {
  animate,
  m,
  useDragControls,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";

import { useIsMobile } from "@/hooks/use-mobile";
import {
  getNavigationDirection,
  isEntryEditorPath,
  type NavigationDirection,
  type NavigationIntent,
} from "@/lib/navigation-transition";
import { preloadAppRoute } from "@/lib/route-modules";
import {
  motionSpring,
  PressMotionBoundary,
  type MotionSafeProps,
  type PressFeedback,
  useInstantMotion,
  useOwnedPressMotionProps,
} from "@/lib/motion";
import { cn } from "@/lib/utils";

const MotionLink = m.create(Link);
const MotionNavLink = m.create(NavLink);

type TransitionMode = "idle" | "entry";

type TransitionState = {
  direction: NavigationDirection;
  mode: TransitionMode;
  sequence: number;
};

type PendingNavigation = {
  direction: NavigationDirection;
};

type NavigationTransitionContextValue = {
  beginNavigation: (direction: NavigationDirection) => void;
  canAnimate: (direction: NavigationDirection) => boolean;
  isMobile: boolean;
};

const NavigationTransitionContext =
  createContext<NavigationTransitionContextValue | null>(null);
const NavigationVisualTransitionContext = createContext<TransitionState | null>(
  null,
);

const navigationTransitionFallback: NavigationTransitionContextValue = {
  beginNavigation: () => {},
  canAnimate: () => false,
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
  const transitionSequence = useRef(0);
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

  const canAnimate = useCallback(
    (direction: NavigationDirection) => direction !== "none" && motionAllowed,
    [motionAllowed],
  );

  const beginNavigation = useCallback(
    (direction: NavigationDirection) => {
      transitionSequence.current += 1;
      const sequence = transitionSequence.current;
      pendingNavigation.current = { direction };
      setTransition({
        direction: direction !== "none" && motionAllowed ? direction : "none",
        mode: direction !== "none" && motionAllowed ? "entry" : "idle",
        sequence,
      });
    },
    [motionAllowed],
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

    // Intent-driven navigation publishes its direction before the URL changes,
    // so titles, tabs, and route content all animate from the same render.
    if (pending) return;

    if (direction === "none") {
      transitionSequence.current += 1;
      setTransition({
        direction: "none",
        mode: "idle",
        sequence: transitionSequence.current,
      });
      return;
    }
    if (motionAllowed) {
      transitionSequence.current += 1;
      setTransition({
        direction,
        mode: "entry",
        sequence: transitionSequence.current,
      });
    } else {
      transitionSequence.current += 1;
      setTransition({
        direction: "none",
        mode: "idle",
        sequence: transitionSequence.current,
      });
    }
  }, [location, motionAllowed, navigationType]);

  useEffect(() => {
    if (transition.mode === "idle") return;
    const timeout = window.setTimeout(() => {
      setTransition((current) =>
        current.sequence === transition.sequence
          ? {
              direction: current.direction,
              mode: "idle",
              sequence: current.sequence,
            }
          : current,
      );
    }, 480);
    return () => window.clearTimeout(timeout);
  }, [transition.mode, transition.sequence]);

  const value = useMemo(
    () => ({
      beginNavigation,
      canAnimate,
      isMobile,
    }),
    [beginNavigation, canAnimate, isMobile],
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

export function useNavigationVisualTransition() {
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
  const animate = !reloadDocument && transition.canAnimate(direction);

  return {
    animate,
    direction,
    preload: () => preloadAppRoute(destination.pathname),
    prepare: () => transition.beginNavigation(direction),
  };
}

export type AppLinkProps = MotionSafeProps<
  Omit<LinkProps, "viewTransition">
> & {
  pressFeedback?: PressFeedback;
  transitionIntent?: NavigationIntent;
};

export const AppLink = forwardRef<HTMLAnchorElement, AppLinkProps>(
  function AppLink(
    {
      className,
      defaultShouldRevalidate,
      mask,
      onFocus,
      onClick,
      onPointerDown,
      onPointerEnter,
      preventScrollReset,
      pressFeedback = "control",
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
    const pressMotion = useOwnedPressMotionProps(
      pressFeedback,
      Boolean(props["aria-disabled"]),
    );

    return (
      <PressMotionBoundary>
        <MotionLink
          {...props}
          className={cn("focus-ring", className)}
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
              : navigation.animate
                ? "motion"
                : "none"
          }
          {...pressMotion}
          onFocus={(event) => {
            onFocus?.(event);
            if (!event.defaultPrevented) void navigation.preload();
          }}
          onPointerDown={(event) => {
            onPointerDown?.(event);
            if (!event.defaultPrevented) void navigation.preload();
          }}
          onPointerEnter={(event) => {
            onPointerEnter?.(event);
            if (!event.defaultPrevented) void navigation.preload();
          }}
          onClick={(event) => {
            onClick?.(event);
            if (!shouldHandleClick(event, target)) return;
            if (!navigation.animate) {
              navigation.prepare();
              return;
            }
            event.preventDefault();
            void navigation
              .preload()
              .catch(() => {})
              .then(() => {
                navigation.prepare();
                navigate(to, {
                  flushSync: true,
                  mask,
                  preventScrollReset,
                  relative,
                  replace,
                  state,
                  viewTransition: false,
                  defaultShouldRevalidate,
                });
              });
          }}
        />
      </PressMotionBoundary>
    );
  },
);

export type AppNavLinkProps = MotionSafeProps<
  Omit<NavLinkProps, "style" | "viewTransition">
> & {
  pressFeedback?: PressFeedback;
  transitionIntent?: NavigationIntent;
};

export const AppNavLink = forwardRef<HTMLAnchorElement, AppNavLinkProps>(
  function AppNavLink(
    {
      className,
      defaultShouldRevalidate,
      mask,
      onFocus,
      onClick,
      onPointerDown,
      onPointerEnter,
      preventScrollReset,
      pressFeedback = "navigation",
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
    const pressMotion = useOwnedPressMotionProps(
      pressFeedback,
      Boolean(props["aria-disabled"]),
    );

    return (
      <PressMotionBoundary>
        <MotionNavLink
          {...props}
          className={(state) =>
            cn(
              "focus-ring",
              typeof className === "function" ? className(state) : className,
            )
          }
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
              : navigation.animate
                ? "motion"
                : "none"
          }
          {...pressMotion}
          onFocus={(event) => {
            onFocus?.(event);
            if (!event.defaultPrevented) void navigation.preload();
          }}
          onPointerDown={(event) => {
            onPointerDown?.(event);
            if (!event.defaultPrevented) void navigation.preload();
          }}
          onPointerEnter={(event) => {
            onPointerEnter?.(event);
            if (!event.defaultPrevented) void navigation.preload();
          }}
          onClick={(event) => {
            onClick?.(event);
            if (!shouldHandleClick(event, target)) return;
            if (!navigation.animate) {
              navigation.prepare();
              return;
            }
            event.preventDefault();
            void navigation
              .preload()
              .catch(() => {})
              .then(() => {
                navigation.prepare();
                navigate(to, {
                  flushSync: true,
                  mask,
                  preventScrollReset,
                  relative,
                  replace,
                  state,
                  viewTransition: false,
                  defaultShouldRevalidate,
                });
              });
          }}
        />
      </PressMotionBoundary>
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
        transition.beginNavigation(direction);
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
      const animate = transition.canAnimate(direction);
      const finalOptions = {
        ...navigateOptions,
        flushSync: animate || navigateOptions.flushSync,
        viewTransition: false,
      };
      if (animate) {
        return preloadAppRoute(destination.pathname)
          .catch(() => {})
          .then(() => {
            transition.beginNavigation(direction);
            navigate(to, finalOptions);
          });
      }
      transition.beginNavigation(direction);
      return navigate(to, finalOptions);
    },
    [location.pathname, navigate, transition],
  ) as AppNavigateFunction;
}

export function useSuppressNextNavigationTransition() {
  const transition = useNavigationTransition();
  return useCallback(() => transition.beginNavigation("none"), [transition]);
}

export function AppRouteTransition({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const navigation = useNavigationTransition();
  const transition = useNavigationVisualTransition();
  const shouldReduceMotion = useReducedMotion();
  const instantMotion = useInstantMotion();
  const dragControls = useDragControls();
  const edgeX = useMotionValue(0);
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === "undefined" ? 390 : window.innerWidth,
  );
  const previousX = useTransform(
    edgeX,
    [0, Math.max(viewportWidth, 1)],
    [-viewportWidth * 0.25, 0],
  );
  const previousOpacity = useTransform(
    edgeX,
    [0, Math.max(viewportWidth, 1)],
    [0.88, 1],
  );
  const [standalone, setStandalone] = useState(false);
  const [edgeActive, setEdgeActive] = useState(false);
  const frameRefs = useRef(new Map<string, HTMLDivElement>());
  const initialLayer = {
    key: location.key,
    node: children,
    pathname: location.pathname,
  };
  const activeRef = useRef(initialLayer);
  const [layers, setLayers] = useState(() => [initialLayer]);

  useEffect(() => {
    const displayMode = window.matchMedia("(display-mode: standalone)");
    const standaloneNavigator = navigator as Navigator & {
      standalone?: boolean;
    };
    const update = () =>
      setStandalone(
        displayMode.matches || standaloneNavigator.standalone === true,
      );
    const resize = () => setViewportWidth(window.innerWidth);
    update();
    resize();
    displayMode.addEventListener("change", update);
    window.addEventListener("resize", resize);
    return () => {
      displayMode.removeEventListener("change", update);
      window.removeEventListener("resize", resize);
    };
  }, []);

  useLayoutEffect(() => {
    if (activeRef.current.key === location.key) {
      activeRef.current = {
        key: location.key,
        node: children,
        pathname: location.pathname,
      };
      return;
    }
    const previous = activeRef.current;
    const direction =
      transition.mode === "entry"
        ? transition.direction
        : getNavigationDirection(previous.pathname, location.pathname);

    activeRef.current = {
      key: location.key,
      node: children,
      pathname: location.pathname,
    };
    setEdgeActive(false);
    edgeX.set(0);
    setLayers((current) => {
      let next = current.map((layer) =>
        layer.key === previous.key ? { ...layer, node: previous.node } : layer,
      );
      const previousIndex = next.findIndex(
        (layer) => layer.key === previous.key,
      );
      const destinationIndex = next.findIndex(
        (layer) => layer.key === location.key,
      );
      const destination = {
        key: location.key,
        node: children,
        pathname: location.pathname,
      };

      if (navigationType === "PUSH") {
        next = next.slice(0, previousIndex + 1);
        next.push(destination);
      } else if (navigationType === "REPLACE") {
        if (previousIndex >= 0) next.splice(previousIndex, 1, destination);
        else next.push(destination);
      } else if (destinationIndex >= 0) {
        next[destinationIndex] = destination;
      } else {
        next.push(destination);
      }

      return next.length > 8 ? next.slice(next.length - 8) : next;
    });

    if (instantMotion || direction === "none") return;
    window.requestAnimationFrame(() => {
      const currentFrame = frameRefs.current.get(location.key);
      if (!currentFrame) return;
      const enteringX = direction === "forward" ? 28 : -18;
      animate(
        currentFrame,
        { opacity: [0.96, 1], x: [enteringX, 0] },
        motionSpring.navigation,
      );
    });
  }, [
    children,
    edgeX,
    location.key,
    location.pathname,
    navigationType,
    instantMotion,
    transition.direction,
    transition.mode,
  ]);

  const currentIndex = layers.findIndex((layer) => layer.key === location.key);
  const previousLayer = currentIndex > 0 ? layers[currentIndex - 1] : undefined;
  const edgeEligiblePath =
    /^\/entries\/[^/]+$/.test(location.pathname) ||
    /^\/budgets\/[^/]+$/.test(location.pathname) ||
    location.pathname.startsWith("/settings/");
  const edgeAvailable =
    standalone &&
    viewportWidth < 768 &&
    !shouldReduceMotion &&
    Boolean(previousLayer) &&
    edgeEligiblePath &&
    !isEntryEditorPath(location.pathname);

  const finishEdgeDrag = (offset: number, velocity: number) => {
    const complete =
      offset >= viewportWidth * 0.33 || (offset >= 48 && velocity >= 650);
    if (!complete) {
      void animate(edgeX, 0, motionSpring.edgeReturn).then(() =>
        setEdgeActive(false),
      );
      return;
    }
    void animate(edgeX, viewportWidth, {
      duration: 0.18,
      ease: [0.32, 0.72, 0, 1],
    }).then(() => {
      navigation.beginNavigation("back");
      navigate(-1);
    });
  };

  return (
    <div data-slot="app-route-viewport" className="relative isolate">
      {layers.map((layer) => {
        const current = layer.key === location.key;
        const edgePrevious = edgeActive && layer.key === previousLayer?.key;
        const visible = current || edgePrevious;
        if (!visible) return null;
        return (
          <div
            key={layer.key}
            ref={(element) => {
              if (element) frameRefs.current.set(layer.key, element);
              else frameRefs.current.delete(layer.key);
            }}
            data-slot="app-route-content"
            data-route-key={layer.key}
            aria-hidden={!current || undefined}
            inert={!current || undefined}
            className={cn(
              "app-route-content min-w-0",
              current ? "relative" : "absolute inset-0",
            )}
            style={{ zIndex: current ? 2 : 1 }}
          >
            <m.div
              drag={current ? "x" : false}
              dragConstraints={{ left: 0, right: viewportWidth }}
              dragControls={current ? dragControls : undefined}
              dragElastic={0}
              dragListener={false}
              onDragEnd={
                current
                  ? (_event, info) =>
                      finishEdgeDrag(info.offset.x, info.velocity.x)
                  : undefined
              }
              style={
                current
                  ? { x: edgeX }
                  : edgePrevious
                    ? { opacity: previousOpacity, x: previousX }
                    : undefined
              }
            >
              {current ? children : layer.node}
            </m.div>
          </div>
        );
      })}
      {edgeAvailable ? (
        <div
          data-slot="edge-back-trigger"
          aria-hidden="true"
          className="fixed top-16 bottom-[calc(4rem+env(safe-area-inset-bottom))] left-0 z-40 w-5 touch-pan-y md:hidden"
          onPointerDown={(event) => {
            if (event.pointerType !== "touch" || !event.isPrimary) return;
            setEdgeActive(true);
            dragControls.start(event, { snapToCursor: false });
          }}
        />
      ) : null}
    </div>
  );
}

export function ActiveNavigationIndicator({
  className = "",
  layoutId = "active-navigation",
}: {
  className?: string;
  layoutId?: string;
}) {
  return (
    <m.span
      aria-hidden="true"
      data-slot="active-navigation-indicator"
      className={`app-active-navigation-indicator pointer-events-none absolute inset-0 -z-10 rounded-[inherit] ${className}`}
      layoutId={layoutId}
      transition={motionSpring.layout}
    />
  );
}
