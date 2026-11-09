import React, { useState, useRef, useEffect } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  ChevronDown,
  Search,
  Archive,
  LogOut,
  LogIn,
  ShieldCheck,
  X,
  ArrowRight,
  Info,
  User,
} from 'lucide-react';
import { BINDERY_TOOLS } from '../../config/tools';

export default function Navbar({ onOpenCommandPalette, onOpenToolsSheet }) {
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  const [toolsOpen, setToolsOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);

  const toolsDropdownRef = useRef(null);
  const privacyRef = useRef(null);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (toolsDropdownRef.current && !toolsDropdownRef.current.contains(event.target)) {
        setToolsOpen(false);
      }
      if (privacyRef.current && !privacyRef.current.contains(event.target)) {
        setPrivacyOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toolGroups = [
    {
      name: 'Merge & Split',
      tools: BINDERY_TOOLS.filter((t) => t.group === 'Merge & Split'),
    },
    {
      name: 'Compress & Optimize',
      tools: BINDERY_TOOLS.filter((t) => t.group === 'Compress'),
    },
    {
      name: 'Convert & Formats',
      tools: BINDERY_TOOLS.filter((t) => t.group === 'Convert'),
    },
    {
      name: 'Security & Forensics',
      tools: BINDERY_TOOLS.filter((t) => t.group === 'Security'),
    },
  ];

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <header className="sticky top-0 z-40 w-full bg-vellum/95 backdrop-blur-md border-b border-rule pt-safe">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        {/* Left: Brand + Tools Dropdown + Privacy Popover */}
        <div className="flex items-center gap-4 sm:gap-6">
          {/* Brand Mark */}
          <Link
            to="/"
            className="flex items-center gap-2.5 group focus:outline-none touch-target"
            aria-label="CloudPDF Studio Home"
          >
            <div className="w-8 h-8 rounded border border-ink bg-paper flex items-center justify-center transition-transform duration-120 group-hover:-translate-y-0.5 shadow-sm">
              <svg
                viewBox="0 0 24 24"
                className="w-4 h-4 text-ink"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                <line x1="9" y1="7" x2="15" y2="7" />
                <line x1="9" y1="11" x2="13" y2="11" />
              </svg>
            </div>
            <div className="flex flex-col">
              <span className="font-display text-base sm:text-lg tracking-tight leading-none text-ink">
                CloudPDF
              </span>
              <span className="hidden sm:block text-[9px] font-mono tracking-mono uppercase text-ink-soft leading-none mt-0.5">
                The Bindery
              </span>
            </div>
          </Link>

          {/* Desktop Tools Dropdown */}
          <div className="relative hidden md:block" ref={toolsDropdownRef}>
            <button
              onClick={() => setToolsOpen(!toolsOpen)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded border transition-colors ${
                toolsOpen
                  ? 'bg-kraft border-rule-strong text-ink'
                  : 'bg-paper/70 border-rule hover:bg-kraft/50 text-ink-soft hover:text-ink'
              }`}
              aria-expanded={toolsOpen}
              aria-haspopup="true"
            >
              <span>Bench Tools</span>
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform duration-150 ${
                  toolsOpen ? 'rotate-180' : ''
                }`}
                strokeWidth={1.5}
              />
            </button>

            {/* Tools Mega Menu */}
            {toolsOpen && (
              <div
                className="absolute left-0 mt-1.5 w-[560px] bg-vellum border border-rule rounded-md shadow-ink-lift p-4 grid grid-cols-2 gap-4 z-50 animate-in fade-in duration-120"
                style={{ animation: 'scaleIn 120ms ease-out forwards' }}
              >
                {toolGroups.map((group) => (
                  <div key={group.name} className="space-y-1.5">
                    <div className="text-[10px] font-mono tracking-mono uppercase text-ink-faint px-2 pb-1 border-b border-rule/60">
                      {group.name}
                    </div>
                    {group.tools.map((tool) => {
                      const Icon = tool.icon;
                      return (
                        <Link
                          key={tool.id}
                          to={tool.to}
                          onClick={() => setToolsOpen(false)}
                          className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-kraft/60 group transition-colors"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <Icon className="w-3.5 h-3.5 text-ink-soft group-hover:text-ink shrink-0" strokeWidth={1.5} />
                            <span className="text-xs font-medium text-ink truncate">
                              {tool.title}
                            </span>
                          </div>
                          <span className="text-[10px] font-mono tracking-mono uppercase text-ink-faint group-hover:text-ink-soft shrink-0">
                            {tool.verb}
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                ))}

                <div className="col-span-2 pt-2 border-t border-rule flex items-center justify-between text-[11px] font-mono text-ink-soft">
                  <Link
                    to="/workflows"
                    onClick={() => setToolsOpen(false)}
                    className="hover:text-ink underline decoration-rule-strong"
                  >
                    Open Pipeline Studio →
                  </Link>
                  <button
                    onClick={() => {
                      setToolsOpen(false);
                      onOpenCommandPalette?.();
                    }}
                    className="hover:text-ink flex items-center gap-1"
                  >
                    <span>Full index</span>
                    <kbd className="px-1 py-0.2 bg-kraft border border-rule rounded text-[9px]">
                      Ctrl K
                    </kbd>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Privacy Popover on Desktop (Hidden on mobile; mobile uses trust line) */}
          <div className="relative hidden md:block" ref={privacyRef}>
            <button
              onClick={() => setPrivacyOpen(!privacyOpen)}
              className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-mono text-ink-soft bg-paper/60 border border-rule/80 rounded hover:bg-kraft/40 hover:text-ink transition-colors touch-target"
              title="Inspect zero-retention architecture"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-moss shrink-0"></span>
              <span>Stateless & In-Memory</span>
              <Info className="w-3 h-3 text-ink-faint shrink-0" strokeWidth={1.5} />
            </button>

            {/* Privacy Popover on Desktop */}
            {privacyOpen && (
              <div className="absolute top-full left-0 mt-1.5 w-80 bg-vellum border border-rule rounded-md shadow-ink-lift p-4 z-50 text-xs space-y-2.5">
                <div className="flex items-center justify-between border-b border-rule pb-2">
                  <div className="flex items-center gap-1.5 font-medium text-ink">
                    <ShieldCheck className="w-4 h-4 text-moss" strokeWidth={1.5} />
                    <span>Print-Shop Privacy Guarantee</span>
                  </div>
                  <button
                    onClick={() => setPrivacyOpen(false)}
                    className="p-1 text-ink-faint hover:text-ink"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-ink-soft leading-relaxed text-[11px]">
                  Files uploaded to guest bench tools are strictly processed in volatile server RAM. They are{' '}
                  <strong className="text-ink font-semibold">discarded immediately</strong> upon download or timeout.
                </p>
                <p className="text-ink-soft leading-relaxed text-[11px]">
                  Documents are only stored persistently when an authenticated user explicitly clicks{' '}
                  <span className="font-mono text-ink bg-kraft px-1 py-0.5 rounded text-[10px]">
                    Save to Vault
                  </span>
                  , where they receive client-isolated AES-256 encryption.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Center: Command Palette Trigger on Desktop */}
        <div className="hidden md:flex items-center flex-1 max-w-xs mx-4">
          <button
            onClick={onOpenCommandPalette}
            className="w-full flex items-center justify-between px-3 py-1.5 rounded border border-rule bg-paper hover:bg-kraft/50 text-ink-soft hover:text-ink text-xs transition-colors"
          >
            <div className="flex items-center gap-2">
              <Search className="w-3.5 h-3.5 text-ink-faint" strokeWidth={1.5} />
              <span>Search bench tools...</span>
            </div>
            <kbd className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono tracking-mono text-ink-soft bg-vellum border border-rule rounded">
              Ctrl K
            </kbd>
          </button>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          {/* Mobile Right Controls: Avatar if signed in, small "Sign in" text button if guest */}
          {isAuthenticated ? (
            <Link
              to="/workspace"
              className="md:hidden flex items-center justify-center w-8 h-8 rounded-full border border-ink bg-kraft text-ink font-mono text-xs font-semibold active:scale-95 transition-transform touch-target shadow-xs"
              aria-label="Account / Vault"
            >
              {user?.email?.charAt(0).toUpperCase() || 'M'}
            </Link>
          ) : (
            <Link
              to="/login"
              className="md:hidden px-2.5 py-1.5 text-xs font-semibold text-ink hover:text-red transition-colors touch-target flex items-center"
            >
              Sign in
            </Link>
          )}

          {/* Desktop Cloud Vault Direct Link */}
          <NavLink
            to="/workspace"
            className={({ isActive }) =>
              `hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border transition-colors ${
                isActive
                  ? 'bg-kraft border-rule-strong text-ink'
                  : 'bg-paper/70 border-rule hover:bg-kraft/40 text-ink-soft hover:text-ink'
              }`
            }
          >
            <Archive className="w-3.5 h-3.5 text-ink-soft" strokeWidth={1.5} />
            <span>Cloud Vault</span>
          </NavLink>

          {/* Desktop Account Controls */}
          {isAuthenticated ? (
            <div className="hidden md:flex items-center gap-2 pl-2 border-l border-rule">
              <Link
                to="/workspace"
                className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-kraft/40 border border-rule text-xs text-ink max-w-[140px]"
                title={user?.email}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-moss shrink-0"></span>
                <span className="truncate text-[11px] font-mono">{user?.email}</span>
              </Link>
              <button
                onClick={handleLogout}
                className="p-1.5 rounded border border-rule hover:bg-kraft text-ink-soft hover:text-ink transition-colors"
                title="Sign out of bench"
              >
                <LogOut className="w-3.5 h-3.5" strokeWidth={1.5} />
              </button>
            </div>
          ) : (
            <div className="hidden md:flex items-center gap-2">
              <Link
                to="/login"
                className="px-2.5 py-1.5 text-xs font-medium text-ink-soft hover:text-ink transition-colors"
              >
                Sign in
              </Link>
              <Link
                to="/register"
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-red text-vellum font-medium text-xs hover:bg-red-dark transition-all duration-120 shadow-ink-button active:translate-y-px"
              >
                <span>Open Vault</span>
                <ArrowRight className="w-3 h-3" strokeWidth={2} />
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
