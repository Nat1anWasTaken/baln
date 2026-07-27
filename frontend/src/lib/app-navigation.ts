import {
  ArrowLeftRight,
  BarChart3,
  LayoutDashboard,
  type LucideIcon,
  WalletCards,
} from "lucide-react";

export type PrimaryNavigationItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
};

export const primaryNavigation: PrimaryNavigationItem[] = [
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

export function pageNameForPath(pathname: string) {
  return (
    pageNames[pathname] ??
    (pathname.endsWith("/edit") ? "編輯交易" : "交易明細")
  );
}
