import { writeTextFile, readTextFile, BaseDirectory, exists, mkdir } from '@tauri-apps/plugin-fs';

const isTauri = !!(
    (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.TAURI_ENV_PLATFORM) ||
    (typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window || 'isTauri' in window))
);

export async function saveToDisk(filename: string, data: any) {
    if (!isTauri) return;
    try {
        const dir = "data";
        const hasDir = await exists(dir, { baseDir: BaseDirectory.AppData });
        if (!hasDir) {
            await mkdir(dir, { baseDir: BaseDirectory.AppData, recursive: true });
        }
        await writeTextFile(`${dir}/${filename}.json`, JSON.stringify(data), { baseDir: BaseDirectory.AppData });
        console.log(`Persistence: Saved ${filename} to disk`);
    } catch (e) {
        console.error(`Persistence recovery: Failed to save ${filename}`, e);
    }
}

export async function loadFromDisk(filename: string): Promise<any | null> {
    if (!isTauri) return null;
    try {
        const path = `data/${filename}.json`;
        const hasFile = await exists(path, { baseDir: BaseDirectory.AppData });
        if (!hasFile) return null;

        const content = await readTextFile(path, { baseDir: BaseDirectory.AppData });
        console.log(`Persistence: Loaded ${filename} from disk`);
        return JSON.parse(content);
    } catch (e) {
        console.error(`Persistence recovery: Failed to load ${filename}`, e);
        return null;
    }
}
