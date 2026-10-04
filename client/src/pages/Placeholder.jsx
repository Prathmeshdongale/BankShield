/**
 * Placeholder.jsx — Generates stub pages for routes not yet implemented.
 * Replace each stub with the real page component as you build them out.
 *
 * Usage (via dynamic import with factory):
 *   const Accounts = lazy(() => import('@/pages/Placeholder').then(m => ({
 *     default: m.mkPage('Accounts', 'accounts')
 *   })));
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { Construction } from 'lucide-react';

export const mkPage = (title, apiSlug) => {
  const Page = () => (
    <div className="flex flex-col items-center justify-center gap-6 py-20">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100 dark:bg-amber-950/40">
        <Construction className="h-8 w-8 text-amber-600 dark:text-amber-400" />
      </div>
      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{title}</h1>
        <p className="mt-2 text-gray-500 dark:text-gray-400">
          This page is under construction.
        </p>
        <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
          API endpoint: <code className="font-mono">/api/{apiSlug}</code>
        </p>
      </div>
      <Link
        to="/"
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
      >
        Back to Dashboard
      </Link>
    </div>
  );
  Page.displayName = title;
  return Page;
};

export default mkPage;
