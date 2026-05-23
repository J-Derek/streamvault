import React from 'react';
import { motion } from 'framer-motion';

interface CinematicLoaderProps {
    /** Text to display below the loader */
    text?: string;
    /** Whether to fill the entire screen or just its container */
    fullScreen?: boolean;
}

const CinematicLoader: React.FC<CinematicLoaderProps> = ({
    text = "Loading...",
    fullScreen = true
}) => {
    return (
        <div
            className={`flex flex-col items-center justify-center bg-[#0D0D0D] ${fullScreen ? 'min-h-screen w-full fixed inset-0 z-50' : 'h-full w-full py-24'
                }`}
        >
            <div className="relative flex items-center justify-center">
                {/* Outer glowing orbital ring 1 */}
                <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                    className="absolute w-20 h-20 md:w-24 md:h-24 rounded-full border-[2px] border-t-[#E50914] border-r-transparent border-b-transparent border-l-transparent drop-shadow-[0_0_10px_rgba(229,9,20,0.6)]"
                />

                {/* Inner orbital ring 2 */}
                <motion.div
                    animate={{ rotate: -360 }}
                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                    className="absolute w-14 h-14 md:w-16 md:h-16 rounded-full border-[2px] border-t-white/30 border-r-white/30 border-b-transparent border-l-transparent opacity-60"
                />

                {/* Central Logo/Icon */}
                <div className="relative bg-gradient-to-br from-[#E50914] to-[#90000a] w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center shadow-[0_0_15px_rgba(229,9,20,0.4)] ring-1 ring-white/10 z-10">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 md:w-5 md:h-5 text-white ml-0.5">
                        <polygon points="10.5,9.5 14.5,12 10.5,14.5" fill="currentColor" stroke="none" />
                    </svg>
                </div>
            </div>

            {/* Animated Text */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.8 }}
                className="mt-8 flex flex-col items-center"
            >
                <motion.span
                    animate={{ opacity: [0.5, 1, 0.5] }}
                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                    className="text-white font-medium text-sm md:text-base tracking-[0.2em] ml-1"
                >
                    {text}
                </motion.span>

                {/* Minimal loading bar line beneath the text */}
                <div className="mt-3 w-32 h-[1px] bg-white/5 overflow-hidden rounded-full">
                    <motion.div
                        initial={{ x: "-100%" }}
                        animate={{ x: "100%" }}
                        transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                        className="w-full h-full bg-gradient-to-r from-transparent via-[#E50914] to-transparent"
                    />
                </div>
            </motion.div>
        </div>
    );
};

export default CinematicLoader;
