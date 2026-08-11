import { Suspense, useState } from "react";
import {
  ChevronUp,
  CircleUserRound,
  Ellipsis,
  KeyRound,
  PlugZap,
  LogOut,
  LoaderCircle,
  Plus,
  BarChart3,
  RefreshCw,
  WalletCards,
} from "lucide-react";
import { Outlet, useLocation } from "react-router-dom";
import { toast } from "sonner";

import { useAuth } from "@/auth/auth-context";
import { BrandIcon } from "@/components/brand-icon";
import {
  InstallAppDialog,
  InstallAppMenuItem,
  type InstructionPlatform,
} from "@/components/install-app-menu-item";
import {
  ActiveNavigationIndicator,
  AppLink,
  AppNavLink,
  AppRouteTransition,
  useAppNavigate,
} from "@/components/navigation-transition";
import { PageLoading } from "@/components/page-state";
import { OfflineBanner } from "@/components/offline-state";
import { usePwaUpdate } from "@/components/pwa-update-prompt";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  pageNameForPath,
  primaryNavigation,
  type PrimaryNavigationItem,
} from "@/lib/app-navigation";
import { entryEditorRouteState } from "@/lib/entry-navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

type MobileNavigationItem = PrimaryNavigationItem & {
  primary?: boolean;
  more?: boolean;
};

const mobileNavigation: MobileNavigationItem[] = [
  primaryNavigation[0],
  primaryNavigation[1],
  {
    to: "/entries/new",
    label: "新增",
    icon: Plus,
    end: true,
    primary: true,
  },
  primaryNavigation.find((item) => item.to === "/budgets")!,
  {
    to: "#more",
    label: "更多",
    icon: Ellipsis,
    more: true,
  },
];

function UserMenu({ compact = false }: { compact?: boolean }) {
  const auth = useAuth();
  const navigate = useAppNavigate();
  const { checkForUpdate, isChecking } = usePwaUpdate();
  const [installInstructionsPlatform, setInstallInstructionsPlatform] =
    useState<InstructionPlatform | null>(null);

  async function handleLogout() {
    try {
      await auth.logout();
      navigate("/login", { replace: true, transitionIntent: "none" });
    } catch {
      toast.error("登出失敗，請再試一次。");
    }
  }

  async function handleCheckForUpdate() {
    try {
      const hasUpdate = await checkForUpdate();
      if (!hasUpdate) toast.success("Baln 已是最新版本");
    } catch {
      toast.error("無法檢查更新，請稍後再試。");
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size={compact ? "icon" : "default"}
          className={compact ? undefined : "w-full justify-start"}
          aria-label={compact ? "開啟使用者選單" : undefined}
        >
          <CircleUserRound aria-hidden="true" />
          {!compact && (
            <>
              <span className="min-w-0 flex-1 truncate text-left">
                {auth.user?.display_name}
              </span>
              <ChevronUp className="size-3.5" aria-hidden="true" />
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-60" align="end">
        <DropdownMenuLabel className="grid gap-0.5">
          <span>{auth.user?.display_name}</span>
          <span className="truncate text-xs font-normal text-muted-foreground">
            {auth.user?.email}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            window.requestAnimationFrame(() =>
              navigate("/settings/api-tokens"),
            );
          }}
        >
          <KeyRound aria-hidden="true" />
          API 權杖
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            window.requestAnimationFrame(() =>
              navigate("/settings/connected-apps"),
            );
          }}
        >
          <PlugZap aria-hidden="true" />
          已連接的應用程式
        </DropdownMenuItem>
        <InstallAppMenuItem onInstructions={setInstallInstructionsPlatform} />
        <DropdownMenuItem
          disabled={isChecking}
          onSelect={() => void handleCheckForUpdate()}
        >
          {isChecking ? (
            <LoaderCircle className="animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw aria-hidden="true" />
          )}
          檢查更新
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => void handleLogout()}
          variant="destructive"
        >
          <LogOut aria-hidden="true" />
          登出
        </DropdownMenuItem>
      </DropdownMenuContent>
      <InstallAppDialog
        instructionPlatform={installInstructionsPlatform}
        onOpenChange={(open) => {
          if (!open) setInstallInstructionsPlatform(null);
        }}
      />
    </DropdownMenu>
  );
}

export function AppShell() {
  const auth = useAuth();
  const navigate = useAppNavigate();
  const location = useLocation();
  const pageName = pageNameForPath(location.pathname);
  const isMobileNavigationActive = (to: string) => {
    if (to === "/") return location.pathname === "/";
    if (to === "/entries/new") return location.pathname === "/entries/new";
    if (to === "/entries") {
      return (
        location.pathname.startsWith("/entries") &&
        location.pathname !== "/entries/new"
      );
    }
    if (to === "/budgets") return location.pathname.startsWith("/budgets");
    return location.pathname === to;
  };

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <div className="flex h-10 items-center gap-2 px-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <BrandIcon className="size-4" aria-hidden="true" />
            </div>
            <span className="font-heading font-semibold group-data-[collapsible=icon]:hidden">
              Baln
            </span>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {primaryNavigation.map((item) => (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton asChild tooltip={item.label}>
                      <AppNavLink
                        to={item.to}
                        end={item.end}
                        className={({ isActive }) =>
                          `relative isolate ${isActive ? "font-medium" : ""}`
                        }
                      >
                        {({ isActive }) => (
                          <>
                            {isActive ? (
                              <ActiveNavigationIndicator className="bg-sidebar-accent" />
                            ) : null}
                            <item.icon aria-hidden="true" />
                            <span>{item.label}</span>
                          </>
                        )}
                      </AppNavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <UserMenu />
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="min-w-0 pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur">
          <SidebarTrigger className="hidden md:inline-flex" />
          <h1 className="app-page-title min-w-0 flex-1 truncate font-heading text-lg font-semibold">
            {pageName}
          </h1>
          <div className="md:hidden">
            <UserMenu compact />
          </div>
          <ThemeToggle />
          {auth.isReadOnly ? (
            <Button
              type="button"
              size="sm"
              className="hidden sm:inline-flex"
              disabled
              title="離線模式僅供檢視"
            >
              <Plus aria-hidden="true" />
              新增交易
            </Button>
          ) : (
            <Button asChild size="sm" className="hidden sm:inline-flex">
              <AppNavLink
                to="/entries/new"
                state={entryEditorRouteState(location)}
              >
                <Plus aria-hidden="true" />
                新增交易
              </AppNavLink>
            </Button>
          )}
        </header>
        <OfflineBanner />
        <div className="mx-auto w-full max-w-7xl flex-1 overflow-x-clip p-4 md:p-6">
          <Suspense fallback={<PageLoading rows={4} />}>
            <AppRouteTransition>
              <Outlet />
            </AppRouteTransition>
          </Suspense>
        </div>
      </SidebarInset>

      <nav
        aria-label="主要導覽"
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 items-center border-t bg-background/95 px-2 pb-[max(env(safe-area-inset-bottom),0.375rem)] pt-1.5 backdrop-blur md:hidden"
      >
        {mobileNavigation.map((item) => {
          const isActive = item.more
            ? location.pathname === "/accounts" ||
              location.pathname === "/reports"
            : isMobileNavigationActive(item.to);
          const disabled = auth.isReadOnly && item.primary;

          if (item.more) {
            return (
              <DropdownMenu key={item.to}>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    aria-label="更多導覽"
                    aria-current={isActive ? "page" : undefined}
                    className={`touch-press-frameless relative isolate h-14 min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-xs ${
                      isActive
                        ? "font-semibold text-foreground"
                        : "text-muted-foreground"
                    }`}
                  >
                    {isActive ? (
                      <ActiveNavigationIndicator className="bg-muted/70" />
                    ) : null}
                    <Ellipsis className="size-5" aria-hidden="true" />
                    <span>更多</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  side="top"
                  align="end"
                  sideOffset={10}
                  className="w-48"
                >
                  <DropdownMenuItem
                    onSelect={() =>
                      window.requestAnimationFrame(() => navigate("/accounts"))
                    }
                  >
                    <WalletCards aria-hidden="true" />
                    帳戶
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() =>
                      window.requestAnimationFrame(() => navigate("/reports"))
                    }
                  >
                    <BarChart3 aria-hidden="true" />
                    報表
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            );
          }

          if (disabled) {
            return (
              <Button
                key={item.to}
                type="button"
                variant="ghost"
                disabled
                aria-label="新增交易（離線模式不可用）"
                className="relative isolate h-14 min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-xs text-muted-foreground opacity-50"
              >
                <span className="flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
                  <item.icon className="size-5" aria-hidden="true" />
                </span>
                <span className="truncate">{item.label}</span>
              </Button>
            );
          }

          return (
            <AppLink
              key={item.to}
              to={item.to}
              state={
                item.to === "/entries/new"
                  ? entryEditorRouteState(location)
                  : undefined
              }
              aria-label={item.primary ? "新增交易" : undefined}
              aria-current={isActive ? "page" : undefined}
              className={`touch-press touch-press-frameless relative isolate flex h-14 min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-xs outline-none active:bg-muted active:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 ${
                isActive
                  ? "font-semibold text-foreground"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              }`}
            >
              {isActive && !item.primary ? (
                <ActiveNavigationIndicator className="bg-muted/70" />
              ) : null}
              {item.primary ? (
                <span className="flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
                  <item.icon className="size-5" aria-hidden="true" />
                </span>
              ) : (
                <item.icon className="size-5" aria-hidden="true" />
              )}
              <span className="truncate">{item.label}</span>
            </AppLink>
          );
        })}
      </nav>
    </SidebarProvider>
  );
}
