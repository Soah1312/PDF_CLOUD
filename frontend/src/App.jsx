import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Navbar from './components/layout/Navbar';
import Footer from './components/layout/Footer';
import ProtectedRoute from './components/common/ProtectedRoute';
import CommandPalette from './components/common/CommandPalette';
import MobileBottomNav from './components/layout/MobileBottomNav';
import ToolsBottomSheet from './components/common/ToolsBottomSheet';

// Pages
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import ConfirmEmail from './pages/ConfirmEmail';
import Workspace from './pages/Workspace';
import WorkflowStudio from './pages/WorkflowStudio';
import ToolRunner from './pages/ToolRunner';

function AppContent() {
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [toolsSheetOpen, setToolsSheetOpen] = useState(false);

  // Global Ctrl+K / Cmd+K handler
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="flex flex-col min-h-screen bg-paper text-ink font-sans selection:bg-marigold selection:text-ink relative pb-16 md:pb-0">
      {/* Subtle paper-grain texture overlay (auto-hidden on low-end/mobile) */}
      <div className="paper-grain-overlay" aria-hidden="true" />

      {/* Global Command Palette (Full-screen search sheet on mobile) */}
      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
      />

      {/* Mobile Tools Bottom Sheet */}
      <ToolsBottomSheet
        isOpen={toolsSheetOpen}
        onClose={() => setToolsSheetOpen(false)}
      />

      {/* Top Bar */}
      <Navbar
        onOpenCommandPalette={() => setCommandPaletteOpen(true)}
        onOpenToolsSheet={() => setToolsSheetOpen(true)}
      />

      {/* Main Content Area */}
      <main className="flex-1">
        <Routes>
          {/* Public & Guest Accessible Routes */}
          <Route path="/" element={<Home />} />
          <Route path="/tools/:toolId" element={<ToolRunner />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/confirm" element={<ConfirmEmail />} />
          <Route path="/workflows" element={<WorkflowStudio />} />
          <Route path="/pipelines" element={<WorkflowStudio />} />

          {/* Protected Authenticated Member Routes */}
          <Route
            path="/workspace"
            element={
              <ProtectedRoute>
                <Workspace />
              </ProtectedRoute>
            }
          />

          {/* Catch-all Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      {/* Desktop Footer */}
      <Footer />

      {/* Fixed Mobile Bottom Tab Bar (Home, Tools, Search, Vault, Account) */}
      <MobileBottomNav
        onOpenToolsSheet={() => setToolsSheetOpen(true)}
        onOpenSearchSheet={() => setCommandPaletteOpen(true)}
      />
    </div>
  );
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </Router>
  );
}

export default App;
