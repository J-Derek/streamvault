import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
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
import Social from "./pages/Social.tsx";
import SocialRoom from "./pages/SocialRoom.tsx";
import Player from "./pages/Player.tsx";
import TimeFilter from "./pages/discover/TimeFilter.tsx";
import Recommendations from "./pages/discover/Recommendations.tsx";
import VibeDetect from "./pages/discover/VibeDetect.tsx";
import SwipeMatch from "./pages/discover/SwipeMatch.tsx";
import KeywordExplorer from "./pages/discover/KeywordExplorer.tsx";
import HiddenGems from "./pages/discover/HiddenGems.tsx";
import Downloads from "./pages/Downloads.tsx";
import Settings from "./pages/Settings.tsx";
import { initDownloadManager } from "./lib/downloads/manager.ts";
import { useWatchlist } from "./store/watchlist";
import { useDownloadStore } from "./store/downloads";

import SplashScreen from "@/components/layout/SplashScreen";
import { ErrorBoundary } from "@/components/ErrorBoundary";

const queryClient = new QueryClient();

const App = () => {
  const [showResumeDialog, setShowResumeDialog] = useState(false);
  const [pendingTasks, setPendingTasks] = useState<{ key: string; title: string }[]>([]);

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

    return () => { clearTimeout(timer); clearTimeout(resumeTimer); };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <SplashScreen />
        <Toaster />
        <BrowserRouter>
          <ErrorBoundary>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/browse" element={<Browse />} />
            <Route path="/discover" element={<Discover />} />
            <Route path="/discover/time" element={<TimeFilter />} />
            <Route path="/discover/recommendations" element={<Recommendations />} />
            <Route path="/discover/vibe" element={<VibeDetect />} />
            <Route path="/discover/swipe" element={<SwipeMatch />} />
            <Route path="/discover/keywords" element={<KeywordExplorer />} />
            <Route path="/discover/hidden-gems" element={<HiddenGems />} />
            <Route path="/search" element={<Search />} />
            <Route path="/title/:id" element={<TitleDetail />} />
            <Route path="/watchlist" element={<Watchlist />} />
            <Route path="/downloads" element={<Downloads />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/social" element={<Social />} />
            <Route path="/social/room/:roomId" element={<SocialRoom />} />
            <Route path="/watch/:id" element={<Player />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </ErrorBoundary>
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
