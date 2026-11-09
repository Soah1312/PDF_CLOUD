import React, { useState, useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Home, Layers, Archive, User, Lock, Search } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export default function MobileBottomNav({ onOpenToolsSheet }) {
  const location = useLocation();
  const { user, isAuthenticated } = useAuth();
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

  const triggerHaptic = () => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(10);
    }
  };

  // Detect virtual keyboard opening to hide bottom bar
  useEffect(() => {
    const handleViewportResize = () => {
      if (window.visualViewport) {
        const isOpen = window.visualViewport.height < window.innerHeight - 140;
        setIsKeyboardOpen(isOpen);
      }
    };

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleViewportResize);
      return () => window.visualViewport.removeEventListener('resize', handleViewportResize);
    }
  }, []);

  // Hide bottom tab bar if virtual keyboard is open or on tool runner page where sticky action bar takes precedence
  if (isKeyboardOpen || location.pathname.startsWith('/tools/')) {
    return null;
  }

  const isHomeActive = location.pathname === '/';
  const isVaultActive = location.pathname === '/workspace';
  const isAccountActive =
    location.pathname === '/login' ||
    location.pathname === '/register' ||
    (isAuthenticated && location.pathname.startsWith('/account'));

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-vellum border-t border-rule pb-safe transition-transform duration-200 select-none shadow-[0_-2px_6px_rgba(36,27,20,0.04)]"
      aria-label="Mobile Bottom Navigation"
    >
      <div className="h-14 flex items-center justify-around px-1 relative">
        {/* Tab 1: Home */}
        <NavLink
          to="/"
          onClick={triggerHaptic}
          className={`flex flex-col items-center justify-center flex-1 h-full py-1 text-center touch-target relative ${
            isHomeActive ? 'text-ink font-semibold' : 'text-ink-soft hover:text-ink'
          }`}
        >
          <Home
            className={`w-[22px] h-[22px] transition-transform duration-120 ${
              isHomeActive ? 'text-ink stroke-[2]' : 'text-ink-soft stroke-[1.5]'
            }`}
          />
          <span className="text-[11px] font-mono tracking-mono mt-0.5 leading-none">Home</span>
          {isHomeActive && (
            <span
              className="absolute bottom-1 w-6 h-0.5 bg-marigold rounded-full"
              aria-hidden="true"
            />
          )}
        </NavLink>

        {/* Tab 2: Tools (Opens Full-Height Bottom Sheet) */}
        <button
          onClick={() => {
            triggerHaptic();
            onOpenToolsSheet?.();
          }}
          className="flex flex-col items-center justify-center flex-1 h-full py-1 text-center touch-target relative text-ink-soft hover:text-ink focus:outline-none"
          aria-label="Open Bench Tools Sheet"
        >
          <Layers className="w-[22px] h-[22px] stroke-[1.5] text-ink-soft" />
          <span className="text-[11px] font-mono tracking-mono mt-0.5 leading-none">Tools</span>
        </button>

        {/* Tab 3: Vault */}
        <NavLink
          to="/workspace"
          onClick={triggerHaptic}
          className={`flex flex-col items-center justify-center flex-1 h-full py-1 text-center touch-target relative ${
            isVaultActive ? 'text-ink font-semibold' : 'text-ink-soft hover:text-ink'
          }`}
        >
          <Archive
            className={`w-[22px] h-[22px] transition-transform duration-120 ${
              isVaultActive ? 'text-ink stroke-[2]' : 'text-ink-soft stroke-[1.5]'
            }`}
          />
          <span className="text-[11px] font-mono tracking-mono mt-0.5 leading-none">Vault</span>
          {isVaultActive && (
            <span
              className="absolute bottom-1 w-6 h-0.5 bg-marigold rounded-full"
              aria-hidden="true"
            />
          )}
        </NavLink>

        {/* Tab 4: Account */}
        <NavLink
          to={isAuthenticated ? '/workspace' : '/login'}
          onClick={triggerHaptic}
          className={`flex flex-col items-center justify-center flex-1 h-full py-1 text-center touch-target relative ${
            isAccountActive ? 'text-ink font-semibold' : 'text-ink-soft hover:text-ink'
          }`}
        >
          {isAuthenticated ? (
            <div className="w-[22px] h-[22px] rounded-full border border-ink bg-kraft flex items-center justify-center text-[10px] font-mono font-bold text-ink">
              {user?.email?.charAt(0).toUpperCase() || 'M'}
            </div>
          ) : (
            <User className="w-[22px] h-[22px] stroke-[1.5] text-ink-soft" />
          )}
          <span className="text-[11px] font-mono tracking-mono mt-0.5 leading-none">
            {isAuthenticated ? 'Account' : 'Sign in'}
          </span>
          {isAccountActive && (
            <span
              className="absolute bottom-1 w-6 h-0.5 bg-marigold rounded-full"
              aria-hidden="true"
            />
          )}
        </NavLink>
      </div>
    </nav>
  );
}

