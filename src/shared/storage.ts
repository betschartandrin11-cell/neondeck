// Lokale Persistenz über LocalStorage mit JSON-Validierung und Größenlimit.
// Kein Tracking, keine personenbezogenen Daten – nur Spieleinstellungen/Rekorde.
const PREFIX = 'neondeck:';
const MAX_ENTRY_BYTES = 128 * 1024; // Import-Daten & Rekorde begrenzen (Sicherheit §11)

function safeGet(key: string): unknown {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw === null) return null;
    if (raw.length > MAX_ENTRY_BYTES) return null; // korrupt/über groß → ignorieren
    return JSON.parse(raw) as unknown;
  } catch {
    return null; // privater Modus / deaktivierter Storage → graceful
  }
}

function safeSet(key: string, value: unknown): boolean {
  try {
    const raw = JSON.stringify(value);
    if (raw.length > MAX_ENTRY_BYTES) return false;
    localStorage.setItem(PREFIX + key, raw);
    return true;
  } catch {
    return false;
  }
}

export const storage = {
  get<T>(key: string): T | null { return safeGet(key) as T | null; },
  set(key: string, value: unknown) { safeSet(key, value); },
  /** Namespaced-View, damit Spiele nicht in fremde Schlüssel schreiben. */
  scoped(scope: string) {
    return {
      get<T>(k: string): T | null { return safeGet(`${scope}:${k}`) as T | null; },
      set(k: string, v: unknown) { safeSet(`${scope}:${k}`, v); },
    };
  },
};
