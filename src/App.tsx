import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel,
    AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
    AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import Browse from "./pages/Browse.tsx";
import Discover from "./pages/Discover.tsx";
import Search from "./pages/Search.tsx";
import TitleDetail from "./pages/TitleDetail.tsx";
import Watchlist from "./pages/Watchlist.tsx";
import Preview from "./pages/Preview.tsx";
import Player from "./pages/Player.tsx";
import Downloads from "./pages/Downloads.tsx";
import Settings from "./pages/Settings.tsx";
import Onboarding from "./pages/Onboarding.tsx";
import { initDownloadManager } from "./lib/downloads/manager.ts";
import { useWatchlist } from "./store/watchlist";
import { useDownloadStore } from "./store/downloads";

import SplashScreen from "@/components/layout/SplashScreen";
import { ErrorBoundary } from "@/components/ErrorBoundary";

const queryClient = new QueryClient();

const isTauri = !!(
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.TAURI_ENV_PLATFORM) ||
  (typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window || 'isTauri' in window))
);

const MainLayout = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();
  const isPlayer = location.pathname.startsWith("/watch/");
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (!isTauri) return;

    let unlistenResize: (() => void) | null = null;

    const updateStates = async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const appWindow = getCurrentWindow();
        const fsState = await appWindow.isFullscreen();
        setIsFullscreen(fsState);
        document.body.classList.toggle('is-fullscreen', fsState);
      } catch (err) {
        console.error("Failed to check fullscreen state:", err);
      }
    };

    const handleTauriFullscreen = (e: Event) => {
      const customEvent = e as CustomEvent<{ fullscreen: boolean }>;
      const isFS = !!customEvent.detail?.fullscreen;
      setIsFullscreen(isFS);
      document.body.classList.toggle('is-fullscreen', isFS);
    };

    const setupListeners = async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const appWindow = getCurrentWindow();

        // Initial check
        await updateStates();

        // Listen for Tauri-native resizing events
        const unlisten = await appWindow.onResized(updateStates);
        unlistenResize = unlisten;
      } catch (err) {
        console.error("Failed to setup Tauri fullscreen listeners in MainLayout:", err);
      }
    };

    setupListeners();

    // Bind standard webview resize, custom fullscreen, and direct tauri-fullscreen events
    window.addEventListener("resize", updateStates);
    window.addEventListener("fullscreenchange", updateStates);
    window.addEventListener("tauri-fullscreen", handleTauriFullscreen);

    return () => {
      window.removeEventListener("resize", updateStates);
      window.removeEventListener("fullscreenchange", updateStates);
      window.removeEventListener("tauri-fullscreen", handleTauriFullscreen);
      if (unlistenResize) unlistenResize();
    };
  }, []);

  return (
    <div
      data-layout-padding
      className="min-h-screen flex flex-col transition-all duration-200"
    >
      {children}
    </div>
  );
};

const App = () => {
  const [showResumeDialog, setShowResumeDialog] = useState(false);
  const [pendingTasks, setPendingTasks] = useState<{ key: string; title: string }[]>([]);
  const [onboarded, setOnboarded] = useState<boolean>(() => {
    return localStorage.getItem("sv_onboarded") === "true";
  });

  useEffect(() => {
    initDownloadManager();

    // Native Torrent Engine is initialized automatically in Rust setup

    // Defer sync to ensure core store is ready
    const timer = setTimeout(() => {
      useWatchlist.getState().syncWithDisk();
      useDownloadStore.getState().syncWithDisk();
    }, 500);

    // Check for unfinished downloads after hydration + disk sync
    const resumeTimer = setTimeout(() => {
      const state = useDownloadStore.getState();
      const unfinished = Object.entries(state.tasks).filter(
        ([_, t]) => t.status === 'downloading' || t.status === 'queued' || t.status === 'paused'
      );
      if (unfinished.length > 0) {
        setPendingTasks(
          unfinished.map(([key, t]) => ({
            key,
            title: t.media?.title ?? key,
          }))
        );
        setShowResumeDialog(true);
      }
    }, 1200);

    const handleGlobalF11 = async (e: KeyboardEvent) => {
      if (e.key === "F11") {
        e.preventDefault();
        if (isTauri) {
          try {
            const { getCurrentWindow } = await import("@tauri-apps/api/window");
            const appWindow = getCurrentWindow();
            const currentlyFullscreen = await appWindow.isFullscreen();
            const nextFS = !currentlyFullscreen;
            
            // On custom titlebar, decorations are already off by default.
            // On Win10, toggling fullscreen + decorations ensures taskbar is hidden properly.
            if (nextFS) {
              await appWindow.setDecorations(false);
              await appWindow.setFullscreen(true);
            } else {
              await appWindow.setFullscreen(false);
              await appWindow.setDecorations(true);
            }
            
            // Toggle body class and dispatch custom event
            document.body.classList.toggle('is-fullscreen', nextFS);
            window.dispatchEvent(new CustomEvent("tauri-fullscreen", { detail: { fullscreen: nextFS } }));
            
            // Dispatch standard web events to immediately update React states
            setTimeout(() => {
              window.dispatchEvent(new Event("resize"));
              window.dispatchEvent(new Event("fullscreenchange"));
            }, 150);
          } catch (err) {
            console.error("Tauri global F11 failed:", err);
          }
        } else {
          if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(console.error);
          } else {
            document.exitFullscreen().catch(console.error);
          }
        }
      }
    };

    window.addEventListener("keydown", handleGlobalF11);

    return () => { 
      clearTimeout(timer); 
      clearTimeout(resumeTimer); 
      window.removeEventListener("keydown", handleGlobalF11);
    };
  }, []);

  if (!onboarded) {
    return (
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <SplashScreen />
          <Toaster />
          <BrowserRouter>
            <MainLayout>
              <Onboarding onComplete={() => setOnboarded(true)} />
            </MainLayout>
          </BrowserRouter>
        </TooltipProvider>
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <SplashScreen />
        <Toaster />
        <BrowserRouter>
          <MainLayout>
            <ErrorBoundary>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/browse" element={<Browse />} />
                <Route path="/discover" element={<Discover />} />
                <Route path="/search" element={<Search />} />
                <Route path="/title/:id" element={<TitleDetail />} />
                <Route path="/watchlist" element={<Watchlist />} />
                <Route path="/downloads" element={<Downloads />} />
                <Route path="/preview" element={<Preview />} />
                <Route path="/onboarding" element={<Onboarding onComplete={() => setOnboarded(true)} />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/watch/:id" element={<Player />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </ErrorBoundary>
          </MainLayout>
        </BrowserRouter>

        {/* Resume unfinished downloads dialog */}
        <AlertDialog open={showResumeDialog} onOpenChange={setShowResumeDialog}>
          <AlertDialogContent className="bg-[#1C1C1E] border-[#3A3A3C] text-white max-h-[80vh] overflow-y-auto">
            <AlertDialogHeader>
              <AlertDialogTitle>Unfinished Downloads</AlertDialogTitle>
              <AlertDialogDescription className="text-[#AEAEB2]">
                You have {pendingTasks.length} download{pendingTasks.length > 1 ? 's' : ''} from your last session:
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-2 my-2">
              {pendingTasks.map((pt) => (
                <div key={pt.key} className="flex items-center gap-3 px-3 py-2 bg-white/5 rounded-lg">
                  <div className="w-2 h-2 rounded-full bg-[#FF9F0A] animate-pulse shrink-0" />
                  <span className="text-sm text-white truncate">{pt.title}</span>
                </div>
              ))}
            </div>
            <AlertDialogFooter>
              <AlertDialogAction
                onClick={() => {
                  const state = useDownloadStore.getState();
                  for (const pt of pendingTasks) state.removeTask(pt.key);
                  setShowResumeDialog(false);
                }}
                className="bg-[#E50914] hover:bg-[#B00610] text-white"
              >
                Dismiss All
              </AlertDialogAction>
              <AlertDialogCancel
                onClick={() => setShowResumeDialog(false)}
                className="bg-transparent border-[#3A3A3C] text-white hover:bg-white/5"
              >
                Resume All
              </AlertDialogCancel>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
