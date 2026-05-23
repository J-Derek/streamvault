import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const SplashScreen: React.FC = () => {
    const [isVisible, setIsVisible] = useState(true);

    useEffect(() => {
        // Artificial delay to show the animation, or you can hook this into actual app readiness
        const timer = setTimeout(() => {
            setIsVisible(false);
        }, 4500); // Pulse for a few seconds

        return () => clearTimeout(timer);
    }, []);

    return (
        <AnimatePresence>
            {isVisible && (
                <motion.div
                    initial={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 1, ease: "easeInOut" }}
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0D0D0D]"
                >
                    <div className="relative flex flex-col items-center">
                        {/* The Big Red "V" Animation */}
                        <motion.div
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{
                                scale: [0.8, 1.1, 1],
                                opacity: 1,
                                filter: ["blur(10px)", "blur(0px)", "blur(0px)"]
                            }}
                            transition={{ duration: 1.5, ease: "easeOut" }}
                            className="relative"
                        >
                            <h1 className="text-7xl md:text-9xl font-black text-[#E50914] tracking-tighter italic">
                                V
                            </h1>

                            {/* Outer Glow */}
                            <motion.div
                                animate={{
                                    opacity: [0.2, 0.5, 0.2],
                                    scale: [1, 1.2, 1]
                                }}
                                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                                className="absolute inset-0 bg-[#E50914] blur-3xl opacity-20 rounded-full"
                            />
                        </motion.div>

                        {/* Subtitle */}
                        <motion.div
                            initial={{ y: 20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ delay: 1, duration: 1 }}
                            className="mt-8 flex flex-col items-center"
                        >
                            <span className="text-white font-black text-xs uppercase tracking-[0.5em] opacity-80">
                                StreamVault
                            </span>
                            <div className="mt-4 w-48 h-[2px] bg-white/10 overflow-hidden rounded-full">
                                <motion.div
                                    initial={{ x: "-100%" }}
                                    animate={{ x: "100%" }}
                                    transition={{ duration: 2.5, repeat: Infinity, ease: "linear" }}
                                    className="w-full h-full bg-gradient-to-r from-transparent via-[#E50914] to-transparent"
                                />
                            </div>
                        </motion.div>
                    </div>

                    {/* Background Ambient Particles (Optional/Extra juice) */}
                    <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-20">
                        {[...Array(6)].map((_, i) => (
                            <motion.div
                                key={i}
                                animate={{
                                    y: ["0%", "-100%"],
                                    opacity: [0, 1, 0]
                                }}
                                transition={{
                                    duration: 5 + Math.random() * 5,
                                    repeat: Infinity,
                                    delay: Math.random() * 5
                                }}
                                className="absolute w-[2px] h-20 bg-gradient-to-b from-[#E50914] to-transparent"
                                style={{ left: `${Math.random() * 100}%`, top: '100%' }}
                            />
                        ))}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default SplashScreen;
