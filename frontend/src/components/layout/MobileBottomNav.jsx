import React, { useState, useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Home, Layers, Archive, User, Lock, Search } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export default function MobileBottomNav({ onOpenToolsSheet, onOpenSearchSheet }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

  // Detect virtual keyboard opening to hide bottom bar
  useEffect(() => {
    const handleViewportResize = () => {
      if (window.visualViewport) {
        // If visual viewport is significantly shorter than window height, keyboard is open
        const isOpen = window.visualViewport.height < window.innerHeight - 140;
        setIsKeyboardOpen(isOpen);
      }
    };

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleViewportResize);
      return () => window.visualViewport.removeEventListener('resize', handleViewportResize);
    }
  }, []);

  // Check if current route is a tool page where the sticky action bar takes precedence
  const isToolPage = location.pathname.startsWith('/tools/');

  // If keyboard is open or inside tool runner with files queued, we tuck the bottom bar away
  if (isKeyboardOpen) {
    return null;
  }

  const isHomeActive = location.pathname === '/';
  const isVaultActive = location.pathname === '/workspace';
  const isAccountActive = location.pathname === '/login' || location.pathname === '/register';

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-vellum/95 backdrop-blur-md border-t border-rule pb-safe transition-transform duration-200"
      aria-label="Mobile Bottom Navigation"
    >
      <div className="h-14 flex items-center justify-around px-2 relative">
        {/* Tab 1: Home */}
        <NavLink
          to="/"
          className={`flex flex-col items-center justify-center flex-1 h-full py-1 text-center touch-target relative touch-press ${
            isHomeActive ? 'text-ink font-semibold' : 'text-ink-soft hover:text-ink'
          }`}
        >
          <Home
            className={`w-5 h-5 transition-transform duration-160 ${
              isHomeActive ? 'scale-110 text-red stroke-[2]' : 'stroke-[1.5]'
            }`}
          />
          <span className="text-[10px] font-mono tracking-mono mt-0.5">Home</span>
          {isHomeActive && (
            <span
              className="absolute bottom-1 w-5 h-0.5 bg-marigold rounded-full"
              aria-hidden="true"
            />
          )}
        </NavLink>

        {/* Tab 2: Tools (Opens Full-Height Bottom Sheet) */}
        <button
          onClick={onOpenToolsSheet}
          className="flex flex-col items-center justify-center flex-1 h-full py-1 text-center touch-target relative touch-press text-ink-soft hover:text-ink focus:outline-none"
          aria-label="Open Bench Tools Sheet"
        >
          <Layers className="w-5 h-5 stroke-[1.5]" />
          <span className="text-[10px] font-mono tracking-mono mt-0.5">Tools</span>
        </button>

        {/* Tab 3: Search / Command Palette */}
        <button
          onClick={onOpenSearchSheet}
          className="flex flex-col items-center justify-center flex-1 h-full py-1 text-center touch-target relative touch-press text-ink-soft hover:text-ink focus:outline-none"
          aria-label="Open Search Palette"
        >
          <Search className="w-5 h-5 stroke-[1.5]" />
          <span className="text-[10px] font-mono tracking-mono mt-0.5">Search</span>
        </button>

        {/* Tab 4: Vault */}
        <NavLink
          to="/workspace"
          className={`flex flex-col items-center justify-center flex-1 h-full py-1 text-center touch-target relative touch-press ${
            isVaultActive ? 'text-ink font-semibold' : 'text-ink-soft hover:text-ink'
          }`}
        >
          <Archive
            className={`w-5 h-5 transition-transform duration-160 ${
              isVaultActive ? 'scale-110 text-red stroke-[2]' : 'stroke-[1.5]'
            }`}
          />
          <span className="text-[10px] font-mono tracking-mono mt-0.5">Vault</span>
          {isVaultActive && (
            <span
              className="absolute bottom-1 w-5 h-0.5 bg-marigold rounded-full"
              aria-hidden="true"
            />
          )}
        </NavLink>

        {/* Tab 5: Account */}
        <NavLink
          to={isAuthenticated ? '/workspace' : '/login'}
          className={`flex flex-col items-center justify-center flex-1 h-full py-1 text-center touch-target relative touch-press ${
            isAccountActive ? 'text-ink font-semibold' : 'text-ink-soft hover:text-ink'
          }`}
        >
          {isAuthenticated ? (
            <div className="w-5 h-5 rounded-full border border-ink bg-kraft flex items-center justify-center text-[10px] font-mono font-bold text-ink">
              {user?.email?.charAt(0).toUpperCase() || 'M'}
            </div>
          ) : (
            <User className="w-5 h-5 stroke-[1.5]" />
          )}
          <span className="text-[10px] font-mono tracking-mono mt-0.5">
            {isAuthenticated ? 'Account' : 'Sign In'}
          </span>
          {isAccountActive && (
            <span
              className="absolute bottom-1 w-5 h-0.5 bg-marigold rounded-full"
              aria-hidden="true"
            />
          )}
        </NavLink>
      </div>
    </nav>
  );
}

