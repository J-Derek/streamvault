import { ChevronLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import Navbar from "@/components/Navbar";
import { useSettingsStore, type DefaultQuality, type PreferredSource, type PreferredExternalPlayer } from "@/store/settings";

const QUALITY_OPTIONS: { value: DefaultQuality; label: string }[] = [
    { value: "720p", label: "720p — Balanced (Default)" },
    { value: "1080p", label: "1080p — Full HD" },
    { value: "4K", label: "4K — Ultra HD" },
];

const SOURCE_OPTIONS: { value: PreferredSource; label: string; desc: string }[] = [
    { value: "ask", label: "Ask me each time", desc: "Show a popup to choose Torrent or Direct" },
    { value: "torrent", label: "Torrent (P2P)", desc: "Auto-download best torrent stream" },
    { value: "direct", label: "Direct Download", desc: "Auto-download best direct link" },
];

const PLAYBACK_OPTIONS: { value: PreferredExternalPlayer; label: string; desc: string }[] = [
    { value: "system", label: "System Default", desc: "Open files using your operating system's default media player" },
    { value: "vlc", label: "VLC Media Player", desc: "Recommended. Supports all codecs, subtitle tracks, and streams perfectly" },
    { value: "mpv", label: "MPV Player", desc: "Lightweight, high-performance minimalist media player" },
    { value: "custom", label: "Custom Executable Path", desc: "Browse and select any custom player executable (.exe)" },
];

const SettingsPage = () => {
    const navigate = useNavigate();
    const { 
        defaultQuality, 
        preferredSource, 
        preferredExternalPlayer,
        customPlayerPath,
        setDefaultQuality, 
        setPreferredSource,
        setPreferredExternalPlayer,
        setCustomPlayerPath
    } = useSettingsStore();

    const handleBrowseCustomPath = async () => {
        try {
            const { invoke } = await import("@tauri-apps/api/core");
            const result = await invoke<string | null>("browse_custom_player");
            if (result) {
                setCustomPlayerPath(result);
                setPreferredExternalPlayer("custom");
            }
        } catch (err) {
            console.error("Failed to select custom player:", err);
        }
    };

    return (
        <div className="min-h-screen bg-[#0D0D0D] text-white">
            <Navbar />
            <div className="pt-24 pb-20 px-4 md:px-8 max-w-[600px] mx-auto">
                <button
                    onClick={() => navigate(-1)}
                    className="flex items-center gap-2 text-[#AEAEB2] hover:text-white mb-6 transition-colors group"
                >
                    <ChevronLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                    <span className="font-semibold text-sm">Back</span>
                </button>

                <h1 className="text-3xl font-black tracking-tight mb-2">Settings</h1>
                <p className="text-[#AEAEB2] text-sm mb-10">Customize your download preferences</p>

                {/* Default Quality */}
                <section className="mb-8">
                    <h2 className="text-sm font-black uppercase tracking-widest text-[#AEAEB2] mb-3">
                        Default Quality
                    </h2>
                    <p className="text-[#636366] text-xs mb-4">
                        When downloading, the system will try to find your preferred quality first, then fall back to lower options.
                    </p>
                    <div className="space-y-2">
                        {QUALITY_OPTIONS.map((opt) => (
                            <button
                                key={opt.value}
                                onClick={() => setDefaultQuality(opt.value)}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left ${
                                    defaultQuality === opt.value
                                        ? "bg-[#E50914]/10 border-[#E50914]/50 text-white"
                                        : "bg-[#1C1C1E] border-[#3A3A3C] text-[#AEAEB2] hover:border-[#636366]"
                                }`}
                            >
                                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                                    defaultQuality === opt.value ? "border-[#E50914]" : "border-[#636366]"
                                }`}>
                                    {defaultQuality === opt.value && (
                                        <div className="w-2 h-2 rounded-full bg-[#E50914]" />
                                    )}
                                </div>
                                <span className="text-sm font-medium">{opt.label}</span>
                            </button>
                        ))}
                    </div>
                </section>

                {/* Default Source */}
                <section className="mb-8">
                    <h2 className="text-sm font-black uppercase tracking-widest text-[#AEAEB2] mb-3">
                        Preferred Source
                    </h2>
                    <p className="text-[#636366] text-xs mb-4">
                        Choose whether to always use a specific download method or be asked each time.
                    </p>
                    <div className="space-y-2">
                        {SOURCE_OPTIONS.map((opt) => (
                            <button
                                key={opt.value}
                                onClick={() => setPreferredSource(opt.value)}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left ${
                                    preferredSource === opt.value
                                        ? "bg-[#E50914]/10 border-[#E50914]/50 text-white"
                                        : "bg-[#1C1C1E] border-[#3A3A3C] text-[#AEAEB2] hover:border-[#636366]"
                                }`}
                            >
                                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                                    preferredSource === opt.value ? "border-[#E50914]" : "border-[#636366]"
                                }`}>
                                    {preferredSource === opt.value && (
                                        <div className="w-2 h-2 rounded-full bg-[#E50914]" />
                                    )}
                                </div>
                                <div>
                                    <p className="text-sm font-medium">{opt.label}</p>
                                    <p className="text-[10px] text-[#636366] mt-0.5">{opt.desc}</p>
                                </div>
                            </button>
                        ))}
                    </div>
                </section>

                {/* Playback Settings */}
                <section className="mb-8">
                    <h2 className="text-sm font-black uppercase tracking-widest text-[#AEAEB2] mb-3">
                        Offline Playback Fallback
                    </h2>
                    <p className="text-[#636366] text-xs mb-4">
                        Choose which external media player to use when the built-in player fails to play offline files, or when launching externally.
                    </p>
                    <div className="space-y-2">
                        {PLAYBACK_OPTIONS.map((opt) => (
                            <button
                                key={opt.value}
                                onClick={() => {
                                    setPreferredExternalPlayer(opt.value);
                                    if (opt.value === 'custom' && !customPlayerPath) {
                                        handleBrowseCustomPath();
                                    }
                                }}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left ${
                                    preferredExternalPlayer === opt.value
                                        ? "bg-[#E50914]/10 border-[#E50914]/50 text-white"
                                        : "bg-[#1C1C1E] border-[#3A3A3C] text-[#AEAEB2] hover:border-[#636366]"
                                }`}
                            >
                                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                                    preferredExternalPlayer === opt.value ? "border-[#E50914]" : "border-[#636366]"
                                }`}>
                                    {preferredExternalPlayer === opt.value && (
                                        <div className="w-2 h-2 rounded-full bg-[#E50914]" />
                                    )}
                                </div>
                                <div>
                                    <p className="text-sm font-medium">{opt.label}</p>
                                    <p className="text-[10px] text-[#636366] mt-0.5">{opt.desc}</p>
                                </div>
                            </button>
                        ))}
                    </div>

                    {preferredExternalPlayer === 'custom' && (
                        <div className="mt-3 p-3 rounded-xl bg-[#1C1C1E] border border-[#3A3A3C] flex items-center justify-between gap-3">
                            <div className="min-w-0 flex-1">
                                <p className="text-[10px] font-semibold text-[#AEAEB2] uppercase tracking-wider mb-1">Executable Path</p>
                                <p className="text-xs font-mono text-[#636366] truncate">
                                    {customPlayerPath || "No path selected yet..."}
                                </p>
                            </div>
                            <button
                                onClick={handleBrowseCustomPath}
                                className="shrink-0 px-3 py-1.5 rounded-md bg-[#2C2C2E] hover:bg-[#3A3A3C] text-xs font-bold text-white transition-colors border border-[#3A3A3C]"
                            >
                                Browse
                            </button>
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
};

export default SettingsPage;
