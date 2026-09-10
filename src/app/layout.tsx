import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
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
  { href: "/", label: "今日学习" },
  { href: "/subjects", label: "全部科目" },
  { href: "/materials", label: "资料库" },
  { href: "/search", label: "搜索" },
  { href: "/settings", label: "设置" },
];

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="zh"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-neutral-50 text-neutral-900">
        <header className="border-b border-neutral-200 bg-white">
          <div className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-3">
            <span className="font-semibold tracking-tight">StudyBase 学库</span>
            <nav className="flex gap-4 text-sm text-neutral-600">
              {NAV.map((item) => (
                <Link key={item.href} href={item.href} className="hover:text-neutral-900">
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
