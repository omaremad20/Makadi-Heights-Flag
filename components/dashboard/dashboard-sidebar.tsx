"use client";

import { Folder, Hotel, UserRound, Users, Waves, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { LogoutMenuItem } from "@/components/dashboard/logout-menu-item";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";

type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
};

const NAV_ITEMS: NavItem[] = [
  { title: "Sea", href: "/dashboard/sea", icon: Waves },
  { title: "Hotels", href: "/dashboard/hotels", icon: Hotel },
  { title: "Applications", href: "/dashboard/applications", icon: Folder },
  { title: "Profiles", href: "/dashboard/profiles", icon: Users },
  { title: "My Profile", href: "/dashboard/my-profile", icon: UserRound },
];

const EMPLOYEE_DENIED_PATHS = new Set([
  "/dashboard/profiles",
  "/dashboard/hotels",
  "/dashboard/hotels/modify-hotel",
]);

type DashboardSidebarProps = {
  role: string | null;
};

export function DashboardSidebar({ role }: DashboardSidebarProps) {
  const pathname = usePathname();

  const visibleNavItems = NAV_ITEMS.filter((item) => {
    if (role !== "employee") {
      return true;
    }

    return !EMPLOYEE_DENIED_PATHS.has(item.href);
  });

  if (pathname.includes("waiting-for-approve")) return null;
  
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex h-8 items-center px-2 font-semibold group-data-[collapsible=icon]:hidden">
          The Flag
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleNavItems.map((item) => {
                const isActive =
                  pathname === item.href ||
                  pathname.startsWith(`${item.href}/`);

                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      tooltip={item.title}
                    >
                      <Link href={item.href}>
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <LogoutMenuItem />
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
