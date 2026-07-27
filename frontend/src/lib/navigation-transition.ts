import { primaryNavigation } from "@/lib/app-navigation";

export type NavigationIntent = "auto" | "forward" | "back" | "overlay" | "none";

export type NavigationDirection = "forward" | "back" | "none";

const settingsOrder = [
  "/settings/api-tokens",
  "/settings/connected-apps",
] as const;

const nonAnimatedPrefixes = ["/login", "/auth/", "/oauth/"] as const;

function isPathWithin(pathname: string, route: string) {
  return pathname === route || pathname.startsWith(`${route}/`);
}

function isNonAnimatedPath(pathname: string) {
  return nonAnimatedPrefixes.some(
    (prefix) =>
      pathname === prefix ||
      (prefix.endsWith("/")
        ? pathname.startsWith(prefix)
        : isPathWithin(pathname, prefix)),
  );
}

function primaryIndex(pathname: string) {
  if (pathname === "/") return 0;
  return primaryNavigation.findIndex(
    (item) => item.to !== "/" && isPathWithin(pathname, item.to),
  );
}

function entryDepth(pathname: string) {
  if (pathname === "/entries") return 0;
  if (pathname === "/entries/new") return 1;
  if (/^\/entries\/[^/]+\/edit$/.test(pathname)) return 2;
  if (/^\/entries\/[^/]+$/.test(pathname)) return 1;
  return null;
}

function settingsIndex(pathname: string) {
  return settingsOrder.findIndex((path) => pathname === path);
}

function segmentDepth(pathname: string) {
  return pathname.split("/").filter(Boolean).length;
}

export function isEntryEditorPath(pathname: string) {
  return (
    pathname === "/entries/new" || /^\/entries\/[^/]+\/edit$/.test(pathname)
  );
}

export function getNavigationDirection(
  fromPathname: string,
  toPathname: string,
  intent: NavigationIntent = "auto",
): NavigationDirection {
  if (intent === "forward") return "forward";
  if (intent === "back") return "back";
  if (intent === "overlay" || intent === "none") return "none";
  if (fromPathname === toPathname) return "none";
  if (isNonAnimatedPath(fromPathname) || isNonAnimatedPath(toPathname)) {
    return "none";
  }

  const fromEntryDepth = entryDepth(fromPathname);
  const toEntryDepth = entryDepth(toPathname);
  if (fromEntryDepth !== null && toEntryDepth !== null) {
    if (toEntryDepth === fromEntryDepth) return "forward";
    return toEntryDepth > fromEntryDepth ? "forward" : "back";
  }

  const fromPrimaryIndex = primaryIndex(fromPathname);
  const toPrimaryIndex = primaryIndex(toPathname);
  if (fromPrimaryIndex >= 0 && toPrimaryIndex >= 0) {
    if (fromPrimaryIndex === toPrimaryIndex) {
      return segmentDepth(toPathname) > segmentDepth(fromPathname)
        ? "forward"
        : "back";
    }
    return toPrimaryIndex > fromPrimaryIndex ? "forward" : "back";
  }

  const fromSettingsIndex = settingsIndex(fromPathname);
  const toSettingsIndex = settingsIndex(toPathname);
  if (fromSettingsIndex >= 0 && toSettingsIndex >= 0) {
    return toSettingsIndex > fromSettingsIndex ? "forward" : "back";
  }
  if (fromPrimaryIndex >= 0 && toSettingsIndex >= 0) return "forward";
  if (fromSettingsIndex >= 0 && toPrimaryIndex >= 0) return "back";

  return "forward";
}
