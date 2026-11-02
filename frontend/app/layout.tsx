import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nexus AI MVP",
  description: "Agentic RAG workspace for cited answers across PDFs, DOCX files, and CSVs.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

