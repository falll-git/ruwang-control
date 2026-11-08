// Exact root match prevents Dashboard from claiming every nested URL.
export function activeControlPath(pathname: string): string | null {
  if (pathname === "/") return "/";
  return ["/reviews", "/monitoring", "/operators"].find(path => pathname === path || pathname.startsWith(path + "/")) ?? null;
}
