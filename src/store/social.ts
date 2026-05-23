import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface RoomParticipant {
    name: string;
    initial: string;
    color: string;
    joinedAt: number;
}

export interface SocialRoom {
    id: string;
    title: string;
    poster: string;
    mediaType: "movie" | "tv";
    imdbId: string;
    createdBy: string;
    participants: RoomParticipant[];
    createdAt: number;
}

interface SocialState {
    nickname: string;
    rooms: SocialRoom[];
    setNickname: (name: string) => void;
    createRoom: (room: Omit<SocialRoom, "id" | "createdAt" | "participants">) => SocialRoom;
    joinRoom: (roomId: string, participant: RoomParticipant) => void;
    leaveRoom: (roomId: string, name: string) => void;
    deleteRoom: (roomId: string) => void;
}

const PARTICIPANT_COLORS = ["#00B4D8", "#BF5AF2", "#FF9F0A", "#34C759", "#FF453A", "#FFD60A", "#64D2FF", "#30D158"];

function randomColor() {
    return PARTICIPANT_COLORS[Math.floor(Math.random() * PARTICIPANT_COLORS.length)];
}

function generateId(): string {
    return Math.random().toString(36).substring(2, 10);
}

export const useSocialStore = create<SocialState>()(
    persist(
        (set, get) => ({
            nickname: `User-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
            rooms: [],

            setNickname: (name) => set({ nickname: name }),

            createRoom: (data) => {
                const room: SocialRoom = {
                    ...data,
                    id: generateId(),
                    createdAt: Date.now(),
                    participants: [
                        {
                            name: get().nickname,
                            initial: get().nickname[0].toUpperCase(),
                            color: randomColor(),
                            joinedAt: Date.now(),
                        },
                    ],
                };
                set((s) => ({ rooms: [...s.rooms, room] }));
                return room;
            },

            joinRoom: (roomId, participant) => {
                set((s) => ({
                    rooms: s.rooms.map((r) =>
                        r.id === roomId
                            ? { ...r, participants: [...r.participants, participant] }
                            : r
                    ),
                }));
            },

            leaveRoom: (roomId, name) => {
                set((s) => ({
                    rooms: s.rooms.map((r) =>
                        r.id === roomId
                            ? {
                                ...r,
                                participants: r.participants.filter((p) => p.name !== name),
                            }
                            : r
                    ),
                }));
            },

            deleteRoom: (roomId) => {
                set((s) => ({ rooms: s.rooms.filter((r) => r.id !== roomId) }));
            },
        }),
        { name: "streamvault-social" }
    )
);
