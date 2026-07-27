import * as React from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

type MobileDialogProps = {
  dismissible?: boolean;
  onAnimationEnd?: (open: boolean) => void;
};

type DialogContextValue = {
  dismissible: boolean;
  isMobile: boolean;
  onAnimationEnd?: (open: boolean) => void;
  requestClose: () => void;
};

const DialogContext = React.createContext<DialogContextValue>({
  dismissible: true,
  isMobile: false,
  requestClose: () => undefined,
});

type DialogProps = React.ComponentProps<typeof DialogPrimitive.Root> & {
  mobileProps?: MobileDialogProps;
};

function Dialog({
  children,
  defaultOpen,
  modal,
  mobileProps,
  onOpenChange,
  open,
}: DialogProps) {
  const isMobile = useIsMobile();
  const dismissible = !isMobile || (mobileProps?.dismissible ?? true);
  const requestClose = React.useCallback(() => {
    if (dismissible) onOpenChange?.(false);
  }, [dismissible, onOpenChange]);

  return (
    <DialogContext.Provider
      value={{
        dismissible,
        isMobile,
        onAnimationEnd: isMobile ? mobileProps?.onAnimationEnd : undefined,
        requestClose,
      }}
    >
      <DialogPrimitive.Root
        data-slot="dialog"
        defaultOpen={defaultOpen}
        modal={modal}
        onOpenChange={(nextOpen) => {
          if (nextOpen || dismissible) onOpenChange?.(nextOpen);
        }}
        open={open}
      >
        {children}
      </DialogPrimitive.Root>
    </DialogContext.Provider>
  );
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  const { isMobile } = React.useContext(DialogContext);

  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      data-presentation={isMobile ? "sheet" : "dialog"}
      className={cn(
        "fixed inset-0 z-50 bg-black/10 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        isMobile
          ? "duration-(--motion-duration-drawer) ease-(--motion-easing-standard)"
          : "isolate duration-(--motion-duration-modal) ease-(--motion-easing-standard)",
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
) {
  const contentRef = React.useRef<HTMLDivElement>(null);
  const dragRef = React.useRef<DragState | null>(null);
  const inertiaFrameRef = React.useRef<number | null>(null);

  const stopInertia = React.useCallback(() => {
    if (inertiaFrameRef.current !== null) {
      cancelAnimationFrame(inertiaFrameRef.current);
      inertiaFrameRef.current = null;
    }
  }, []);

  React.useEffect(() => stopInertia, [stopInertia]);

  const setTranslation = React.useCallback((translation: number) => {
    const content = contentRef.current;
    if (!content) return;
    content.style.setProperty(
      "--sheet-drag-y",
      `${Math.max(translation, 0)}px`,
    );
  }, []);

  const settle = React.useCallback(
    (dismiss: boolean) => {
      const content = contentRef.current;
      const drag = dragRef.current;
      if (!content || !drag) return;

      content.dataset.dragging = "false";
      if (dismiss) {
        setTranslation(content.getBoundingClientRect().height);
        requestClose();
      }

      requestAnimationFrame(() => {
        requestAnimationFrame(() => setTranslation(0));
      });
      dragRef.current = null;
    },
    [requestClose, setTranslation],
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

      if (remaining > 0) {
        drag.translation += remaining;
      }
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
      (drag.translation > content.getBoundingClientRect().height * 0.25 ||
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
    const content = contentRef.current;
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
  }, [beginDrag, enabled, finishDrag, moveTouch]);

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
    },
    [moveDrag],
  );
  const finishPointer = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.pointerType !== "mouse") return;
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      finishDrag();
    },
    [finishDrag],
  );

  return {
    contentRef,
    dragHandlers: {
      onPointerCancel: finishPointer,
      onPointerDown,
      onPointerMove,
      onPointerUp: finishPointer,
    },
  };
}

type DialogContentProps = React.ComponentProps<
  typeof DialogPrimitive.Content
> & {
  mobileSize?: "content" | "near-full";
  showCloseButton?: boolean;
  showHandle?: boolean;
};

function DialogContent({
  className,
  children,
  mobileSize = "content",
  showCloseButton = true,
  showHandle,
  onAnimationEnd,
  onPointerCancel,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  ...props
}: DialogContentProps) {
  const {
    dismissible,
    isMobile,
    onAnimationEnd: onMobileAnimationEnd,
    requestClose,
  } = React.useContext(DialogContext);
  const displayHandle = showHandle ?? dismissible;
  const { contentRef, dragHandlers } = useSheetDrag(
    isMobile,
    dismissible,
    requestClose,
  );

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={isMobile ? contentRef : undefined}
        data-slot="dialog-content"
        data-presentation={isMobile ? "sheet" : "dialog"}
        data-size={isMobile ? mobileSize : undefined}
        className={cn(
          isMobile
            ? "group/dialog-content fixed inset-x-0 bottom-0 z-50 flex max-h-[80dvh] flex-col overflow-hidden rounded-t-xl border-t bg-popover text-sm text-popover-foreground outline-none [transform:translate3d(0,var(--sheet-drag-y,0px),0)] transition-transform duration-(--motion-duration-drawer) ease-(--motion-easing-standard) will-change-transform data-[dragging=true]:duration-0 data-open:animate-in data-open:slide-in-from-bottom-full data-closed:animate-out data-closed:slide-out-to-bottom-full [&>form]:flex [&>form]:min-h-0 [&>form]:flex-1 [&>form]:flex-col [&>form]:overflow-hidden"
            : "fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-popover p-4 text-sm text-popover-foreground ring-1 ring-foreground/10 duration-(--motion-duration-modal) ease-(--motion-easing-standard) outline-none sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          isMobile &&
            mobileSize === "near-full" &&
            "h-[94dvh] max-h-[calc(100dvh-env(safe-area-inset-top)-0.75rem)] rounded-t-2xl",
          className,
        )}
        onAnimationEnd={(event) => {
          onAnimationEnd?.(event);
          if (isMobile && event.currentTarget === event.target) {
            onMobileAnimationEnd?.(
              event.currentTarget.dataset.state === "open",
            );
          }
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
        {isMobile && displayHandle ? (
          <div
            data-slot="dialog-handle"
            aria-hidden="true"
            className="mx-auto mt-4 h-1 w-12 shrink-0 rounded-full bg-muted-foreground/30"
          />
        ) : null}
        {children}
        {showCloseButton ? (
          <DialogClose asChild>
            <Button
              variant="ghost"
              className={cn("absolute right-2", isMobile ? "top-3" : "top-2")}
              size="icon-sm"
            >
              <XIcon />
              <span className="sr-only">Close</span>
            </Button>
          </DialogClose>
        ) : null}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  const { isMobile } = React.useContext(DialogContext);
  return (
    <div
      data-slot="dialog-header"
      className={cn(
        "flex shrink-0 flex-col",
        isMobile ? "gap-0.5 px-12 py-4 text-center" : "gap-2",
        className,
      )}
      {...props}
    />
  );
}

function DialogBody({ className, ...props }: React.ComponentProps<"div">) {
  const { isMobile } = React.useContext(DialogContext);
  return (
    <div
      data-slot="dialog-body"
      className={cn(
        isMobile ? "min-h-0 flex-1 overflow-y-auto px-4 py-5" : "py-5",
        className,
      )}
      {...props}
    />
  );
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean;
}) {
  const { isMobile } = React.useContext(DialogContext);
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex shrink-0 flex-col-reverse gap-2 border-t bg-muted/50 p-4",
        isMobile
          ? "pb-[max(env(safe-area-inset-bottom),1rem)]"
          : "-mx-4 -mb-4 rounded-b-xl sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    >
      {children}
      {showCloseButton ? (
        <DialogClose asChild>
          <Button variant="outline">Close</Button>
        </DialogClose>
      ) : null}
    </div>
  );
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("font-heading text-base font-medium", className)}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className,
      )}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
};
