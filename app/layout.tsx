import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible, Literata } from "next/font/google";
import "./globals.css";

const serif = Literata({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-serif", display: "swap" });
const sans = Atkinson_Hyperlegible({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
  title: "Common Ground: one trip everyone has said yes to",
  description: "Everyone saves their limits through one link. Rules suggest trips with per-person estimates. A trip is agreed only when everyone explicitly says yes.",
  robots: { index: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#1E4A38" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" className={`${serif.variable} ${sans.variable}`}>
      <body className="min-h-screen bg-paper">{children}</body>
    </html>
  );
}
