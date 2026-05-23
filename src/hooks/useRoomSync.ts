import { useState, useEffect, useRef, useCallback } from "react";

export interface ChatMessage {
    id: number;
    name: string;
    initial: string;
    color: string;
    text: string;
    time: string;
}

export interface Participant {
    name: string;
    initial: string;
    color: string;
}

export interface PlaybackEvent {
    nickname: string;
    action: "play" | "pause" | "seek";
    timestamp: number;
    currentTime: number;
}

export interface ReactionEvent {
    nickname: string;
    emoji: string;
}

const RECONNECT_DELAYS = [1000, 2000, 3000, 5000, 10000];
const RELAY_URL = import.meta.env.VITE_RELAY_URL || "ws://localhost:3001";

interface UseRoomSyncOptions {
    roomId: string;
    nickname: string;
    initial: string;
    color: string;
}

export function useRoomSync({ roomId, nickname, initial, color }: UseRoomSyncOptions) {
    const [connected, setConnected] = useState(false);
    const [participants, setParticipants] = useState<Participant[]>([]);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [reactions, setReactions] = useState<ReactionEvent[]>([]);
    const [playbackEvent, setPlaybackEvent] = useState<PlaybackEvent | null>(null);

    const wsRef = useRef<WebSocket | null>(null);
    const reconnectAttempt = useRef(0);
    const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const msgIdCounter = useRef(0);
    const nicknameRef = useRef(nickname);

    nicknameRef.current = nickname;

    const connect = useCallback(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) return;

        try {
            const ws = new WebSocket(RELAY_URL);

            ws.onopen = () => {
                console.log("WS connected to relay");
                reconnectAttempt.current = 0;
                setConnected(true);

                ws.send(JSON.stringify({
                    type: "join",
                    roomId,
                    nickname: nicknameRef.current,
                    initial,
                    color,
                }));
            };

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    switch (data.type) {
                        case "joined": {
                            setParticipants(data.participants || []);
                            if (data.nickname !== nicknameRef.current) {
                                setMessages(prev => [...prev, {
                                    id: msgIdCounter.current++,
                                    name: data.nickname,
                                    initial: data.initial || data.nickname[0],
                                    color: data.color || "#636366",
                                    text: "joined the room",
                                    time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                                }]);
                            }
                            break;
                        }
                        case "left": {
                            setParticipants(data.participants || []);
                            setMessages(prev => [...prev, {
                                id: msgIdCounter.current++,
                                name: data.nickname,
                                initial: data.nickname[0],
                                color: "#636366",
                                text: "left the room",
                                time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                            }]);
                            break;
                        }
                        case "chat": {
                            setMessages(prev => [...prev, {
                                id: msgIdCounter.current++,
                                name: data.nickname,
                                initial: data.initial || data.nickname[0],
                                color: data.color || "#636366",
                                text: data.text,
                                time: data.time,
                            }]);
                            break;
                        }
                        case "reaction": {
                            setReactions(prev => [...prev, { nickname: data.nickname, emoji: data.emoji }]);
                            setTimeout(() => {
                                setReactions(prev => prev.filter(r => r.emoji !== data.emoji || r.nickname !== data.nickname));
                            }, 3000);
                            break;
                        }
                        case "playback": {
                            setPlaybackEvent({
                                nickname: data.nickname,
                                action: data.action,
                                timestamp: data.timestamp,
                                currentTime: data.currentTime,
                            });
                            break;
                        }
                        case "error": {
                            console.error("Relay error:", data.message);
                            break;
                        }
                    }
                } catch (e) {
                    console.error("Failed to parse WS message:", e);
                }
            };

            ws.onclose = () => {
                setConnected(false);
                wsRef.current = null;

                const delay = RECONNECT_DELAYS[Math.min(reconnectAttempt.current, RECONNECT_DELAYS.length - 1)];
                reconnectAttempt.current++;
                console.log(`WS disconnected, reconnecting in ${delay}ms...`);
                reconnectTimer.current = setTimeout(connect, delay);
            };

            ws.onerror = (err) => {
                console.error("WS error:", err);
            };

            wsRef.current = ws;
        } catch (e) {
            console.error("Failed to create WS connection:", e);
            const delay = RECONNECT_DELAYS[Math.min(reconnectAttempt.current, RECONNECT_DELAYS.length - 1)];
            reconnectAttempt.current++;
            reconnectTimer.current = setTimeout(connect, delay);
        }
    }, [roomId, initial, color]);

    useEffect(() => {
        connect();
        return () => {
            if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
            if (wsRef.current) {
                try {
                    wsRef.current.send(JSON.stringify({ type: "leave", roomId }));
                } catch { }
                wsRef.current.close();
                wsRef.current = null;
            }
        };
    }, [roomId, connect]);

    const sendChat = useCallback((text: string) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: "chat", roomId, text }));
            setMessages(prev => [...prev, {
                id: msgIdCounter.current++,
                name: nickname,
                initial,
                color,
                text,
                time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            }]);
        }
    }, [roomId, nickname, initial, color]);

    const sendReaction = useCallback((emoji: string) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: "reaction", roomId, emoji }));
        }
    }, [roomId]);

    const sendPlayback = useCallback((action: "play" | "pause" | "seek", currentTime: number) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
                type: "playback",
                roomId,
                action,
                timestamp: Date.now(),
                currentTime,
            }));
        }
    }, [roomId]);

    return {
        connected,
        participants,
        messages,
        reactions,
        playbackEvent,
        sendChat,
        sendReaction,
        sendPlayback,
    };
}
