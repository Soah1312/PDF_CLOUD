import React from 'react';
import { Link } from 'react-router-dom';

const BRAND_MARK = (
  <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" aria-hidden="true">
    <rect width="24" height="24" rx="4.5" fill="#E8E8E3" />
    <path d="M6 6h8.6L18 9.35v8.15H9.15L6 14.35V6Z" fill="#111" />
    <path d="M9 9h5.15L15 9.85V15H9.85L9 14.15V9Z" fill="#E8E8E3" />
    <path d="M12 9v6M9 12h6" stroke="#111" strokeWidth=".7" />
  </svg>
);

export const Footer = () => {
  return (
    <footer className="border-t border-white/5 bg-[#0A0A0C] py-10 mt-auto text-[#9E9E98] text-xs">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-6 pb-6 border-b border-white/5">
          <div className="flex items-center space-x-2.5">
            {BRAND_MARK}
            <span className="font-semibold text-sm tracking-tight text-white">
              CloudPDF
            </span>
            <span className="text-xs text-[#666662]">
              — Modern Document Engine
            </span>
          </div>

          <div className="flex items-center space-x-5 text-xs text-[#9E9E98]">
            <Link to="/" className="hover:text-white transition-colors">
              Tools
            </Link>
            <Link to="/workflows" className="hover:text-white transition-colors">
              Pipelines
            </Link>
            <Link to="/workspace" className="hover:text-white transition-colors">
              Cloud Vault
            </Link>
          </div>
        </div>

        <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-[#666662]">
          <div>
            Zero telemetry tracking. Guest documents are discarded immediately after processing.
          </div>
          <div>
            Built with modern web standards and end-to-end encryption.
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
