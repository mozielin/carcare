import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "洗車用品庫存",
  description: "記錄每次洗車用品用量，掌握剩餘庫存與補貨時機。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant">
      <body className="antialiased">{children}</body>
    </html>
  );
}
