import { WebSocketServer } from "ws";

const PORT = process.env.PORT || 3001;
const wss = new WebSocketServer({ port: PORT });

// Map<roomId, Set<{ ws, nickname, initial, color }>>
const rooms = new Map();

function broadcast(roomId, message, excludeWs = null) {
    const clients = rooms.get(roomId);
    if (!clients) return;
    const data = JSON.stringify(message);
    for (const client of clients) {
        if (client.ws !== excludeWs && client.ws.readyState === 1) {
            client.ws.send(data);
        }
    }
}

function sendTo(ws, message) {
    if (ws.readyState === 1) {
        ws.send(JSON.stringify(message));
    }
}

function participantList(roomId) {
    const clients = rooms.get(roomId);
    if (!clients) return [];
    return Array.from(clients).map(c => ({
        name: c.nickname,
        initial: c.initial,
        color: c.color,
    }));
}

function removeClient(ws) {
    for (const [roomId, clients] of rooms) {
        const found = Array.from(clients).find(c => c.ws === ws);
        if (found) {
            clients.delete(found);
            if (clients.size === 0) {
                rooms.delete(roomId);
                console.log(`  Room ${roomId} deleted (empty)`);
            } else {
                broadcast(roomId, {
                    type: "left",
                    nickname: found.nickname,
                    participants: participantList(roomId),
                });
                console.log(`  ${found.nickname} left room ${roomId}`);
            }
            return;
        }
    }
}

wss.on("connection", (ws) => {
    console.log("Client connected");

    ws.on("message", (raw) => {
        let msg;
        try {
            msg = JSON.parse(raw.toString());
        } catch {
            sendTo(ws, { type: "error", message: "Invalid JSON" });
            return;
        }

        const { type, roomId } = msg;

        switch (type) {
            case "join": {
                if (!roomId || !msg.nickname) {
                    sendTo(ws, { type: "error", message: "Missing roomId or nickname" });
                    return;
                }
                if (!rooms.has(roomId)) {
                    rooms.set(roomId, new Set());
                }
                const clients = rooms.get(roomId);
                // Remove existing connection for same nickname
                const existing = Array.from(clients).find(c => c.nickname === msg.nickname);
                if (existing) clients.delete(existing);

                const entry = {
                    ws,
                    nickname: msg.nickname,
                    initial: msg.initial || msg.nickname[0].toUpperCase(),
                    color: msg.color || "#636366",
                };
                clients.add(entry);

                sendTo(ws, {
                    type: "joined",
                    nickname: msg.nickname,
                    participants: participantList(roomId),
                });

                broadcast(roomId, {
                    type: "joined",
                    nickname: msg.nickname,
                    initial: entry.initial,
                    color: entry.color,
                    participants: participantList(roomId),
                }, ws);

                console.log(`  ${msg.nickname} joined room ${roomId} (${clients.size} participants)`);
                break;
            }

            case "chat": {
                if (!roomId || !msg.text) break;
                const clients = rooms.get(roomId);
                if (!clients) break;
                const sender = Array.from(clients).find(c => c.ws === ws);
                if (!sender) break;
                broadcast(roomId, {
                    type: "chat",
                    nickname: sender.nickname,
                    initial: sender.initial,
                    color: sender.color,
                    text: msg.text,
                    time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                });
                break;
            }

            case "reaction": {
                if (!roomId || !msg.emoji) break;
                const clients = rooms.get(roomId);
                if (!clients) break;
                const sender = Array.from(clients).find(c => c.ws === ws);
                if (!sender) break;
                broadcast(roomId, {
                    type: "reaction",
                    nickname: sender.nickname,
                    emoji: msg.emoji,
                });
                break;
            }

            case "playback": {
                if (!roomId || !msg.action) break;
                const clients = rooms.get(roomId);
                if (!clients) break;
                const sender = Array.from(clients).find(c => c.ws === ws);
                broadcast(roomId, {
                    type: "playback",
                    nickname: sender?.nickname || "unknown",
                    action: msg.action,
                    timestamp: msg.timestamp ?? 0,
                    currentTime: msg.currentTime ?? 0,
                }, ws);
                break;
            }

            default:
                sendTo(ws, { type: "error", message: `Unknown type: ${type}` });
        }
    });

    ws.on("close", () => {
        removeClient(ws);
        console.log("Client disconnected");
    });

    ws.on("error", (err) => {
        console.error("WebSocket error:", err.message);
        removeClient(ws);
    });
});

console.log(`\n  StreamVault Relay Server running on ws://localhost:${PORT}\n`);
