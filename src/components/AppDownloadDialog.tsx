import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Monitor, Smartphone, Download, CheckCircle2, Shield } from "lucide-react";

interface AppDownloadDialogProps {
    children: React.ReactNode;
}

const AppDownloadDialog = ({ children }: AppDownloadDialogProps) => {
    return (
        <Dialog>
            <DialogTrigger asChild>
                {children}
            </DialogTrigger>
            <DialogContent className="bg-[#1C1C1E] border-[#3A3A3C] text-white max-w-md p-8 rounded-2xl overflow-hidden shadow-2xl">
                <div className="absolute top-0 left-0 w-full h-1 bg-[#E50914]" />

                <DialogHeader className="space-y-4">
                    <div className="w-16 h-16 bg-[#E50914]/10 rounded-2xl flex items-center justify-center border border-[#E50914]/30 shadow-[0_0_30px_rgba(229,9,20,0.15)] mx-auto mb-2 animate-in zoom-in duration-500">
                        <Download className="w-8 h-8 text-[#E50914]" />
                    </div>
                    <DialogTitle className="text-2xl font-black text-center tracking-tight">
                        Unlock Offline Downloads
                    </DialogTitle>
                    <DialogDescription className="text-[#AEAEB2] text-center text-base leading-relaxed">
                        To download movies and watch them securely without an internet connection, please use our native applications.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 mt-8">
                    {/* Desktop Option */}
                    <div className="group relative overflow-hidden flex items-center gap-4 p-4 rounded-xl bg-[#2C2C2E]/50 border border-[#3A3A3C] hover:border-[#E50914]/50 transition-all cursor-pointer">
                        <div className="w-12 h-12 rounded-lg bg-[#E50914] flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform">
                            <Monitor className="w-6 h-6 text-white" />
                        </div>
                        <div className="flex-1">
                            <h4 className="font-bold text-lg mb-0.5">Desktop App</h4>
                            <p className="text-[#AEAEB2] text-xs uppercase font-bold tracking-widest">Windows & macOS</p>
                        </div>
                        <Button size="sm" className="bg-white/5 hover:bg-white/10 text-white border border-white/10">
                            Download
                        </Button>
                    </div>

                    {/* APK Option */}
                    <div className="group relative overflow-hidden flex items-center gap-4 p-4 rounded-xl bg-[#2C2C2E]/50 border border-[#3A3A3C] hover:border-[#00B4D8]/50 transition-all cursor-pointer">
                        <div className="w-12 h-12 rounded-lg bg-[#00B4D8] flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform">
                            <Smartphone className="w-6 h-6 text-white" />
                        </div>
                        <div className="flex-1">
                            <h4 className="font-bold text-lg mb-0.5">Android APK</h4>
                            <p className="text-[#AEAEB2] text-xs uppercase font-bold tracking-widest">Direct Installation</p>
                        </div>
                        <Button size="sm" className="bg-white/5 hover:bg-white/10 text-white border border-white/10">
                            Get APK
                        </Button>
                    </div>
                </div>

                <div className="mt-8 flex flex-col gap-3">
                    <div className="flex items-center gap-2 text-[#AEAEB2] text-xs font-medium bg-black/20 p-3 rounded-lg border border-white/5">
                        <Shield className="w-4 h-4 text-[#34C759]" />
                        Secure Offline Encryption Enabled
                    </div>
                    <div className="flex items-center gap-2 text-[#AEAEB2] text-xs font-medium bg-black/20 p-3 rounded-lg border border-white/5">
                        <CheckCircle2 className="w-4 h-4 text-[#34C759]" />
                        Ad-free experience in apps
                    </div>
                </div>

                <div className="mt-6 pt-6 border-t border-white/5 text-center text-[10px] text-[#636366] uppercase font-bold tracking-[0.2em]">
                    Powered by StreamVault Global
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default AppDownloadDialog;
