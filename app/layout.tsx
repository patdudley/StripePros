import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3001";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const baseUrl = new URL(`${protocol}://${host}`);
  const imageUrl = new URL("/og.png", baseUrl).toString();

  return {
    metadataBase: baseUrl,
    title: "Stripe Pros — From address to quote in minutes",
    description: "Measure the lot from your desk, price every stripe, and send a proposal that wins the job.",
    openGraph: {
      title: "Stripe Pros — From address to quote in minutes",
      description: "Measurement-assisted quoting for parking lot striping contractors.",
      type: "website",
      images: [{ url: imageUrl, width: 1200, height: 630, alt: "Stripe Pros address-to-quote workflow" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Stripe Pros — From address to quote in minutes",
      description: "Measurement-assisted quoting for parking lot striping contractors.",
      images: [imageUrl],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
