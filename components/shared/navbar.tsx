// Server Component: only <NavMenu /> is a client component.
// ⚠️ Adjust this import to match your real path / export style.

"use client";

import { usePathname } from "next/navigation";
import { MakadiHeghitsLogo } from "./makadi-heights-logo";
import { NavMenu } from "./nav-menu";

export function Navbar() {
  const path_name = usePathname();

  if (path_name.startsWith("/dashboard") || path_name.startsWith("/login"))
    return null;

  return (
    // --navbar-h is the single source of truth for the bar's height.
    <div className="[--navbar-h:4rem] sm:[--navbar-h:5rem]">
      <header
        id="site-navbar"
        className="fixed inset-x-0 top-0 z-50 h-(--navbar-h) border-b border-brand-primary/30 bg-brand-bg pr-(--lock-scrollbar,0px)"
      >
        <div className="mx-auto flex h-full w-[95%] sm:w-[90%] items-center justify-between">
          <MakadiHeghitsLogo />
          <NavMenu />
        </div>
      </header>

      {/* Reserves the space of the fixed header. Delete it if you want the
          navbar to overlay your hero instead. */}
      <div aria-hidden="true" className="h-(--navbar-h)" />
    </div>
  );
}
