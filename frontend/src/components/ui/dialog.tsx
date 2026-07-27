import * as React from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { Drawer as DrawerPrimitive } from "vaul";
import { XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;

type MobileDialogProps = DistributiveOmit<
  React.ComponentProps<typeof DrawerPrimitive.Root>,
  "children" | "defaultOpen" | "modal" | "onOpenChange" | "open"
>;

type DialogContextValue = {
  isMobile: boolean;
  dismissible: boolean;
};

const DialogContext = React.createContext<DialogContextValue>({
  isMobile: false,
  dismissible: true,
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
  const parent = React.useContext(DialogContext);

  if (isMobile) {
    const dismissible = mobileProps?.dismissible ?? true;
    const Root = parent.isMobile
      ? DrawerPrimitive.NestedRoot
      : DrawerPrimitive.Root;

    return (
      <DialogContext.Provider value={{ isMobile: true, dismissible }}>
        <Root
          {...mobileProps}
          data-slot="dialog"
          defaultOpen={defaultOpen}
          dismissible={dismissible}
          fixed={mobileProps?.fixed ?? true}
          handleOnly={mobileProps?.handleOnly ?? false}
          modal={modal}
          onOpenChange={onOpenChange}
          open={open}
          preventScrollRestoration={
            mobileProps?.preventScrollRestoration ?? true
          }
          scrollLockTimeout={mobileProps?.scrollLockTimeout ?? 0}
          shouldScaleBackground={mobileProps?.shouldScaleBackground ?? true}
        >
          {children}
        </Root>
      </DialogContext.Provider>
    );
  }

  return (
    <DialogContext.Provider value={{ isMobile: false, dismissible: true }}>
      <DialogPrimitive.Root
        data-slot="dialog"
        defaultOpen={defaultOpen}
        modal={modal}
        onOpenChange={onOpenChange}
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
  const { isMobile } = React.useContext(DialogContext);
  const Trigger = isMobile ? DrawerPrimitive.Trigger : DialogPrimitive.Trigger;
  return <Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  const { isMobile } = React.useContext(DialogContext);
  const Portal = isMobile ? DrawerPrimitive.Portal : DialogPrimitive.Portal;
  return <Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  const { isMobile } = React.useContext(DialogContext);
  const Close = isMobile ? DrawerPrimitive.Close : DialogPrimitive.Close;
  return <Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  const { isMobile } = React.useContext(DialogContext);
  const Overlay = isMobile ? DrawerPrimitive.Overlay : DialogPrimitive.Overlay;

  return (
    <Overlay
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
  ...props
}: DialogContentProps) {
  const { dismissible, isMobile } = React.useContext(DialogContext);
  const Content = isMobile ? DrawerPrimitive.Content : DialogPrimitive.Content;
  const displayHandle = showHandle ?? dismissible;

  return (
    <DialogPortal>
      <DialogOverlay />
      <Content
        data-slot="dialog-content"
        data-presentation={isMobile ? "sheet" : "dialog"}
        data-size={isMobile ? mobileSize : undefined}
        className={cn(
          isMobile
            ? "group/dialog-content fixed inset-x-0 bottom-0 z-50 flex max-h-[80dvh] flex-col overflow-hidden rounded-t-xl border-t bg-popover text-sm text-popover-foreground outline-none [&>form]:flex [&>form]:min-h-0 [&>form]:flex-1 [&>form]:flex-col [&>form]:overflow-hidden"
            : "fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-popover p-4 text-sm text-popover-foreground ring-1 ring-foreground/10 duration-(--motion-duration-modal) ease-(--motion-easing-standard) outline-none sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          isMobile &&
            mobileSize === "near-full" &&
            "h-[94dvh] max-h-[calc(100dvh-env(safe-area-inset-top)-0.75rem)] rounded-t-2xl",
          className,
        )}
        {...props}
      >
        {isMobile && displayHandle ? (
          <DrawerPrimitive.Handle
            data-slot="dialog-handle"
            className="mt-4 shrink-0"
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
      </Content>
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
  const { isMobile } = React.useContext(DialogContext);
  const Title = isMobile ? DrawerPrimitive.Title : DialogPrimitive.Title;
  return (
    <Title
      data-slot="dialog-title"
      className={cn(
        "font-heading text-base font-medium",
        !isMobile && "leading-none",
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
  const { isMobile } = React.useContext(DialogContext);
  const Description = isMobile
    ? DrawerPrimitive.Description
    : DialogPrimitive.Description;
  return (
    <Description
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
