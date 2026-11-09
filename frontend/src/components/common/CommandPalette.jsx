import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ArrowRight, Shield, LogOut, LogIn, Archive, X } from 'lucide-react';
import { BINDERY_TOOLS } from '../../config/tools';
import { useAuth } from '../../context/AuthContext';

export default function CommandPalette({ isOpen, onClose }) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const navigate = useNavigate();
  const { user, isAuthenticated, logout } = useAuth();

  // Reset query and focus input when palette opens
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      document.body.style.overflow = 'hidden';
      setTimeout(() => inputRef.current?.focus(), 80);
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Build searchable items
  const items = React.useMemo(() => {
    const list = BINDERY_TOOLS.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      verb: t.verb,
      category: t.group,
      badge: t.badgeText,
      icon: t.icon,
      to: t.to,
      type: 'tool',
    }));

    // Account & Vault items
    if (isAuthenticated) {
      list.push({
        id: 'account-vault',
        title: 'Open Cloud Vault',
        description: `Signed in as ${user?.email || 'Member'}`,
        verb: 'vault',
        category: 'Account',
        icon: Archive,
        to: '/workspace',
        type: 'action',
      });
      list.push({
        id: 'account-signout',
        title: 'Sign Out of Bench',
        description: 'Terminate active session and lock cryptographic tokens',
        verb: 'lock',
        category: 'Account',
        icon: LogOut,
        action: () => {
          logout();
          onClose();
          navigate('/');
        },
        type: 'action',
      });
    } else {
      list.push({
        id: 'account-signin',
        title: 'Sign In to Cloud Vault',
        description: 'Access encrypted storage and canary watermark tracking',
        verb: 'auth',
        category: 'Account',
        icon: LogIn,
        to: '/login',
        type: 'action',
      });
    }

    if (!query.trim()) return list;

    const q = query.toLowerCase().trim();
    return list.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.verb.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q)
    );
  }, [query, isAuthenticated, user, logout, navigate, onClose]);

  // Reset selected index if search query shrinks list
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Scroll active item into view
  useEffect(() => {
    if (listRef.current) {
      const activeEl = listRef.current.querySelector('[data-active="true"]');
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  // Keyboard navigation
  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % (items.length || 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + items.length) % (items.length || 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const current = items[selectedIndex];
      if (current) {
        handleSelect(current);
      }
    }
  };

  const handleSelect = (item) => {
    onClose();
    if (item.action) {
      item.action();
    } else if (item.to) {
      navigate(item.to);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-start justify-center sm:pt-20 px-0 sm:px-4 bg-ink/50 backdrop-blur-sm transition-opacity duration-200"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Command Palette"
    >
      <div
        className="w-full sm:max-w-2xl h-[100dvh] sm:h-auto sm:max-h-[85vh] bg-vellum sm:border border-rule sm:rounded-md shadow-ink-drag flex flex-col overflow-hidden pt-safe pb-safe"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search Input Bar (Touch friendly min 44px) */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-rule bg-paper/80 shrink-0">
          <Search className="w-5 h-5 text-ink-soft shrink-0" strokeWidth={1.5} />
          <input
            ref={inputRef}
            type="text"
            className="flex-1 bg-transparent text-base sm:text-sm text-ink placeholder:text-ink-faint focus:outline-none"
            placeholder="Search bench tools or actions..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="p-1.5 text-ink-faint hover:text-ink rounded touch-target flex items-center justify-center"
              aria-label="Clear query"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-2 -mr-1 text-ink-soft hover:text-ink font-mono text-xs touch-target flex items-center justify-center rounded"
            aria-label="Cancel and close"
          >
            Cancel
          </button>
        </div>

        {/* Results List */}
        <div ref={listRef} className="flex-1 overflow-y-auto p-2 divide-y divide-rule/40 overscroll-contain">
          {items.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-sm text-ink-soft font-sans">No matching bench tools found</p>
              <p className="text-xs text-ink-faint mt-1 font-mono">
                Try searching "merge", "cut", "seal", or "press"
              </p>
            </div>
          ) : (
            items.map((item, index) => {
              const Icon = item.icon;
              const isSelected = index === selectedIndex;
              return (
                <div
                  key={item.id}
                  data-active={isSelected ? 'true' : 'false'}
                  onClick={() => handleSelect(item)}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`flex items-center gap-3 px-3 py-3 rounded cursor-pointer transition-colors duration-100 touch-target touch-press ${
                    isSelected
                      ? 'bg-marigold text-ink font-medium shadow-sm'
                      : 'hover:bg-kraft/50 text-ink'
                  }`}
                >
                  <div
                    className={`p-2 rounded border border-rule shrink-0 ${
                      isSelected ? 'bg-vellum text-ink' : 'bg-paper text-ink-soft'
                    }`}
                  >
                    <Icon className="w-4 h-4" strokeWidth={1.5} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold truncate">{item.title}</span>
                      <span
                        className={`text-[9px] font-mono px-1 py-0.2 rounded uppercase tracking-mono ${
                          isSelected
                            ? 'bg-ink text-vellum'
                            : 'bg-kraft/80 text-ink-soft border border-rule/60'
                        }`}
                      >
                        {item.verb}
                      </span>
                    </div>
                    <p
                      className={`text-xs truncate mt-0.5 ${
                        isSelected ? 'text-ink/80' : 'text-ink-soft'
                      }`}
                    >
                      {item.description}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <ArrowRight
                      className={`w-4 h-4 transition-transform duration-120 ${
                        isSelected ? 'translate-x-0.5 text-ink' : 'text-ink-faint'
                      }`}
                      strokeWidth={1.5}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer info bar on desktop */}
        <div className="hidden sm:flex px-4 py-2 border-t border-rule bg-paper/80 items-center justify-between text-[11px] font-mono text-ink-faint shrink-0">
          <div className="flex items-center gap-3">
            <span>↑↓ Navigate</span>
            <span>↵ Select</span>
            <span>ESC Close</span>
          </div>
          <span>CloudPDF — The Bindery</span>
        </div>
      </div>
    </div>
  );
}
