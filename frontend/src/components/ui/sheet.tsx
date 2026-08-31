import * as React from "react";
import { AnimatePresence, animate, m, useMotionValue } from "motion/react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  motionSpring,
  type MotionSafeProps,
  PressMotionBoundary,
  type PressFeedback,
  useInstantMotion,
  useOwnedPressMotionProps,
} from "@/lib/motion";
import { cn } from "@/lib/utils";

const MotionSheetOverlay = m.create(DialogPrimitive.Overlay);
const MotionSheetContent = m.create(DialogPrimitive.Content);
const MotionSheetTrigger = m.create(DialogPrimitive.Trigger);

type SheetContextValue = {
  dismissible: boolean;
  open: boolean;
  onAnimationEnd?: (open: boolean) => void;
  requestClose: () => void;
};

const SheetContext = React.createContext<SheetContextValue>({
  dismissible: true,
  open: false,
  requestClose: () => undefined,
});

const SheetPortalContainerContext = React.createContext<HTMLElement | null>(
  null,
);

function useSheetPortalContainer() {
  return React.useContext(SheetPortalContainerContext);
}

type SheetProps = React.ComponentProps<typeof DialogPrimitive.Root> & {
  dismissible?: boolean;
  onAnimationEnd?: (open: boolean) => void;
};

function Sheet({
  children,
  defaultOpen,
  dismissible = true,
  onAnimationEnd,
  onOpenChange,
  open,
  ...props
}: SheetProps) {
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen ?? false);
  const resolvedOpen = open ?? internalOpen;
  const changeOpen = React.useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen && !dismissible) return;
      setInternalOpen(nextOpen);
      onOpenChange?.(nextOpen);
    },
    [dismissible, onOpenChange],
  );
  const requestClose = React.useCallback(() => {
    if (dismissible) changeOpen(false);
  }, [changeOpen, dismissible]);

  return (
    <SheetContext.Provider
      value={{ dismissible, open: resolvedOpen, onAnimationEnd, requestClose }}
    >
      <DialogPrimitive.Root
        data-slot="sheet"
        open={resolvedOpen}
        onOpenChange={changeOpen}
        {...props}
      >
        {children}
      </DialogPrimitive.Root>
    </SheetContext.Provider>
  );
}

function SheetTrigger({
  pressFeedback = "control",
  ...props
}: MotionSafeProps<React.ComponentProps<typeof DialogPrimitive.Trigger>> & {
  pressFeedback?: PressFeedback;
}) {
  const pressMotion = useOwnedPressMotionProps(
    pressFeedback,
    Boolean(props.disabled),
  );

  return (
    <PressMotionBoundary>
      <MotionSheetTrigger
        data-slot="sheet-trigger"
        {...pressMotion}
        {...props}
      />
    </PressMotionBoundary>
  );
}

function SheetPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="sheet-portal" {...props} />;
}

function SheetClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="sheet-close" {...props} />;
}

function SheetOverlay({
  className,
  ...props
}: MotionSafeProps<React.ComponentProps<typeof DialogPrimitive.Overlay>>) {
  const instant = useInstantMotion();

  return (
    <MotionSheetOverlay
      forceMount
      data-slot="sheet-overlay"
      data-presentation="sheet"
      initial={instant ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={
        instant ? undefined : { opacity: 0, transition: { duration: 0.16 } }
      }
      transition={{ duration: instant ? 0 : 0.2 }}
      className={cn(
        "fixed inset-0 isolate z-50 bg-black/30 supports-backdrop-filter:backdrop-blur-sm",
        className,
      )}
      {...props}
    />
  );
}

type DragState = {
  dragging: boolean;
  lastScrollTop: number;
  lastTime: number;
  lastY: number;
  nativeScroll: boolean;
  pointerId: number;
  scrollElement: HTMLElement | null;
  startX: number;
  startY: number;
  translation: number;
  velocity: number;
};

function findScrollableElement(
  target: EventTarget | null,
  boundary: HTMLElement,
) {
  let element = target instanceof HTMLElement ? target : null;
  while (element && element !== boundary) {
    const { overflowY } = window.getComputedStyle(element);
    if (
      element.scrollHeight > element.clientHeight &&
      (overflowY === "auto" || overflowY === "scroll")
    ) {
      return element;
    }
    element = element.parentElement;
  }
  return null;
}

function useSheetDrag(
  enabled: boolean,
  dismissible: boolean,
  requestClose: () => void,
  onDragDismiss?: () => void,
) {
  const contentRef = React.useRef<HTMLDivElement>(null);
  const [contentElement, setContentElement] =
    React.useState<HTMLDivElement | null>(null);
  const dragRef = React.useRef<DragState | null>(null);
  const inertiaFrameRef = React.useRef<number | null>(null);
  const y = useMotionValue<number | string>("100%");

  const setContentRef = React.useCallback((element: HTMLDivElement | null) => {
    contentRef.current = element;
    setContentElement(element);
  }, []);

  const stopInertia = React.useCallback(() => {
    if (inertiaFrameRef.current !== null) {
      cancelAnimationFrame(inertiaFrameRef.current);
      inertiaFrameRef.current = null;
    }
  }, []);

  React.useEffect(() => stopInertia, [stopInertia]);

  const setTranslation = React.useCallback(
    (translation: number) => {
      y.set(Math.max(translation, 0));
    },
    [y],
  );

  const settle = React.useCallback(
    (dismiss: boolean) => {
      const content = contentRef.current;
      const drag = dragRef.current;
      if (!content || !drag) return;

      content.dataset.dragging = "false";
      if (dismiss) (onDragDismiss ?? requestClose)();
      void animate(y, 0, motionSpring.sheet);
      dragRef.current = null;
    },
    [onDragDismiss, requestClose, y],
  );

  const startScrollInertia = React.useCallback(
    (element: HTMLElement, pointerVelocity: number) => {
      let velocity = -pointerVelocity;
      let previousTime = performance.now();

      const step = (time: number) => {
        const elapsed = Math.min(time - previousTime, 32);
        previousTime = time;
        element.scrollTop += velocity * elapsed;
        velocity *= Math.pow(0.94, elapsed / 16);

        const atBoundary =
          element.scrollTop <= 0 ||
          element.scrollTop + element.clientHeight >= element.scrollHeight - 1;
        if (Math.abs(velocity) < 0.03 || atBoundary) {
          inertiaFrameRef.current = null;
          return;
        }
        inertiaFrameRef.current = requestAnimationFrame(step);
      };

      if (Math.abs(velocity) >= 0.15) {
        inertiaFrameRef.current = requestAnimationFrame(step);
      }
    },
    [],
  );

  const beginDrag = React.useCallback(
    (
      target: EventTarget | null,
      clientX: number,
      clientY: number,
      timeStamp: number,
      pointerId: number,
    ) => {
      if (!enabled) return;
      const content = contentRef.current;
      if (
        !content ||
        (target instanceof Element && target.closest("[data-sheet-no-drag]"))
      ) {
        return;
      }

      stopInertia();
      const scrollElement = findScrollableElement(target, content);
      dragRef.current = {
        dragging: false,
        lastScrollTop: scrollElement?.scrollTop ?? 0,
        lastTime: timeStamp,
        lastY: clientY,
        nativeScroll: pointerId === -1 && Boolean(scrollElement?.scrollTop),
        pointerId,
        scrollElement,
        startX: clientX,
        startY: clientY,
        translation: 0,
        velocity: 0,
      };
    },
    [enabled, stopInertia],
  );

  const moveDrag = React.useCallback(
    (
      clientX: number,
      clientY: number,
      timeStamp: number,
      preventDefault: () => void,
    ) => {
      const drag = dragRef.current;
      const content = contentRef.current;
      if (!drag || !content) return;

      const totalX = clientX - drag.startX;
      const totalY = clientY - drag.startY;
      if (!drag.dragging) {
        if (Math.abs(totalX) < 6 && Math.abs(totalY) < 6) return;
        if (Math.abs(totalX) > Math.abs(totalY) || totalY < 0) {
          dragRef.current = null;
          return;
        }
        drag.dragging = true;
        content.dataset.dragging = "true";
      }

      preventDefault();
      const elapsed = Math.max(timeStamp - drag.lastTime, 1);
      const delta = clientY - drag.lastY;
      drag.velocity = drag.velocity * 0.65 + (delta / elapsed) * 0.35;
      drag.lastTime = timeStamp;
      drag.lastY = clientY;

      let remaining = delta;
      const scrollElement = drag.scrollElement;
      if (remaining > 0 && scrollElement?.scrollTop) {
        const consumed = Math.min(scrollElement.scrollTop, remaining);
        scrollElement.scrollTop -= consumed;
        remaining -= consumed;
      }

      if (remaining < 0 && drag.translation > 0) {
        const consumed = Math.min(drag.translation, -remaining);
        drag.translation -= consumed;
        remaining += consumed;
      }

      if (remaining < 0 && scrollElement) {
        scrollElement.scrollTop += -remaining;
        remaining = 0;
      }

      if (remaining > 0) drag.translation += remaining;
      setTranslation(drag.translation);
    },
    [setTranslation],
  );

  const finishDrag = React.useCallback(() => {
    const drag = dragRef.current;
    const content = contentRef.current;
    if (!drag || !content) return;
    if (!drag.dragging) {
      dragRef.current = null;
      return;
    }

    const dismiss =
      dismissible &&
      (drag.translation >
        Math.min(content.getBoundingClientRect().height * 0.25, 96) ||
        (drag.translation > 40 && drag.velocity > 0.55));
    if (!dismiss && drag.translation === 0 && drag.scrollElement) {
      startScrollInertia(drag.scrollElement, drag.velocity);
    }
    settle(dismiss);
  }, [dismissible, settle, startScrollInertia]);

  const moveTouch = React.useCallback(
    (event: TouchEvent, touch: Touch) => {
      const drag = dragRef.current;
      const content = contentRef.current;
      if (!drag || !content) return;

      const totalX = touch.clientX - drag.startX;
      const totalY = touch.clientY - drag.startY;
      const delta = touch.clientY - drag.lastY;
      const elapsed = Math.max(event.timeStamp - drag.lastTime, 1);
      const scrollElement = drag.scrollElement;
      const scrollTop = scrollElement?.scrollTop ?? 0;

      if (!drag.dragging) {
        if (Math.abs(totalX) > Math.abs(totalY) && Math.abs(totalX) >= 6) {
          dragRef.current = null;
          return;
        }

        drag.velocity = drag.velocity * 0.65 + (delta / elapsed) * 0.35;
        drag.lastTime = event.timeStamp;
        drag.lastY = touch.clientY;

        if (delta <= 0 || Math.abs(totalY) < 6) {
          drag.lastScrollTop = scrollTop;
          return;
        }
        if (scrollElement && scrollTop > 0) {
          drag.nativeScroll = true;
          drag.lastScrollTop = scrollTop;
          return;
        }

        drag.dragging = true;
        content.dataset.dragging = "true";
        const leftover = Math.max(delta - drag.lastScrollTop, 0);
        drag.translation = leftover;
        if (event.cancelable) event.preventDefault();
        setTranslation(drag.translation);
        drag.lastScrollTop = 0;
        return;
      }

      drag.velocity = drag.velocity * 0.65 + (delta / elapsed) * 0.35;
      drag.lastTime = event.timeStamp;
      drag.lastY = touch.clientY;

      let remaining = delta;
      if (remaining < 0 && drag.translation > 0) {
        const consumed = Math.min(drag.translation, -remaining);
        drag.translation -= consumed;
        remaining += consumed;
      }

      if (remaining < 0 && scrollElement) {
        if (!drag.nativeScroll) {
          scrollElement.scrollTop += -remaining;
          if (event.cancelable) event.preventDefault();
        }
        remaining = 0;
      }

      if (remaining > 0) {
        drag.translation += remaining;
        if (event.cancelable) event.preventDefault();
      }
      setTranslation(drag.translation);
    },
    [setTranslation],
  );

  React.useEffect(() => {
    const content = contentElement;
    if (!enabled || !content) return;

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) return;
      const touch = event.touches[0];
      beginDrag(
        event.target,
        touch.clientX,
        touch.clientY,
        event.timeStamp,
        -1,
      );
    };
    const onTouchMove = (event: TouchEvent) => {
      if (event.touches.length !== 1) return;
      moveTouch(event, event.touches[0]);
    };

    content.addEventListener("touchstart", onTouchStart, { passive: true });
    content.addEventListener("touchmove", onTouchMove, { passive: false });
    content.addEventListener("touchend", finishDrag);
    content.addEventListener("touchcancel", finishDrag);
    return () => {
      content.removeEventListener("touchstart", onTouchStart);
      content.removeEventListener("touchmove", onTouchMove);
      content.removeEventListener("touchend", finishDrag);
      content.removeEventListener("touchcancel", finishDrag);
    };
  }, [beginDrag, contentElement, enabled, finishDrag, moveTouch]);

  const onPointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (
        event.pointerType !== "mouse" ||
        !event.isPrimary ||
        event.button !== 0
      )
        return;
      beginDrag(
        event.target,
        event.clientX,
        event.clientY,
        event.timeStamp,
        event.pointerId,
      );
    },
    [beginDrag],
  );
  const onPointerMove = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.pointerType !== "mouse") return;
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      moveDrag(event.clientX, event.clientY, event.timeStamp, () =>
        event.preventDefault(),
      );
      if (
        dragRef.current?.dragging &&
        !event.currentTarget.hasPointerCapture?.(event.pointerId)
      ) {
        event.currentTarget.setPointerCapture?.(event.pointerId);
      }
    },
    [moveDrag],
  );
  const finishPointer = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.pointerType !== "mouse") return;
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture?.(event.pointerId);
      }
      finishDrag();
    },
    [finishDrag],
  );

  return {
    contentRef: setContentRef,
    contentElement,
    dragHandlers: {
      onPointerCancel: finishPointer,
      onPointerDown,
      onPointerMove,
      onPointerUp: finishPointer,
    },
    y,
  };
}

type SheetContentProps = MotionSafeProps<
  React.ComponentProps<typeof DialogPrimitive.Content>
> & {
  animateSize?: boolean;
  closeLabel?: string;
  handleProps?: React.ComponentProps<"div"> & { "data-slot"?: string };
  overlayProps?: MotionSafeProps<
    React.ComponentProps<typeof DialogPrimitive.Overlay>
  > & { "data-slot"?: string };
  onDragDismiss?: () => void;
  showCloseButton?: boolean;
  showHandle?: boolean;
  size?: "content" | "near-full";
};

function SheetContent({
  animateSize = false,
  className,
  children,
  closeLabel = "Close",
  handleProps,
  overlayProps,
  onDragDismiss,
  showCloseButton = true,
  showHandle,
  size = "content",
  onAnimationEnd,
  onPointerCancel,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  ...props
}: SheetContentProps) {
  const {
    dismissible,
    open,
    onAnimationEnd: onSheetAnimationEnd,
    requestClose,
  } = React.useContext(SheetContext);
  const displayHandle = dismissible && (showHandle ?? true);
  const instant = useInstantMotion();
  const { contentElement, contentRef, dragHandlers, y } = useSheetDrag(
    dismissible,
    dismissible,
    requestClose,
    onDragDismiss,
  );
  const [renderedSize, setRenderedSize] = React.useState(size);
  const sizeAnimationFromHeightRef = React.useRef<number | null>(null);
  const sizeAnimationRef = React.useRef<{ stop: () => void } | null>(null);

  React.useLayoutEffect(() => {
    if (!animateSize) {
      if (renderedSize !== size) setRenderedSize(size);
      return;
    }
    if (!contentElement || renderedSize === size) return;

    sizeAnimationRef.current?.stop();
    sizeAnimationRef.current = null;
    sizeAnimationFromHeightRef.current =
      contentElement.getBoundingClientRect().height;
    setRenderedSize(size);
  }, [animateSize, contentElement, renderedSize, size]);

  React.useLayoutEffect(() => {
    if (
      !animateSize ||
      !contentElement ||
      renderedSize !== size ||
      sizeAnimationFromHeightRef.current === null
    ) {
      return;
    }

    const fromHeight = sizeAnimationFromHeightRef.current;
    sizeAnimationFromHeightRef.current = null;
    contentElement.style.height = "";
    const targetHeight = contentElement.getBoundingClientRect().height;

    if (instant || Math.abs(targetHeight - fromHeight) < 1) {
      contentElement.style.height = "";
      return;
    }

    contentElement.style.height = `${fromHeight}px`;
    const animation = animate(
      contentElement,
      { height: targetHeight },
      motionSpring.sheet,
    );
    sizeAnimationRef.current = animation;
    void animation.then(() => {
      if (sizeAnimationRef.current !== animation) return;
      sizeAnimationRef.current = null;
      contentElement.style.height = "";
    });
  }, [animateSize, contentElement, instant, renderedSize, size]);

  React.useEffect(
    () => () => {
      sizeAnimationRef.current?.stop();
      sizeAnimationRef.current = null;
      if (contentElement) contentElement.style.height = "";
    },
    [contentElement],
  );

  return (
    <SheetPortal forceMount>
      <AnimatePresence
        onExitComplete={() => {
          onSheetAnimationEnd?.(false);
        }}
      >
        {open ? (
          <React.Fragment key="sheet-presence">
            <SheetOverlay key="sheet-overlay" {...overlayProps} />
            <MotionSheetContent
              forceMount
              key="sheet-content"
              ref={contentRef}
              data-slot="sheet-content"
              data-presentation="sheet"
              data-size={size}
              initial={instant ? false : { y: "100%" }}
              animate={{ y: 0 }}
              exit={
                instant
                  ? undefined
                  : {
                      y: "100%",
                      transition: {
                        duration: 0.24,
                        ease: [0.32, 0.72, 0, 1],
                      },
                    }
              }
              transition={instant ? { duration: 0 } : motionSpring.sheet}
              style={{ y }}
              className={cn(
                "group/sheet-content fixed inset-x-0 bottom-0 z-50 flex flex-col overflow-hidden rounded-t-4xl bg-popover text-sm text-popover-foreground shadow-xl ring-1 ring-foreground/5 outline-none will-change-transform dark:ring-foreground/10 [&>form]:flex [&>form]:min-h-0 [&>form]:flex-1 [&>form]:flex-col [&>form]:overflow-hidden",
                renderedSize === "content" && "max-h-[80dvh]",
                renderedSize === "near-full" &&
                  "h-[calc(100dvh-max(env(safe-area-inset-top),6dvh)-0.75rem)] max-h-[calc(100dvh-max(env(safe-area-inset-top),6dvh)-0.75rem)]",
                className,
              )}
              onAnimationEnd={onAnimationEnd}
              onAnimationComplete={() => {
                onSheetAnimationEnd?.(true);
              }}
              onPointerCancel={(event) => {
                onPointerCancel?.(event);
                dragHandlers.onPointerCancel(event);
              }}
              onPointerDown={(event) => {
                onPointerDown?.(event);
                if (!event.defaultPrevented) dragHandlers.onPointerDown(event);
              }}
              onPointerMove={(event) => {
                onPointerMove?.(event);
                if (!event.defaultPrevented) dragHandlers.onPointerMove(event);
              }}
              onPointerUp={(event) => {
                onPointerUp?.(event);
                dragHandlers.onPointerUp(event);
              }}
              {...props}
            >
              {displayHandle ? (
                <div
                  data-slot="sheet-handle"
                  aria-hidden="true"
                  className="mx-auto mt-4 h-1 w-12 shrink-0 rounded-full bg-muted-foreground/30"
                  {...handleProps}
                />
              ) : null}
              <SheetPortalContainerContext.Provider value={contentElement}>
                {children}
              </SheetPortalContainerContext.Provider>
              {dismissible && showCloseButton ? (
                <SheetClose asChild>
                  <Button
                    variant="ghost"
                    className="absolute top-4 right-4 bg-secondary"
                    size="icon-sm"
                  >
                    <XIcon />
                    <span className="sr-only">{closeLabel}</span>
                  </Button>
                </SheetClose>
              ) : null}
            </MotionSheetContent>
          </React.Fragment>
        ) : null}
      </AnimatePresence>
    </SheetPortal>
  );
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn(
        "flex shrink-0 flex-col gap-1.5 px-14 py-5 text-center",
        className,
      )}
      {...props}
    />
  );
}

function SheetBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-body"
      className={cn(
        "min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain px-6 py-6",
        className,
      )}
      {...props}
    />
  );
}

function SheetFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & { showCloseButton?: boolean }) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn(
        "flex shrink-0 flex-col-reverse gap-2 px-6 pt-1 pb-[max(env(safe-area-inset-bottom),1.5rem)]",
        className,
      )}
      {...props}
    >
      {children}
      {showCloseButton ? (
        <SheetClose asChild>
          <Button variant="outline">Close</Button>
        </SheetClose>
      ) : null}
    </div>
  );
}

function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="sheet-title"
      className={cn(
        "font-heading text-base leading-none font-medium",
        className,
      )}
      {...props}
    />
  );
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="sheet-description"
      className={cn(
        "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className,
      )}
      {...props}
    />
  );
}

export {
  Sheet,
  SheetBody,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetOverlay,
  SheetPortal,
  SheetTitle,
  SheetTrigger,
  useSheetPortalContainer,
};
export type { SheetContentProps, SheetProps };
