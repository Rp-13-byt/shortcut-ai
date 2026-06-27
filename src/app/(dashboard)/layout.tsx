import { ReactNode } from 'react';
import Link from 'next/link';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 font-sans">
      <nav className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-8">
              <span className="text-xl font-bold bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent tracking-tight">
                ShortCut AI
              </span>
              <div className="hidden md:block">
                <div className="flex items-baseline space-x-4">
                  <Link href="/dashboard" className="px-3 py-2 rounded-md text-sm font-medium hover:text-purple-400 transition-colors">Dashboard</Link>
                  <Link href="/jobs" className="px-3 py-2 rounded-md text-sm font-medium hover:text-purple-400 transition-colors">History</Link>
                  <Link href="/clips" className="px-3 py-2 rounded-md text-sm font-medium hover:text-purple-400 transition-colors">Gallery</Link>
                </div>
              </div>
            </div>
            <div className="flex items-center">
              <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-sm font-bold shadow-[0_0_15px_rgba(168,85,247,0.5)]">
                U
              </div>
            </div>
          </div>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
