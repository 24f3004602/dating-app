"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/admin", label: "Reports" },
  { href: "/admin/photos", label: "Photos" },
  { href: "/admin/audit", label: "Audit log", admin: true },
  { href: "/admin/staff", label: "Staff", admin: true },
];

export function Nav({ admin }: { admin: boolean }) {
  const path = usePathname();
  const current = (href: string) => (href === "/admin" ? path === "/admin" || path.startsWith("/admin/reports") : path.startsWith(href));
  return (
    <nav aria-label="Console">
      <ul>
        {LINKS.filter((l) => admin || !l.admin).map((l) => (
          <li key={l.href}>
            <Link href={l.href} aria-current={current(l.href) ? "page" : undefined}>
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
