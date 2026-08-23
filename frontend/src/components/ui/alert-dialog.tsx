import * as React from "react";
import { AnimatePresence, m } from "motion/react";
import { AlertDialog as AlertDialogPrimitive } from "radix-ui";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  modalMotion,
  type MotionSafeProps,
  PressMotionBoundary,
  useInstantMotion,
  useOwnedPressMotionProps,
} from "@/lib/motion";
import { cn } from "@/lib/utils";

const MotionAlertDialogOverlay = m.create(AlertDialogPrimitive.Overlay);
const MotionAlertDialogContent = m.create(AlertDialogPrimitive.Content);
const MotionAlertDialogTrigger = m.create(AlertDialogPrimitive.Trigger);

const AlertDialogContext = React.createContext<{
  isMobile: boolean;
  open: boolean;
  onOpenChange?: (open: boolean) => void;
}>({ isMobile: false, open: false });

function AlertDialog({
  children,
  defaultOpen,
  onOpenChange,
  open,
}: React.ComponentProps<typeof AlertDialogPrimitive.Root>) {
  const isMobile = useIsMobile();
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen ?? false);
  const resolvedOpen = open ?? internalOpen;
  const changeOpen = (nextOpen: boolean) => {
    setInternalOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };

  if (isMobile) {
    return (
      <AlertDialogContext.Provider
        value={{ isMobile: true, onOpenChange: changeOpen, open: resolvedOpen }}
      >
        <Dialog onOpenChange={changeOpen} open={resolvedOpen}>
          {children}
        </Dialog>
      </AlertDialogContext.Provider>
    );
  }

  return (
    <AlertDialogContext.Provider
      value={{ isMobile: false, onOpenChange: changeOpen, open: resolvedOpen }}
    >
      <AlertDialogPrimitive.Root onOpenChange={changeOpen} open={resolvedOpen}>
        {children}
      </AlertDialogPrimitive.Root>
    </AlertDialogContext.Provider>
  );
}

function AlertDialogTrigger({
  ...props
}: MotionSafeProps<React.ComponentProps<typeof AlertDialogPrimitive.Trigger>>) {
  const { isMobile } = React.useContext(AlertDialogContext);
  const pressMotion = useOwnedPressMotionProps(
    "control",
    Boolean(props.disabled),
  );
  if (isMobile) {
    return <DialogTrigger data-slot="alert-dialog-trigger" {...props} />;
  }
  return (
    <PressMotionBoundary>
      <MotionAlertDialogTrigger
        data-slot="alert-dialog-trigger"
        {...pressMotion}
        {...props}
      />
    </PressMotionBoundary>
  );
}

function AlertDialogContent({
  className,
  size = "default",
  ...props
}: MotionSafeProps<
  React.ComponentProps<typeof AlertDialogPrimitive.Content>
> & {
  size?: "default" | "sm";
}) {
  const { isMobile, open } = React.useContext(AlertDialogContext);
  const instant = useInstantMotion();

  if (isMobile) {
    return (
      <DialogContent
        data-slot="alert-dialog-content"
        role="alertdialog"
        data-size={size}
        showCloseButton={false}
        className={cn(
          "group/alert-dialog-content text-popover-foreground",
          className,
        )}
        {...props}
      />
    );
  }

  return (
    <AlertDialogPrimitive.Portal forceMount data-slot="alert-dialog-portal">
      <AnimatePresence>
        {open ? (
          <React.Fragment key="alert-dialog-presence">
            <MotionAlertDialogOverlay
              forceMount
              key="alert-dialog-overlay"
              data-slot="alert-dialog-overlay"
              initial={instant ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={
                instant
                  ? undefined
                  : { opacity: 0, transition: { duration: 0.16 } }
              }
              transition={{ duration: instant ? 0 : 0.2 }}
              className="fixed inset-0 z-50 bg-black/30 supports-backdrop-filter:backdrop-blur-sm"
            />
            <MotionAlertDialogContent
              forceMount
              key="alert-dialog-content"
              data-slot="alert-dialog-content"
              data-size={size}
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
                "group/alert-dialog-content fixed top-1/2 left-1/2 z-50 grid w-full -translate-x-1/2 -translate-y-1/2 gap-6 rounded-4xl bg-popover p-6 text-popover-foreground shadow-xl ring-1 ring-foreground/5 outline-none data-[size=default]:max-w-xs data-[size=sm]:max-w-xs data-[size=default]:sm:max-w-md dark:ring-foreground/10",
                className,
              )}
              {...props}
            />
          </React.Fragment>
        ) : null}
      </AnimatePresence>
    </AlertDialogPrimitive.Portal>
  );
}

function AlertDialogHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const { isMobile } = React.useContext(AlertDialogContext);
  if (isMobile) {
    return (
      <DialogHeader
        data-slot="alert-dialog-header"
        className={cn("items-center gap-1.5", className)}
        {...props}
      />
    );
  }
  return (
    <div
      data-slot="alert-dialog-header"
      className={cn(
        "grid grid-rows-[auto_1fr] place-items-center gap-1.5 text-center has-data-[slot=alert-dialog-media]:grid-rows-[auto_auto_1fr] has-data-[slot=alert-dialog-media]:gap-x-6 sm:group-data-[size=default]/alert-dialog-content:place-items-start sm:group-data-[size=default]/alert-dialog-content:text-left sm:group-data-[size=default]/alert-dialog-content:has-data-[slot=alert-dialog-media]:grid-rows-[auto_1fr]",
        className,
      )}
      {...props}
    />
  );
}

function AlertDialogFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const { isMobile } = React.useContext(AlertDialogContext);
  if (isMobile) {
    return (
      <DialogFooter
        data-slot="alert-dialog-footer"
        className={cn(
          "group-data-[size=sm]/alert-dialog-content:grid group-data-[size=sm]/alert-dialog-content:grid-cols-2",
          className,
        )}
        {...props}
      />
    );
  }
  return (
    <div
      data-slot="alert-dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 group-data-[size=sm]/alert-dialog-content:grid group-data-[size=sm]/alert-dialog-content:grid-cols-2 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    />
  );
}

function AlertDialogMedia({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-media"
      className={cn(
        "mb-2 inline-flex size-16 items-center justify-center rounded-full bg-muted sm:group-data-[size=default]/alert-dialog-content:row-span-2 *:[svg:not([class*='size-'])]:size-8",
        className,
      )}
      {...props}
    />
  );
}

function AlertDialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Title>) {
  const { isMobile } = React.useContext(AlertDialogContext);
  if (isMobile) {
    return (
      <DialogTitle
        data-slot="alert-dialog-title"
        className={className}
        {...props}
      />
    );
  }
  return (
    <AlertDialogPrimitive.Title
      data-slot="alert-dialog-title"
      className={cn(
        "font-heading text-base leading-none font-medium sm:group-data-[size=default]/alert-dialog-content:group-has-data-[slot=alert-dialog-media]/alert-dialog-content:col-start-2",
        className,
      )}
      {...props}
    />
  );
}

function AlertDialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Description>) {
  const { isMobile } = React.useContext(AlertDialogContext);
  const sharedClassName = cn(
    "text-sm text-balance text-muted-foreground md:text-pretty *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
    className,
  );
  if (isMobile) {
    return (
      <DialogDescription
        data-slot="alert-dialog-description"
        className={sharedClassName}
        {...props}
      />
    );
  }
  return (
    <AlertDialogPrimitive.Description
      data-slot="alert-dialog-description"
      className={sharedClassName}
      {...props}
    />
  );
}

function AlertDialogAction({
  className,
  variant = "default",
  size = "default",
  loading = false,
  onClick,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Action> &
  Pick<React.ComponentProps<typeof Button>, "variant" | "size" | "loading">) {
  const { isMobile, onOpenChange } = React.useContext(AlertDialogContext);
  const Action = isMobile ? DialogClose : AlertDialogPrimitive.Action;
  return (
    <Button variant={variant} size={size} loading={loading} asChild>
      <Action
        data-slot="alert-dialog-action"
        className={cn(className)}
        onClick={(event) => {
          onClick?.(event);
          if (isMobile && !event.defaultPrevented) onOpenChange?.(false);
        }}
        {...props}
      />
    </Button>
  );
}

function AlertDialogCancel({
  className,
  variant = "outline",
  size = "default",
  onClick,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Cancel> &
  Pick<React.ComponentProps<typeof Button>, "variant" | "size">) {
  const { isMobile, onOpenChange } = React.useContext(AlertDialogContext);
  const Cancel = isMobile ? DialogClose : AlertDialogPrimitive.Cancel;
  return (
    <Button variant={variant} size={size} asChild>
      <Cancel
        data-slot="alert-dialog-cancel"
        className={cn(className)}
        onClick={(event) => {
          onClick?.(event);
          if (isMobile && !event.defaultPrevented) onOpenChange?.(false);
        }}
        {...props}
      />
    </Button>
  );
}

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
};
