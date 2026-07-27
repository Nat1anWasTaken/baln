import * as React from "react";
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
import { cn } from "@/lib/utils";

const AlertDialogContext = React.createContext<{
  isMobile: boolean;
  onOpenChange?: (open: boolean) => void;
}>({ isMobile: false });

function AlertDialog({
  children,
  defaultOpen,
  onOpenChange,
  open,
}: React.ComponentProps<typeof AlertDialogPrimitive.Root>) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <AlertDialogContext.Provider value={{ isMobile: true, onOpenChange }}>
        <Dialog
          defaultOpen={defaultOpen}
          onOpenChange={onOpenChange}
          open={open}
        >
          {children}
        </Dialog>
      </AlertDialogContext.Provider>
    );
  }

  return (
    <AlertDialogContext.Provider value={{ isMobile: false, onOpenChange }}>
      <AlertDialogPrimitive.Root
        defaultOpen={defaultOpen}
        onOpenChange={onOpenChange}
        open={open}
      >
        {children}
      </AlertDialogPrimitive.Root>
    </AlertDialogContext.Provider>
  );
}

function AlertDialogTrigger({
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Trigger>) {
  const { isMobile } = React.useContext(AlertDialogContext);
  if (isMobile) {
    return <DialogTrigger data-slot="alert-dialog-trigger" {...props} />;
  }
  return (
    <AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />
  );
}

function AlertDialogContent({
  className,
  size = "default",
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Content> & {
  size?: "default" | "sm";
}) {
  const { isMobile } = React.useContext(AlertDialogContext);

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
    <AlertDialogPrimitive.Portal data-slot="alert-dialog-portal">
      <AlertDialogPrimitive.Overlay
        data-slot="alert-dialog-overlay"
        className="fixed inset-0 z-50 bg-black/10 duration-(--motion-duration-modal) ease-(--motion-easing-standard) supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0"
      />
      <AlertDialogPrimitive.Content
        data-slot="alert-dialog-content"
        data-size={size}
        className={cn(
          "group/alert-dialog-content fixed top-1/2 left-1/2 z-50 grid w-full -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-popover p-4 text-popover-foreground ring-1 ring-foreground/10 duration-(--motion-duration-modal) ease-(--motion-easing-standard) outline-none data-[size=default]:max-w-xs data-[size=sm]:max-w-xs data-[size=default]:sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          className,
        )}
        {...props}
      />
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
        "grid grid-rows-[auto_1fr] place-items-center gap-1.5 text-center has-data-[slot=alert-dialog-media]:grid-rows-[auto_auto_1fr] has-data-[slot=alert-dialog-media]:gap-x-4 sm:group-data-[size=default]/alert-dialog-content:place-items-start sm:group-data-[size=default]/alert-dialog-content:text-left sm:group-data-[size=default]/alert-dialog-content:has-data-[slot=alert-dialog-media]:grid-rows-[auto_1fr]",
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
        "-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 group-data-[size=sm]/alert-dialog-content:grid group-data-[size=sm]/alert-dialog-content:grid-cols-2 sm:flex-row sm:justify-end",
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
        "mb-2 inline-flex size-10 items-center justify-center rounded-md bg-muted sm:group-data-[size=default]/alert-dialog-content:row-span-2 *:[svg:not([class*='size-'])]:size-6",
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
        "font-heading text-base font-medium sm:group-data-[size=default]/alert-dialog-content:group-has-data-[slot=alert-dialog-media]/alert-dialog-content:col-start-2",
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
