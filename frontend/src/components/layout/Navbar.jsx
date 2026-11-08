import React, { useState, useEffect } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { checkHealth } from '../../services/api';
import {
  FileText,
  Cloud,
  LogOut,
  LogIn,
  UserPlus,
  ShieldCheck,
  User,
  Activity,
  Menu,
  X,
  Layers,
  FolderLock
} from 'lucide-react';

export const Navbar = () => {
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [healthStatus, setHealthStatus] = useState({
    status: 'checking',
    database_connected: false,
    environment: '...',
  });

  useEffect(() => {
    let isMounted = true;
    const fetchStatus = async () => {
      try {
        const data = await checkHealth();
        if (isMounted) setHealthStatus(data);
      } catch (err) {
        if (isMounted) {
          setHealthStatus({
            status: 'offline',
            database_connected: false,
            environment: 'unreachable',
          });
        }
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 30000); // 30s poll
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <nav className="sticky top-0 z-50 glass-panel border-b border-slate-800 bg-slate-950/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand Logo & AWS Badge */}
          <div className="flex items-center space-x-3">
            <Link to="/" className="flex items-center space-x-2.5 group">
              <div className="w-9 h-9 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20 group-hover:scale-105 transition-transform">
                <FileText className="w-5 h-5" />
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-base text-white tracking-tight flex items-center">
                  CloudPDF <span className="text-indigo-400 ml-1 font-semibold">Studio</span>
                </span>
                <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400 flex items-center">
                  <Cloud className="w-2.5 h-2.5 mr-1 text-sky-400" /> AWS Cloud Edition
                </span>
              </div>
            </Link>

            {/* Live Backend Telemetry Pill */}
            <div className="hidden lg:flex items-center ml-4 px-2.5 py-1 rounded-full bg-slate-900 border border-slate-800 text-xs text-slate-300">
              <span
                className={`w-2 h-2 rounded-full mr-2 ${
                  healthStatus.database_connected
                    ? 'bg-emerald-400 shadow-sm shadow-emerald-400/50'
                    : healthStatus.status === 'offline'
                    ? 'bg-rose-500'
                    : 'bg-amber-400 animate-pulse'
                }`}
              />
              <span className="font-mono text-[11px]">
                {healthStatus.database_connected ? 'RDS Live' : 'DB Offline'}
              </span>
            </div>
          </div>

          {/* Navigation Links */}
          <div className="hidden md:flex items-center space-x-1">
            <NavLink
              to="/"
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                }`
              }
            >
              Tools
            </NavLink>
            <NavLink
              to="/workflows"
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-lg text-sm font-medium flex items-center transition-colors ${
                  isActive
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                }`
              }
            >
              <Layers className="w-4 h-4 mr-1.5 text-indigo-400" />
              Workflows
            </NavLink>
            <NavLink
              to="/workspace"
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-lg text-sm font-medium flex items-center transition-colors ${
                  isActive
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                }`
              }
            >
              <FolderLock className="w-4 h-4 mr-1.5 text-sky-400" />
              My Workspace
            </NavLink>
          </div>

          {/* Auth State & Call to Actions */}
          <div className="hidden md:flex items-center space-x-3">
            {isAuthenticated ? (
              <div className="flex items-center space-x-3">
                {/* Member Badge & Email */}
                <div className="flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-slate-900 border border-indigo-500/30 text-xs">
                  <span className="flex items-center text-indigo-400 font-semibold">
                    <ShieldCheck className="w-3.5 h-3.5 mr-1" /> Member
                  </span>
                  <span className="text-slate-500">|</span>
                  <span className="text-slate-200 font-mono max-w-[160px] truncate">
                    {user?.email}
                  </span>
                </div>

                {/* Sign Out Button */}
                <button
                  onClick={handleLogout}
                  className="flex items-center text-xs font-medium px-3 py-1.5 rounded-lg text-slate-300 bg-slate-800/80 hover:bg-rose-500/20 hover:text-rose-300 hover:border-rose-500/40 border border-slate-700 transition-all"
                >
                  <LogOut className="w-3.5 h-3.5 mr-1.5" />
                  Sign Out
                </button>
              </div>
            ) : (
              <div className="flex items-center space-x-3">
                {/* Guest Mode Pill */}
                <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  Guest Mode
                </span>

                <Link
                  to="/login"
                  className="flex items-center text-xs font-semibold px-3 py-1.5 rounded-lg text-slate-200 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  <LogIn className="w-3.5 h-3.5 mr-1.5" />
                  Sign In
                </Link>

                <Link
                  to="/register"
                  className="flex items-center text-xs font-semibold px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm shadow-indigo-600/30 transition-all"
                >
                  <UserPlus className="w-3.5 h-3.5 mr-1.5" />
                  Create Account
                </Link>
              </div>
            )}
          </div>

          {/* Mobile menu button */}
          <div className="flex md:hidden items-center">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 focus:outline-none"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-slate-800 bg-slate-900/95 px-4 pt-2 pb-4 space-y-2">
          <NavLink
            to="/"
            onClick={() => setMobileMenuOpen(false)}
            className="block px-3 py-2 rounded-md text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800"
          >
            Tools
          </NavLink>
          <NavLink
            to="/workflows"
            onClick={() => setMobileMenuOpen(false)}
            className="block px-3 py-2 rounded-md text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800"
          >
            Workflows
          </NavLink>
          <NavLink
            to="/workspace"
            onClick={() => setMobileMenuOpen(false)}
            className="block px-3 py-2 rounded-md text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800"
          >
            My Workspace
          </NavLink>

          <div className="pt-3 border-t border-slate-800 flex flex-col space-y-2">
            {isAuthenticated ? (
              <>
                <div className="px-3 py-1.5 text-xs text-indigo-400">
                  Signed in as <span className="text-white font-mono">{user?.email}</span>
                </div>
                <button
                  onClick={() => {
                    handleLogout();
                    setMobileMenuOpen(false);
                  }}
                  className="flex items-center w-full px-3 py-2 rounded-md text-sm font-medium text-rose-400 hover:bg-rose-500/10"
                >
                  <LogOut className="w-4 h-4 mr-2" /> Sign Out
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center px-3 py-2 rounded-md text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800"
                >
                  <LogIn className="w-4 h-4 mr-2" /> Sign In
                </Link>
                <Link
                  to="/register"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center justify-center px-3 py-2 rounded-md text-sm font-medium bg-indigo-600 text-white"
                >
                  <UserPlus className="w-4 h-4 mr-2" /> Create Free Account
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;

