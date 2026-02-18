import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AgentCenter Infra",
  description: "Infrastructure dashboard",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-zinc-950 text-zinc-100 min-h-screen antialiased">
        <nav className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur sticky top-0 z-50">
          <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
            <a href="/" className="font-semibold text-lg tracking-tight">
              AgentCenter <span className="text-zinc-500 font-normal">Infra</span>
            </a>
            <div className="flex items-center gap-4">
              <a href="/" className="text-sm text-zinc-400 hover:text-zinc-100">
                Clients
              </a>
              <button
                id="logout-btn"
                className="text-sm text-zinc-500 hover:text-red-400 cursor-pointer"
              >
                Logout
              </button>
            </div>
          </div>
        </nav>
        <main className="max-w-6xl mx-auto px-6 py-8">{children}</main>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              document.getElementById('logout-btn')?.addEventListener('click', async () => {
                await fetch('/api/auth', { method: 'DELETE' });
                window.location.href = '/login';
              });
            `,
          }}
        />
      </body>
    </html>
  );
}
