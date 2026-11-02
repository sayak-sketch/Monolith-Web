export const Encoding = {
    // Hex (Used for local IndexedDB lookup keys)
    toHex: (bytes: Uint8Array): string => {
        return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    },
    fromHex: (hexString: string): Uint8Array => {
        if (!hexString) return new Uint8Array(0);
        const matches = hexString.match(/.{1,2}/g);
        if (!matches) return new Uint8Array(0);
        return new Uint8Array(matches.map(byte => parseInt(byte, 16)));
    },

    // Base64 (REQUIRED FOR THE NETWORK WIRE & PYTHON COMPATIBILITY)
    toBase64: (bytes: Uint8Array): string => {
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    },
    fromBase64: (base64: string): Uint8Array => {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    },

    // Text Encoders
    toBuffer: (text: string): Uint8Array => new TextEncoder().encode(text),
    toString: (buffer: Uint8Array): string => new TextDecoder().decode(buffer)
};