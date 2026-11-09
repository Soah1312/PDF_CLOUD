import React, { useState, useRef } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  Layers,
  FileText,
  Minimize2,
  FileCode,
  Lock,
  FolderLock,
  LogOut,
  Menu,
  X,
  ArrowRight
} from 'lucide-react';

const BRAND_MARK = (
  <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" aria-hidden="true">
    <rect width="24" height="24" rx="4.5" fill="#E8E8E3" />
    <path d="M6 6h8.6L18 9.35v8.15H9.15L6 14.35V6Z" fill="#111" />
    <path d="M9 9h5.15L15 9.85V15H9.85L9 14.15V9Z" fill="#E8E8E3" />
    <path d="M12 9v6M9 12h6" stroke="#111" strokeWidth=".7" />
  </svg>
);

const DOCK_SHORTCUTS = [
  {
    id: 'merge',
    label: 'Merge',
    to: '/tools/merge',
    icon: Layers,
    color: 'text-amber-400 group-hover:text-amber-300',
    dot: 'bg-amber-400',
  },
  {
    id: 'split',
    label: 'Split',
    to: '/tools/split',
    icon: FileText,
    color: 'text-sky-400 group-hover:text-sky-300',
    dot: 'bg-sky-400',
  },
  {
    id: 'compress',
    label: 'Compress',
    to: '/tools/compress',
    icon: Minimize2,
    color: 'text-emerald-400 group-hover:text-emerald-300',
    dot: 'bg-emerald-400',
  },
  {
    id: 'convert',
    label: 'To Word',
    to: '/tools/to-word',
    icon: FileCode,
    color: 'text-blue-400 group-hover:text-blue-300',
    dot: 'bg-blue-400',
  },
  {
    id: 'protect',
    label: 'Protect',
    to: '/tools/protect',
    icon: Lock,
    color: 'text-violet-400 group-hover:text-violet-300',
    dot: 'bg-violet-400',
  },
  {
    id: 'vault',
    label: 'Vault',
    to: '/workspace',
    icon: FolderLock,
    color: 'text-[#E8E8E3] group-hover:text-white',
    dot: 'bg-[#E8E8E3]',
  },
];

export const Navbar = () => {
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Proximity dock tracking
  const dockRef = useRef(null);
  const itemRefs = useRef([]);
  const [scales, setScales] = useState(new Array(DOCK_SHORTCUTS.length).fill(1));
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseMove = (e) => {
    if (!dockRef.current) return;
    const proximity = 90;
    const maxScale = 1.2;

    const newScales = itemRefs.current.map((el) => {
      if (!el) return 1;
      const rect = el.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const dist = Math.abs(e.clientX - centerX);

      if (dist < proximity) {
        const factor = Math.cos((dist / proximity) * (Math.PI / 2));
        return 1 + factor * (maxScale - 1);
      }
      return 1;
    });

    setScales(newScales);
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    setScales(new Array(DOCK_SHORTCUTS.length).fill(1));
    setIsHovered(false);
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <header className="sticky top-0 z-50 w-full pt-3 pb-2 px-4 pointer-events-none">
      <div className="max-w-6xl mx-auto flex items-center justify-between pointer-events-auto">
        {/* Brand Identity */}
        <Link
          to="/"
          className="flex items-center space-x-2.5 px-3.5 py-1.5 rounded-full bg-[#121214]/90 backdrop-blur-md border border-white/10 hover:border-white/20 transition-all duration-150 active:scale-[0.97]"
        >
          {BRAND_MARK}
          <span className="font-semibold text-xs tracking-tight text-[#E8E8E3]">
            CloudPDF
          </span>
        </Link>

        {/* Center: Animated Top Dock with Frequently Used Tools */}
        <nav
          ref={dockRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          className="hidden md:flex items-center p-1 rounded-full bg-[#121214]/95 backdrop-blur-md border border-white/10 shadow-lg shadow-black/50"
          aria-label="Frequently Used Features"
        >
          {DOCK_SHORTCUTS.map((item, idx) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.id}
                to={item.to}
                ref={(el) => (itemRefs.current[idx] = el)}
                style={{
                  transform: `scale(${scales[idx] || 1})`,
                  transition: isHovered
                    ? 'transform 80ms ease-out'
                    : 'transform 200ms cubic-bezier(0.23, 1, 0.32, 1)',
                }}
                className={({ isActive }) =>
                  `group flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors duration-150 active:scale-[0.96] origin-center ${
                    isActive
                      ? 'bg-white/10 text-white font-semibold'
                      : 'text-[#9E9E98] hover:text-[#E8E8E3] hover:bg-white/5'
                  }`
                }
              >
                <Icon className={`w-3.5 h-3.5 transition-colors ${item.color}`} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* Right: Actions */}
        <div className="hidden md:flex items-center space-x-2">
          {isAuthenticated ? (
            <div className="flex items-center space-x-2">
              <div className="flex items-center space-x-2 px-3 py-1.5 rounded-full bg-[#121214]/90 backdrop-blur-md border border-white/10 text-xs text-[#E8E8E3]">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                <span className="max-w-[120px] truncate text-[11px] font-medium">
                  {user?.email}
                </span>
              </div>
              <button
                onClick={handleLogout}
                className="px-3 py-1.5 rounded-full bg-[#121214]/90 border border-white/10 text-xs text-[#9E9E98] hover:text-white hover:bg-white/5 transition-all duration-150 active:scale-[0.97]"
                title="Sign out"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center space-x-1.5">
              <Link
                to="/login"
                className="px-3 py-1.5 rounded-full text-xs font-medium text-[#9E9E98] hover:text-[#E8E8E3] transition-colors active:scale-[0.97]"
              >
                Sign in
              </Link>
              <Link
                to="/register"
                className="inline-flex items-center space-x-1 px-3.5 py-1.5 rounded-full bg-[#E8E8E3] text-[#111113] font-semibold text-xs hover:bg-white transition-all duration-150 active:scale-[0.97] shadow-sm"
              >
                <span>Open Vault</span>
                <ArrowRight className="w-3 h-3 stroke-[2.2]" />
              </Link>
            </div>
          )}
        </div>

        {/* Mobile menu button */}
        <div className="flex md:hidden items-center">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 rounded-full bg-[#121214]/90 border border-white/10 text-[#E8E8E3] active:scale-[0.95]"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden mt-2 p-3 rounded-2xl bg-[#121214] border border-white/10 text-xs space-y-1 shadow-2xl pointer-events-auto">
          {DOCK_SHORTCUTS.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.id}
                to={item.to}
                onClick={() => setMobileMenuOpen(false)}
                className={({ isActive }) =>
                  `flex items-center space-x-2.5 px-3 py-2 rounded-xl transition-colors ${
                    isActive ? 'bg-white/10 text-white font-medium' : 'text-[#9E9E98] hover:text-[#E8E8E3]'
                  }`
                }
              >
                <Icon className={`w-4 h-4 ${item.color}`} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}

          <div className="pt-2 mt-2 border-t border-white/10 flex flex-col space-y-1.5">
            {isAuthenticated ? (
              <button
                onClick={() => {
                  handleLogout();
                  setMobileMenuOpen(false);
                }}
                className="flex items-center justify-between w-full px-3 py-2 rounded-xl text-rose-400 hover:bg-rose-950/20"
              >
                <span>Sign Out ({user?.email})</span>
                <LogOut className="w-3.5 h-3.5" />
              </button>
            ) : (
              <div className="grid grid-cols-2 gap-2 pt-1">
                <Link
                  to="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center justify-center py-2 rounded-xl border border-white/10 text-[#E8E8E3]"
                >
                  Sign in
                </Link>
                <Link
                  to="/register"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center justify-center py-2 rounded-xl bg-[#E8E8E3] text-[#111113] font-semibold"
                >
                  Open Vault
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
};

export default Navbar;
