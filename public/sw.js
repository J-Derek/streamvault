const DB_NAME = "StreamVaultOffline";
const STORE_NAME = "media_blobs";

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

// Intercept special offline URLs: https://streamvault.local/offline-stream/{id}
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    if (url.pathname.startsWith('/offline-stream/')) {
        const idStr = url.pathname.split('/').pop();
        if (idStr) {
            const id = parseInt(idStr);
            event.respondWith(handleOfflineMedia(id));
        }
    }
});

async function handleOfflineMedia(id) {
    try {
        const db = await new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, 1);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });

        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const data = await new Promise((resolve, reject) => {
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });

        if (!data || !data.blob) {
            return new Response("Media not found offline", { status: 404 });
        }

        // Return the blob as a stream
        return new Response(data.blob, {
            headers: {
                'Content-Type': 'video/mp4',
                'Content-Length': data.blob.size.toString(),
                'Accept-Ranges': 'bytes',
                'Access-Control-Allow-Origin': '*'
            }
        });
    } catch (error) {
        return new Response(`Offline Error: ${error.message}`, { status: 500 });
    }
}
