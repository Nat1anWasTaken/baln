import {
  ArrowLeftRight,
  BarChart3,
  ChevronUp,
  CircleUserRound,
  LayoutDashboard,
  KeyRound,
  PlugZap,
  LogOut,
  Plus,
  WalletCards,
} from "lucide-react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { useAuth } from "@/auth/auth-context";
import { BrandIcon } from "@/components/brand-icon";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
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

const navigation = [
  { to: "/", label: "總覽", icon: LayoutDashboard, end: true },
  { to: "/entries", label: "交易", icon: ArrowLeftRight },
  { to: "/accounts", label: "帳戶", icon: WalletCards },
  { to: "/reports", label: "報表", icon: BarChart3 },
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
      <SidebarInset className="min-w-0 pb-20 md:pb-0">
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
            <NavLink to="/entries/new">
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
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t bg-background/95 px-1 pb-[max(env(safe-area-inset-bottom),0.25rem)] pt-1 backdrop-blur md:hidden"
      >
        {navigation.slice(0, 2).map((item) => (
          <Button
            key={item.to}
            asChild
            variant="ghost"
            className="h-12 flex-col gap-0.5 rounded-md px-1 text-xs"
          >
            <NavLink
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                isActive
                  ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground ring-1 ring-inset ring-sidebar-border"
                  : ""
              }
            >
              <item.icon aria-hidden="true" />
              {item.label}
            </NavLink>
          </Button>
        ))}
        <Button
          asChild
          size="icon"
          className="mx-auto size-11 rounded-full"
          aria-label="新增交易"
        >
          <NavLink to="/entries/new">
            <Plus className="size-5" aria-hidden="true" />
          </NavLink>
        </Button>
        {navigation.slice(2).map((item) => (
          <Button
            key={item.to}
            asChild
            variant="ghost"
            className="h-12 flex-col gap-0.5 rounded-md px-1 text-xs"
          >
            <NavLink
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                isActive
                  ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground ring-1 ring-inset ring-sidebar-border"
                  : ""
              }
            >
              <item.icon aria-hidden="true" />
              {item.label}
            </NavLink>
          </Button>
        ))}
      </nav>
    </SidebarProvider>
  );
}
