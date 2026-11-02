import { ed25519, x25519 } from '@noble/curves/ed25519.js';

export const CryptoEngine = {
    // ---------------------------------------------------------------------------
    // 1. Asymmetric Cryptography (X25519 & Ed25519)
    // ---------------------------------------------------------------------------
    generateIdentityKeyPair: () => {
        // FIX: Updated from randomPrivateKey() to randomSecretKey() for newer noble/curves versions
        const privateKey = ed25519.utils.randomSecretKey();
        const publicKey = ed25519.getPublicKey(privateKey);
        return { privateKey, publicKey };
    },

    generateDHKeyPair: () => {
        // FIX: Updated from randomPrivateKey() to randomSecretKey()
        const privateKey = x25519.utils.randomSecretKey();
        const publicKey = x25519.getPublicKey(privateKey);
        return { privateKey, publicKey };
    },

    sign: (privateKey: Uint8Array, message: Uint8Array): Uint8Array => {
        return ed25519.sign(message, privateKey);
    },

    verifySignature: (signature: Uint8Array, message: Uint8Array, publicKey: Uint8Array): boolean => {
        return ed25519.verify(signature, message, publicKey);
    },

    performDH: (privateKey: Uint8Array, publicKey: Uint8Array): Uint8Array => {
        return x25519.getSharedSecret(privateKey, publicKey);
    },

    getDHPublicKey: (privateKey: Uint8Array): Uint8Array => {
        return x25519.getPublicKey(privateKey);
    },

    // ---------------------------------------------------------------------------
    // 2. Symmetric Cryptography (WebCrypto)
    // ---------------------------------------------------------------------------
    deriveHKDF: async (ikm: Uint8Array, salt: Uint8Array, info: string, lengthBytes: number): Promise<Uint8Array> => {
        const infoBuffer = new TextEncoder().encode(info);
        const importedKey = await crypto.subtle.importKey(
            "raw", ikm as any, { name: "HKDF" }, false, ["deriveBits"]
        );
        const derivedBits = await crypto.subtle.deriveBits(
            { name: "HKDF", hash: "SHA-256", salt: salt as any, info: infoBuffer },
            importedKey,
            lengthBytes * 8
        );
        return new Uint8Array(derivedBits);
    },

    encryptAESGCM: async (key: Uint8Array, plaintext: Uint8Array, associatedData: Uint8Array): Promise<Uint8Array> => {
        const importedKey = await crypto.subtle.importKey(
            "raw", key as any, { name: "AES-GCM" }, false, ["encrypt"]
        );
        const nonce = new Uint8Array(12).fill(0);
        const ciphertextBuffer = await crypto.subtle.encrypt(
            { name: "AES-GCM", iv: nonce as any, additionalData: associatedData as any },
            importedKey,
            plaintext as any
        );
        return new Uint8Array(ciphertextBuffer);
    },

    decryptAESGCM: async (key: Uint8Array, ciphertext: Uint8Array, associatedData: Uint8Array): Promise<Uint8Array> => {
        const importedKey = await crypto.subtle.importKey(
            "raw", key as any, { name: "AES-GCM" }, false, ["decrypt"]
        );
        const nonce = new Uint8Array(12).fill(0);
        const plaintextBuffer = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: nonce as any, additionalData: associatedData as any },
            importedKey,
            ciphertext as any
        );
        return new Uint8Array(plaintextBuffer);
    }
};