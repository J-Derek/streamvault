// AES-GCM 256 Web Crypto Utilities
const ALGO = "AES-GCM";

export async function generateKey(): Promise<CryptoKey> {
    return await window.crypto.subtle.generateKey(
        { name: ALGO, length: 256 },
        true,
        ["encrypt", "decrypt"]
    );
}

export async function exportKey(key: CryptoKey): Promise<string> {
    const exported = await window.crypto.subtle.exportKey("raw", key);
    return btoa(String.fromCharCode(...new Uint8Array(exported)));
}

export async function importKey(keyStr: string): Promise<CryptoKey> {
    const raw = Uint8Array.from(atob(keyStr), c => c.charCodeAt(0));
    return await window.crypto.subtle.importKey(
        "raw",
        raw,
        ALGO,
        true,
        ["encrypt", "decrypt"]
    );
}

export async function encryptBuffer(data: ArrayBuffer, key: CryptoKey): Promise<{ encrypted: ArrayBuffer, iv: Uint8Array }> {
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await window.crypto.subtle.encrypt(
        { name: ALGO, iv },
        key,
        data
    );
    return { encrypted, iv };
}

export async function decryptBuffer(encrypted: ArrayBuffer, key: CryptoKey, iv: Uint8Array): Promise<ArrayBuffer> {
    return await window.crypto.subtle.decrypt(
        { name: ALGO, iv },
        key,
        encrypted as any
    );
}
