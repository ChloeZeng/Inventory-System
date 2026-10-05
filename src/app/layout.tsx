import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SVLSG Inventory",
  description: "Receiving, quarantine, inspection and inventory for SVLSG",
};

// The app shell (sidebar) lives in (app)/layout.tsx; /welcome renders full-screen.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
