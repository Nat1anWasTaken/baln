import {
  ArrowLeftRight,
  BarChart3,
  ChevronUp,
  CircleUserRound,
  LayoutDashboard,
  KeyRound,
  type LucideIcon,
  PlugZap,
  LogOut,
  Plus,
  WalletCards,
} from "lucide-react";
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { toast } from "sonner";

import { useAuth } from "@/auth/auth-context";
import { BrandIcon } from "@/components/brand-icon";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
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

type NavigationItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  primary?: boolean;
};

const navigation: NavigationItem[] = [
  { to: "/", label: "總覽", icon: LayoutDashboard, end: true },
  { to: "/entries", label: "交易", icon: ArrowLeftRight },
  { to: "/accounts", label: "帳戶", icon: WalletCards },
  { to: "/reports", label: "報表", icon: BarChart3 },
];

const mobileNavigation: NavigationItem[] = [
  navigation[0],
  navigation[1],
  {
    to: "/entries/new",
    label: "新增",
    icon: Plus,
    end: true,
    primary: true,
  },
  navigation[2],
  navigation[3],
];

const pageNames: Record<string, string> = {
  "/": "總覽",
  "/entries": "交易",
  "/entries/new": "新增交易",
  "/accounts": "帳戶",
  "/reports": "報表",
  "/settings/api-tokens": "API 權杖",
  "/settings/connected-apps": "已連接的應用程式",
};

function UserMenu({ compact = false }: { compact?: boolean }) {
  const auth = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    try {
      await auth.logout();
      navigate("/login", { replace: true });
    } catch {
      toast.error("登出失敗，請再試一次。");
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
        <DropdownMenuItem onSelect={() => navigate("/settings/api-tokens")}>
          <KeyRound aria-hidden="true" />
          API 權杖
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate("/settings/connected-apps")}>
          <PlugZap aria-hidden="true" />
          已連接的應用程式
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
    </DropdownMenu>
  );
}

export function AppShell() {
  const location = useLocation();
  const pageName =
    pageNames[location.pathname] ??
    (location.pathname.endsWith("/edit") ? "編輯交易" : "交易明細");
  const isMobileNavigationActive = (to: string) => {
    if (to === "/") return location.pathname === "/";
    if (to === "/entries/new") return location.pathname === "/entries/new";
    if (to === "/entries") {
      return (
        location.pathname.startsWith("/entries") &&
        location.pathname !== "/entries/new"
      );
    }
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
                {navigation.map((item) => (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton asChild tooltip={item.label}>
                      <NavLink
                        to={item.to}
                        end={item.end}
                        className={({ isActive }) =>
                          isActive ? "bg-sidebar-accent font-medium" : ""
                        }
                      >
                        <item.icon aria-hidden="true" />
                        <span>{item.label}</span>
                      </NavLink>
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
      <SidebarInset
        data-vaul-drawer-wrapper
        className="min-w-0 pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0"
      >
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur">
          <SidebarTrigger className="hidden md:inline-flex" />
          <h1 className="min-w-0 flex-1 truncate font-heading text-lg font-semibold">
            {pageName}
          </h1>
          <div className="md:hidden">
            <UserMenu compact />
          </div>
          <ThemeToggle />
          <Button asChild size="sm" className="hidden sm:inline-flex">
            <NavLink to="/entries/new" state={entryEditorRouteState(location)}>
              <Plus aria-hidden="true" />
              新增交易
            </NavLink>
          </Button>
        </header>
        <div className="mx-auto w-full max-w-7xl flex-1 p-4 md:p-6">
          <Outlet />
        </div>
      </SidebarInset>

      <nav
        aria-label="主要導覽"
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 items-center border-t bg-background/95 px-2 pb-[max(env(safe-area-inset-bottom),0.375rem)] pt-1.5 backdrop-blur md:hidden"
      >
        {mobileNavigation.map((item) => {
          const isActive = isMobileNavigationActive(item.to);

          return (
            <Link
              key={item.to}
              to={item.to}
              state={
                item.to === "/entries/new"
                  ? entryEditorRouteState(location)
                  : undefined
              }
              aria-label={item.primary ? "新增交易" : undefined}
              aria-current={isActive ? "page" : undefined}
              className={`touch-press touch-press-frameless flex h-14 min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-xs outline-none active:bg-muted active:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 ${
                isActive
                  ? "bg-muted/70 font-semibold text-foreground"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              }`}
            >
              {item.primary ? (
                <span className="flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
                  <item.icon className="size-5" aria-hidden="true" />
                </span>
              ) : (
                <item.icon className="size-5" aria-hidden="true" />
              )}
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </SidebarProvider>
  );
}
