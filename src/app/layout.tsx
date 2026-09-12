import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { cookies } from "next/headers";
import { NavTabs } from "@/components/NavTabs";
import { SESSION_COOKIE, readSession } from "@/lib/auth";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "StudyBase 学库",
  description: "AI 学习资料库",
};

const NAV = [
  { href: "/", label: "科目" },
  { href: "/materials", label: "资料库" },
  { href: "/calendar", label: "日历" },
];
// Settings expose the AI credentials, the MCP token and user approvals, so the
// entry point is owner-only — the middleware enforces it, this just hides it.
const OWNER_NAV = [...NAV, { href: "/settings", label: "设置" }];

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const session = await readSession((await cookies()).get(SESSION_COOKIE)?.value);
  const nav = session?.owner ? OWNER_NAV : NAV;
  return (
    <html
      lang="zh"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col text-neutral-900">
        <header className="sticky top-0 z-20 border-b border-white/60 bg-[rgba(255,253,250,0.7)] backdrop-blur-xl">
          <div className="mx-auto flex max-w-6xl items-center gap-8 px-4 py-3">
            <Link href="/" className="text-[15px] font-semibold tracking-tight">
              StudyBase <span className="text-neutral-400">学库</span>
            </Link>
            <NavTabs items={nav} />
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
