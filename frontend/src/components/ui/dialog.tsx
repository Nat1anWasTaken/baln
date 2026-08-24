import * as React from "react";
import { AnimatePresence, m } from "motion/react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  useSheetPortalContainer,
} from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  modalMotion,
  type MotionSafeProps,
  PressMotionBoundary,
  type PressFeedback,
  useInstantMotion,
  useOwnedPressMotionProps,
} from "@/lib/motion";
import { cn } from "@/lib/utils";

const MotionDialogOverlay = m.create(DialogPrimitive.Overlay);
const MotionDialogContent = m.create(DialogPrimitive.Content);
const MotionDialogTrigger = m.create(DialogPrimitive.Trigger);

type MobileDialogProps = {
  dismissible?: boolean;
  onAnimationEnd?: (open: boolean) => void;
};

type DialogContextValue = {
  dismissible: boolean;
  isMobile: boolean;
  open: boolean;
};

const DialogContext = React.createContext<DialogContextValue>({
  dismissible: true,
  isMobile: false,
  open: false,
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
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen ?? false);
  const resolvedOpen = open ?? internalOpen;
  const dismissible = !isMobile || (mobileProps?.dismissible ?? true);
  const changeOpen = React.useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen && !dismissible) return;
      setInternalOpen(nextOpen);
      onOpenChange?.(nextOpen);
    },
    [dismissible, onOpenChange],
  );

  const context = (
    <DialogContext.Provider
      value={{ dismissible, isMobile, open: resolvedOpen }}
    >
      {children}
    </DialogContext.Provider>
  );

  if (isMobile) {
    return (
      <Sheet
        data-slot="dialog"
        dismissible={dismissible}
        modal={modal}
        onAnimationEnd={mobileProps?.onAnimationEnd}
        onOpenChange={changeOpen}
        open={resolvedOpen}
      >
        {context}
      </Sheet>
    );
  }

  return (
    <DialogPrimitive.Root
      data-slot="dialog"
      modal={modal}
      onOpenChange={changeOpen}
      open={resolvedOpen}
    >
      {context}
    </DialogPrimitive.Root>
  );
}

function DialogTrigger({
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
      <MotionDialogTrigger
        data-slot="dialog-trigger"
        {...pressMotion}
        {...props}
      />
    </PressMotionBoundary>
  );
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
}: MotionSafeProps<React.ComponentProps<typeof DialogPrimitive.Overlay>>) {
  const instant = useInstantMotion();

  return (
    <MotionDialogOverlay
      forceMount
      data-slot="dialog-overlay"
      data-presentation="dialog"
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

type DialogContentProps = MotionSafeProps<
  React.ComponentProps<typeof DialogPrimitive.Content>
> & {
  closeLabel?: string;
  mobileSize?: "content" | "near-full";
  showCloseButton?: boolean;
  showHandle?: boolean;
};

function DialogContent({
  className,
  children,
  closeLabel = "Close",
  mobileSize = "content",
  showCloseButton = true,
  showHandle,
  ...props
}: DialogContentProps) {
  const { dismissible, isMobile, open } = React.useContext(DialogContext);
  const instant = useInstantMotion();

  if (isMobile) {
    return (
      <SheetContent
        data-slot="dialog-content"
        data-presentation="sheet"
        className={cn("group/dialog-content", className)}
        closeLabel={closeLabel}
        handleProps={{ "data-slot": "dialog-handle" }}
        overlayProps={{ "data-slot": "dialog-overlay" }}
        showCloseButton={showCloseButton}
        showHandle={showHandle}
        size={mobileSize}
        {...props}
      >
        {children}
      </SheetContent>
    );
  }

  return (
    <DialogPortal forceMount>
      <AnimatePresence>
        {open ? (
          <React.Fragment key="dialog-presence">
            <DialogOverlay key="dialog-overlay" />
            <MotionDialogContent
              forceMount
              key="dialog-content"
              data-slot="dialog-content"
              data-presentation="dialog"
              initial={instant ? false : modalMotion.initial}
              animate={modalMotion.animate}
              exit={
                instant
                  ? undefined
                  : {
                      ...modalMotion.exit,
                      transition: modalMotion.exitTransition,
                    }
              }
              transition={instant ? { duration: 0 } : modalMotion.transition}
              className={cn(
                "fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-6 rounded-4xl bg-popover p-6 text-sm text-popover-foreground shadow-xl ring-1 ring-foreground/5 outline-none sm:max-w-md dark:ring-foreground/10",
                className,
              )}
              {...props}
            >
              {children}
              {dismissible && showCloseButton ? (
                <DialogClose asChild>
                  <Button
                    variant="ghost"
                    className="absolute top-4 right-4 bg-secondary"
                    size="icon-sm"
                  >
                    <XIcon />
                    <span className="sr-only">{closeLabel}</span>
                  </Button>
                </DialogClose>
              ) : null}
            </MotionDialogContent>
          </React.Fragment>
        ) : null}
      </AnimatePresence>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  const { isMobile } = React.useContext(DialogContext);
  if (isMobile) {
    return (
      <SheetHeader data-slot="dialog-header" className={className} {...props} />
    );
  }
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex shrink-0 flex-col gap-1.5", className)}
      {...props}
    />
  );
}

function DialogBody({ className, ...props }: React.ComponentProps<"div">) {
  const { isMobile } = React.useContext(DialogContext);
  if (isMobile) {
    return (
      <SheetBody data-slot="dialog-body" className={className} {...props} />
    );
  }
  return (
    <div data-slot="dialog-body" className={cn("py-1", className)} {...props} />
  );
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & { showCloseButton?: boolean }) {
  const { isMobile } = React.useContext(DialogContext);
  if (isMobile) {
    return (
      <SheetFooter
        data-slot="dialog-footer"
        className={className}
        showCloseButton={showCloseButton}
        {...props}
      >
        {children}
      </SheetFooter>
    );
  }
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex shrink-0 flex-col-reverse gap-2 px-0 pt-1 pb-0 sm:flex-row sm:justify-end",
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
      className={cn(
        "font-heading text-base leading-none font-medium",
        className,
      )}
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

const useDialogPortalContainer = useSheetPortalContainer;

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
  useDialogPortalContainer,
};
