// src/useEncryption.ts
import { useState, useCallback } from 'react';

export const useEncryption = () => {
    const [keyPair, setKeyPair] = useState<CryptoKeyPair | null>(null);
    const [sharedSecret, setSharedSecret] = useState<CryptoKey | null>(null);

    // 1. Generate Elliptic Curve Keys (Your Identity/PreKeys)
    const generateKeys = useCallback(async () => {
        try {
            const pair = await window.crypto.subtle.generateKey(
                { name: "ECDH", namedCurve: "P-256" },
                true,
                ["deriveKey", "deriveBits"]
            );
            setKeyPair(pair);
            return pair;
        } catch (error) {
            console.error("Key generation failed:", error);
            return null;
        }
    }, []);

    // 2. Export Public Key to send to Flask (X3DH Step 1)
    const exportPublicKey = useCallback(async (publicKey: CryptoKey) => {
        const exported = await window.crypto.subtle.exportKey("jwk", publicKey);
        return exported;
    }, []);

    // 3. Import Target's Public Key from Flask
    const importPublicKey = useCallback(async (jwkData: JsonWebKey) => {
        return await window.crypto.subtle.importKey(
            "jwk",
            jwkData,
            { name: "ECDH", namedCurve: "P-256" },
            true,
            []
        );
    }, []);

    // 4. The Handshake: Derive the AES Shared Secret
    const computeSharedSecret = useCallback(async (myPrivateKey: CryptoKey, theirPublicKey: CryptoKey) => {
        try {
            const secret = await window.crypto.subtle.deriveKey(
                { name: "ECDH", public: theirPublicKey },
                myPrivateKey,
                { name: "AES-GCM", length: 256 },
                true,
                ["encrypt", "decrypt"]
            );
            setSharedSecret(secret);
            return secret;
        } catch (error) {
            console.error("Shared secret derivation failed:", error);
            return null;
        }
    }, []);

    // 5. Encrypt Outgoing Message
    const encryptMessage = useCallback(async (plaintext: string, secretKey: CryptoKey) => {
        const encoder = new TextEncoder();
        const data = encoder.encode(plaintext);
        const iv = window.crypto.getRandomValues(new Uint8Array(12)); // Initialization Vector

        const ciphertextBuffer = await window.crypto.subtle.encrypt(
            { name: "AES-GCM", iv: iv },
            secretKey,
            data
        );

        // Convert Buffer to Base64 for safe WebSocket transmission
        const ciphertextArray = Array.from(new Uint8Array(ciphertextBuffer));
        const ciphertextBase64 = btoa(String.fromCharCode.apply(null, ciphertextArray));
        const ivBase64 = btoa(String.fromCharCode.apply(null, Array.from(iv)));

        return { ciphertext: ciphertextBase64, iv: ivBase64 };
    }, []);

    // 6. Decrypt Incoming Message
    const decryptMessage = useCallback(async (ciphertextBase64: string, ivBase64: string, secretKey: CryptoKey) => {
        try {
            const ciphertextArray = Uint8Array.from(atob(ciphertextBase64), c => c.charCodeAt(0));
            const ivArray = Uint8Array.from(atob(ivBase64), c => c.charCodeAt(0));

            const decryptedBuffer = await window.crypto.subtle.decrypt(
                { name: "AES-GCM", iv: ivArray },
                secretKey,
                ciphertextArray
            );

            const decoder = new TextDecoder();
            return decoder.decode(decryptedBuffer);
        } catch (error) {
            console.error("Decryption failed. Invalid key or tampered data:", error);
            return "[Decryption Error]";
        }
    }, []);

    return {
        keyPair,
        sharedSecret,
        generateKeys,
        exportPublicKey,
        importPublicKey,
        computeSharedSecret,
        encryptMessage,
        decryptMessage
    };
};