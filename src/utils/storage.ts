import { openDB, DBSchema, IDBPDatabase } from 'idb';

// Define the shape of our database
interface E2EEDatabase extends DBSchema {
    key_store: {
        key: string;
        value: {
            id: string; // 'identity' or 'signed_prekey'
            privateKey: Uint8Array;
            publicKey: Uint8Array;
        };
    };
    ratchet_state: {
        key: string; // The remote user's phone number
        value: any; // The serialized Double Ratchet JSON state
    };
}

let dbPromise: Promise<IDBPDatabase<E2EEDatabase>> | null = null;

export const StorageEngine = {
    // Initialize the DB
    init: () => {
        if (!dbPromise) {
            dbPromise = openDB<E2EEDatabase>('monolith_e2ee', 1, {
                upgrade(db) {
                    db.createObjectStore('key_store', { keyPath: 'id' });
                    db.createObjectStore('ratchet_state'); // Out-of-line keys for ratchets
                },
            });
        }
        return dbPromise;
    },

    // Save Long-Term Keys
    saveKeyPair: async (id: string, privateKey: Uint8Array, publicKey: Uint8Array) => {
        const db = await StorageEngine.init();
        await db.put('key_store', { id, privateKey, publicKey });
    },

    // Retrieve Long-Term Keys
    getKeyPair: async (id: string) => {
        const db = await StorageEngine.init();
        return await db.get('key_store', id);
    },

    // Save Active Chat Session State
    saveSession: async (contactPhone: string, ratchetState: any) => {
        const db = await StorageEngine.init();
        await db.put('ratchet_state', ratchetState, contactPhone);
    },

    // Load Active Chat Session State
    loadSession: async (contactPhone: string) => {
        const db = await StorageEngine.init();
        return await db.get('ratchet_state', contactPhone);
    }
};