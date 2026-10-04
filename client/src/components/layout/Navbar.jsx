import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldAlert, Bell, User } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export const Navbar = () => {
  return (
    <header className="sticky top-0 z-50 flex h-16 w-full items-center justify-between border-b border-gray-200 bg-white/95 px-6 backdrop-blur">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <Link to="/" className="text-xl font-bold tracking-tight text-gray-900">
          Bank<span className="text-blue-600">Shield</span>
        </Link>
        <Badge variant="outline" className="ml-2 font-mono text-[10px]">
          v1.0 ML Active
        </Badge>
      </div>

      <div className="flex items-center gap-4">
        <button className="relative rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700">
          <Bell className="h-5 w-5" />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-600" />
        </button>

        <div className="flex items-center gap-2 border-l border-gray-200 pl-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-blue-700">
            <User className="h-4 w-4" />
          </div>
          <span className="text-sm font-medium text-gray-700">Analyst Mode</span>
        </div>
      </div>
    </header>
  );
};

export default Navbar;
