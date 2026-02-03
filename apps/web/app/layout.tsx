import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter, Playfair_Display } from "next/font/google";
import "@multica/ui/globals.css";
import { ThemeProvider } from "@multica/ui/components/theme-provider";
import { AppHeader } from "./app-header";
import { Toaster } from "@multica/ui/components/ui/sonner";
import { ServiceWorkerRegister } from "./sw-register";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const playfair = Playfair_Display({
  variable: "--font-brand",
  subsets: ["latin"],
  weight: ["400"],
});

export const metadata: Metadata = {
  title: "Multica",
  description: "Distributed AI agent framework",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Multica",
  },
  icons: {
    apple: "/icon-192x192.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${playfair.variable} antialiased h-dvh flex flex-col`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <AppHeader>
            <div className="flex-1 overflow-hidden">{children}</div>
          </AppHeader>
        </ThemeProvider>
        <Toaster />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
