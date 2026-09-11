import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { NavTabs } from "@/components/NavTabs";
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
  { href: "/settings", label: "设置" },
];

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="zh"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col text-neutral-900">
        <header className="sticky top-0 z-20 border-b border-white/60 bg-white/60 backdrop-blur-xl">
          <div className="mx-auto flex max-w-5xl items-center gap-8 px-4 py-3">
            <Link href="/" className="text-[15px] font-semibold tracking-tight">
              StudyBase <span className="text-neutral-400">学库</span>
            </Link>
            <NavTabs items={NAV} />
          </div>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
