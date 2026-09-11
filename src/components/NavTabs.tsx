"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = { href: string; label: string };

// Active item = longest href that prefixes the current path, so /subjects/xyz
// and /materials/xyz still light up their section.
function activeIndex(items: NavItem[], pathname: string) {
  let best = -1;
  let bestLength = -1;
  items.forEach((item, i) => {
    const matches = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
    if (matches && item.href.length > bestLength) {
      best = i;
      bestLength = item.href.length;
    }
  });
  return best;
}

export function NavTabs({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const index = activeIndex(items, pathname);
  const refs = useRef<(HTMLAnchorElement | null)[]>([]);
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);

  useEffect(() => {
    const el = refs.current[index];
    if (!el) {
      setPill(null);
      return;
    }
    const measure = () => setPill({ left: el.offsetLeft, width: el.offsetWidth });
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [index, pathname]);

  return (
    <nav className="relative flex items-center gap-1">
      {pill && (
        <span
          aria-hidden
          className="absolute top-0 bottom-0 rounded-full bg-neutral-900/[0.06] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.8)] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
          style={{ left: pill.left, width: pill.width }}
        />
      )}
      {items.map((item, i) => (
        <Link
          key={item.href}
          href={item.href}
          ref={(el) => {
            refs.current[i] = el;
          }}
          className={`relative rounded-full px-3.5 py-1.5 text-sm transition-colors duration-200 ${
            i === index ? "font-medium text-neutral-900" : "text-neutral-500 hover:text-neutral-900"
          }`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
