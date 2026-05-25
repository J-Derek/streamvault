import { useState, useEffect } from "react";
import { Menu, X, Settings, Maximize2, Minimize2 } from "lucide-react";
import { NavLink, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import SearchOverlay from "@/components/layout/SearchOverlay";
import { useDownloadStore } from "@/store/downloads";

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
  { label: "Preview", href: "/preview" },
];

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `px-4 py-2 text-sm font-medium transition-colors duration-150 relative ${isActive
    ? "text-white after:absolute after:bottom-0 after:left-4 after:right-4 after:h-0.5 after:bg-[#E50914] after:rounded-full"
    : "text-[#AEAEB2] hover:text-white"
  }`;

const Navbar = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const tasks = useDownloadStore((state) => state.tasks);
  const activeTasks = Object.values(tasks).filter(
    (t) => t.status === "downloading" || t.status === "queued"
  );
  const activeCount = activeTasks.length;
  
  const activeDownload = activeTasks.find((t) => t.status === "downloading" && t.speed);
  const speed = activeDownload?.speed;

  useEffect(() => {
    let unlisten: (() => void) | null = null;

    const updateStates = async () => {
      if (isTauri) {
        try {
          const { getCurrentWindow } = await import("@tauri-apps/api/window");
          const appWindow = getCurrentWindow();
          const currentFS = await appWindow.isFullscreen();
          setIsFullscreen(currentFS);
          document.body.classList.toggle('is-fullscreen', currentFS);
        } catch (e) {
          console.error("Navbar failed to check fullscreen:", e);
        }
      }
    };

    const handleTauriFullscreen = (e: Event) => {
      const customEvent = e as CustomEvent<{ fullscreen: boolean }>;
      const isFS = !!customEvent.detail?.fullscreen;
      setIsFullscreen(isFS);
      document.body.classList.toggle('is-fullscreen', isFS);
    };

    const setupFullscreenSync = async () => {
      if (isTauri) {
        try {
          const { getCurrentWindow } = await import("@tauri-apps/api/window");
          const appWindow = getCurrentWindow();
          
          // Initial check
          await updateStates();

          // Listen to Tauri-native resize
          const unlistenFn = await appWindow.onResized(updateStates);
          unlisten = unlistenFn;
        } catch (e) {
          console.error("Failed to setup fullscreen sync in Navbar:", e);
        }
      } else {
        const handleFSChange = () => {
          setIsFullscreen(!!document.fullscreenElement);
        };
        document.addEventListener("fullscreenchange", handleFSChange);
        return () => {
          document.removeEventListener("fullscreenchange", handleFSChange);
        };
      }
    };
    
    setupFullscreenSync();

    // Bind standard webview resize, custom fullscreen, and direct tauri-fullscreen events
    window.addEventListener("resize", updateStates);
    window.addEventListener("fullscreenchange", updateStates);
    window.addEventListener("tauri-fullscreen", handleTauriFullscreen);

    return () => {
      if (unlisten) unlisten();
      window.removeEventListener("resize", updateStates);
      window.removeEventListener("fullscreenchange", updateStates);
      window.removeEventListener("tauri-fullscreen", handleTauriFullscreen);
    };
  }, []);

  const toggleGlobalFullscreen = async () => {
    if (isTauri) {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const appWindow = getCurrentWindow();
        const nextFS = !isFullscreen;
        
        // Bulletproof toggling decorations + fullscreen
        if (nextFS) {
          await appWindow.setDecorations(false);
          await appWindow.setFullscreen(true);
        } else {
          await appWindow.setFullscreen(false);
          await appWindow.setDecorations(true);
        }
        
        setIsFullscreen(nextFS);
        
        // Toggle body class and dispatch direct custom event instantly
        document.body.classList.toggle('is-fullscreen', nextFS);
        window.dispatchEvent(new CustomEvent("tauri-fullscreen", { detail: { fullscreen: nextFS } }));
        
        // Dispatch standard web events to immediately update React states
        setTimeout(() => {
          window.dispatchEvent(new Event("resize"));
          window.dispatchEvent(new Event("fullscreenchange"));
        }, 150);
      } catch (err) {
        console.error("Failed to toggle fullscreen in Navbar:", err);
      }
    } else {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(console.error);
        setIsFullscreen(true);
      } else {
        document.exitFullscreen().catch(console.error);
        setIsFullscreen(false);
      }
    }
  };

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

      <nav className="fixed left-0 right-0 z-50 h-16 bg-[#0D0D0D]/80 backdrop-blur-md border-b border-[#3A3A3C]/50 transition-all duration-200 top-0">
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
            {navLinks.map((link) => {
              const isDownloads = link.label === "Downloads";
              return (
                <NavLink
                  key={link.label}
                  to={link.href}
                  end={link.href === "/"}
                  className={navLinkClass}
                >
                  <span className="flex items-center gap-1.5 relative py-1">
                    {link.label}
                    {isDownloads && activeCount > 0 && (
                      <span className="flex items-center gap-1 ml-1">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#E50914] opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-[#E50914]"></span>
                        </span>
                        <span className="bg-[#E50914] text-[10px] text-white font-black px-1.5 py-0.5 rounded-full leading-none min-w-[16px] text-center shadow-[0_0_10px_rgba(229,9,20,0.5)]">
                          {activeCount}
                        </span>
                        {speed && (
                          <span className="text-[9px] text-[#AEAEB2] font-semibold absolute -bottom-4 left-0 whitespace-nowrap tracking-wide bg-[#0D0D0D]/60 px-1 py-0.5 rounded">
                            {speed}
                          </span>
                        )}
                      </span>
                    )}
                  </span>
                </NavLink>
              );
            })}
          </div>

          {/* Right section */}
          <div className="flex items-center gap-2">
            <button
              onClick={toggleGlobalFullscreen}
              className="flex items-center justify-center w-9 h-9 rounded-md text-[#AEAEB2] hover:text-white hover:bg-[#2C2C2E] transition-colors"
              title="Toggle Fullscreen"
              aria-label="Toggle Fullscreen"
            >
              {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
            </button>

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
              {navLinks.map((link) => {
                const isDownloads = link.label === "Downloads";
                return (
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
                    <span className="flex items-center justify-between w-full">
                      <span>{link.label}</span>
                      {isDownloads && activeCount > 0 && (
                        <span className="relative flex h-2 w-2 mr-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#E50914] opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-[#E50914]"></span>
                        </span>
                      )}
                    </span>
                  </NavLink>
                );
              })}
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
