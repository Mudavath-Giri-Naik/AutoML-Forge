import { Flame } from "lucide-react";

export default function Layout({ children }) {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="border-b border-forge-800">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-ember-500 to-ember-700 shadow-lg shadow-ember-900/40">
              <Flame size={18} className="text-forge-50" strokeWidth={2.5} />
            </span>
            <span className="text-lg font-semibold tracking-tight text-forge-50">
              AutoML Forge
            </span>
          </div>
          <a
            href="https://github.com"
            target="_blank"
            rel="noreferrer"
            className="text-sm text-forge-400 transition hover:text-forge-100"
          >
            Portfolio project
          </a>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
        {children}
      </main>

      <footer className="border-t border-forge-800 py-6">
        <div className="mx-auto max-w-5xl px-4 text-center text-xs text-forge-500 sm:px-6">
          Upload a CSV, train dozens of models automatically, get a live prediction endpoint. No accounts, nothing saved.
        </div>
      </footer>
    </div>
  );
}
