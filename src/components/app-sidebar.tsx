"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Network,
  Users,
  CreditCard,
  GitBranch,
  Upload,
  Settings,
  LogOut,
  History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const navItems = [
  { href: "/",           label: "ダッシュボード", icon: LayoutDashboard },
  { href: "/billing-accounts", label: "請求アカウント", icon: Network },
  { href: "/tenants",    label: "テナント",        icon: Users },
  { href: "/billing",    label: "請求管理",        icon: CreditCard },
  { href: "/unit-ch",    label: "ユニットch",      icon: GitBranch },
  { href: "/import",     label: "インポート",      icon: Upload },
  { href: "/activity",   label: "更新履歴",        icon: History },
  { href: "/settings",   label: "設定",            icon: Settings },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();

  const initials = session?.user?.name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() ?? "?";

  return (
    <aside className="flex flex-col w-56 min-h-screen bg-gray-900 text-gray-100">
      {/* Logo */}
      <div className="px-4 py-4 border-b border-gray-700">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="LineHub" width={32} height={32} className="shrink-0" />
          <div className="leading-tight">
            <p className="text-base font-bold tracking-tight text-white">LineHub</p>
            <p className="text-[10px] text-gray-400">IP・携帯回線 統合管理</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        <TooltipProvider delay={0}>
          {navItems.map(({ href, label, icon: Icon }) => {
            const active =
              href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Tooltip key={href}>
                <TooltipTrigger className="block w-full">
                  <Link
                    href={href}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                      active
                        ? "bg-gray-700 text-white"
                        : "text-gray-400 hover:bg-gray-800 hover:text-white"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {label}
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right">{label}</TooltipContent>
              </Tooltip>
            );
          })}
        </TooltipProvider>
      </nav>

      {/* User footer */}
      <div className="px-3 py-4 border-t border-gray-700">
        <div className="flex items-center gap-3 px-2 mb-2">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-gray-600 text-white text-xs">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">
              {session?.user?.name}
            </p>
            <p className="text-xs text-gray-400 truncate">
              {session?.user?.role}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-gray-400 hover:text-white hover:bg-gray-800"
          onClick={() => signOut({ callbackUrl: "/login" })}
        >
          <LogOut className="h-4 w-4 mr-2" />
          ログアウト
        </Button>
      </div>
    </aside>
  );
}
