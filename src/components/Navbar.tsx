import { useState, useEffect } from "react";
import { Menu, X, Settings } from "lucide-react";
import { NavLink, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import SearchOverlay from "@/components/layout/SearchOverlay";

// Simple platform check
const isTauri = !!(
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.TAURI_ENV_PLATFORM) ||
  (typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window || 'isTauri' in window))
);

const navLinks = [
  { label: "Home", href: "/" },
  { label: "Browse", href: "/browse" },
  { label: "Discover", href: "/discover" },
  { label: "Watchlist", href: "/watchlist" },
  ...(isTauri ? [{ label: "Downloads", href: "/downloads" }] : []),
  { label: "Social", href: "/social" },
];

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `px-4 py-2 text-sm font-medium transition-colors duration-150 relative ${isActive
    ? "text-white after:absolute after:bottom-0 after:left-4 after:right-4 after:h-0.5 after:bg-[#E50914] after:rounded-full"
    : "text-[#AEAEB2] hover:text-white"
  }`;

const Navbar = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  // Global "/" key opens search overlay
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (e.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <>
      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />

      <nav className="fixed top-0 left-0 right-0 z-50 h-16 bg-[#0D0D0D]/80 backdrop-blur-md border-b border-[#3A3A3C]/50">
        <div className="flex items-center justify-between h-full px-4 md:px-8 max-w-[1400px] mx-auto">
          {/* Logo lockup */}
          <Link to="/" className="flex items-center gap-2.5 shrink-0 group">
            {/* Custom SVG Icon: Vault + Play */}
            <div className="relative w-8 h-8 flex items-center justify-center bg-gradient-to-br from-[#E50914] to-[#90000a] rounded-lg shadow-[0_0_15px_rgba(229,9,20,0.4)] group-hover:shadow-[0_0_20px_rgba(229,9,20,0.6)] transition-all duration-300 ring-1 ring-white/10">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-white">
                {/* Outer Vault Safe */}
                <rect x="3" y="3" width="18" height="18" rx="4" />
                {/* Inner combination dial */}
                <circle cx="12" cy="12" r="5" className="opacity-50" />
                {/* Play button inside */}
                <polygon points="10.5,9.5 14.5,12 10.5,14.5" fill="currentColor" stroke="none" />
              </svg>
            </div>
            {/* Logotype */}
            <div className="flex items-center tracking-tighter">
              <span className="text-[#E50914] font-display font-black text-xl md:text-2xl drop-shadow-sm">STREAM</span>
              <span className="text-white font-display font-black text-xl md:text-2xl drop-shadow-sm">VAULT</span>
            </div>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <NavLink
                key={link.label}
                to={link.href}
                end={link.href === "/"}
                className={navLinkClass}
              >
                {link.label}
              </NavLink>
            ))}
          </div>

          {/* Right section */}
          <div className="flex items-center gap-2">
            <Link
              to="/settings"
              className="flex items-center justify-center w-9 h-9 rounded-md text-[#AEAEB2] hover:text-white hover:bg-[#2C2C2E] transition-colors"
              aria-label="Settings"
            >
              <Settings className="w-5 h-5" />
            </Link>

            {/* Search button — tooltip on hover */}
            <button
              onClick={() => setSearchOpen(true)}
              title="Press / to search"
              className="flex items-center justify-center w-9 h-9 rounded-md text-[#AEAEB2] hover:text-white hover:bg-[#2C2C2E] transition-colors"
              aria-label="Open search"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
              </svg>
            </button>

            {/* Profile */}
            <Link to="/watchlist" aria-label="View your watchlist" className="hidden md:flex items-center justify-center w-9 h-9 rounded-full bg-[#E50914] text-sm font-bold text-white select-none hover:bg-[#B00610] transition-colors">
              SV
            </Link>

            {/* Mobile menu toggle */}
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden text-[#AEAEB2] hover:text-white"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </Button>
          </div>
        </div>

        {/* Mobile drawer */}
        {mobileOpen && (
          <div className="md:hidden absolute top-16 right-0 w-64 bg-[#1C1C1E] border-l border-[#3A3A3C] shadow-2xl">
            <div className="flex flex-col p-4 gap-1">
              {navLinks.map((link) => (
                <NavLink
                  key={link.label}
                  to={link.href}
                  end={link.href === "/"}
                  className={({ isActive }) =>
                    `px-4 py-3 text-sm font-medium rounded-md transition-colors ${isActive
                      ? "text-white bg-[#E50914]/10 border-l-2 border-[#E50914]"
                      : "text-[#AEAEB2] hover:text-white hover:bg-[#2C2C2E]"
                    }`
                  }
                  onClick={() => setMobileOpen(false)}
                >
                  {link.label}
                </NavLink>
              ))}
              <div className="border-t border-[#3A3A3C] mt-2 pt-2 space-y-1">
                <Link
                  to="/settings"
                  onClick={() => setMobileOpen(false)}
                  className="block w-full text-left px-4 py-3 text-sm text-[#AEAEB2] hover:text-white rounded-md hover:bg-[#2C2C2E] transition-colors"
                >
                  Settings
                </Link>
                <button
                  onClick={() => { setMobileOpen(false); setSearchOpen(true); }}
                  className="w-full text-left px-4 py-3 text-sm text-[#AEAEB2] hover:text-white block rounded-md hover:bg-[#2C2C2E] transition-colors"
                >
                  Search <kbd className="ml-1 text-xs bg-[#2C2C2E] px-1 rounded">/</kbd>
                </button>
              </div>
            </div>
          </div>
        )}
      </nav>
    </>
  );
};

export default Navbar;
