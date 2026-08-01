import { motion } from "framer-motion";
import { Flame } from "lucide-react";

function GithubMark(props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M12 0.5C5.65 0.5 0.5 5.65 0.5 12c0 5.08 3.29 9.38 7.86 10.9.58.1.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.23-1.28-5.23-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a10.9 10.9 0 0 1 5.79 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.69 5.38-5.25 5.67.42.36.78 1.07.78 2.16 0 1.56-.01 2.82-.01 3.2 0 .31.21.67.8.56C20.71 21.37 24 17.08 24 12c0-6.35-5.15-11.5-12-11.5Z" />
    </svg>
  );
}

export default function Layout({ children }) {
  return (
    <div className="flex min-h-svh flex-col">
      <motion.header
        initial={{ y: -12, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="sticky top-0 z-50 border-b border-forge-800/80 bg-forge-950/70 backdrop-blur-md"
      >
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="group relative flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-ember-500 to-ember-700 shadow-lg shadow-ember-900/40">
              <span className="absolute inset-0 rounded-lg bg-ember-500 opacity-0 blur-md transition-opacity duration-300 group-hover:opacity-40" />
              <Flame size={18} className="relative text-forge-50" strokeWidth={2.5} />
            </span>
            <span className="text-lg font-semibold tracking-tight text-forge-50">
              AutoML Forge
            </span>
          </div>
          <a
            href="https://github.com/Mudavath-Giri-Naik/AutoML-Forge"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-forge-400 transition hover:bg-forge-800/60 hover:text-forge-100"
          >
            <GithubMark className="h-4 w-4" />
            <span className="hidden sm:inline">Source</span>
          </a>
        </div>
      </motion.header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
        {children}
      </main>

      <footer className="border-t border-forge-800/80 py-8">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-3 px-4 text-center sm:px-6">
          <p className="max-w-md text-xs text-forge-500">
            Upload a CSV, train dozens of models automatically, get a live prediction
            endpoint. No accounts, nothing saved.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] text-forge-600">
            <span>React + FastAPI</span>
            <span className="text-forge-800">·</span>
            <span>Azure ML AutoML</span>
            <span className="text-forge-800">·</span>
            <span>Serverless end to end</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
