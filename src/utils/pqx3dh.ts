import { CryptoEngine } from './crypto';
import { StorageEngine } from './storage';
import { Encoding } from './encoding';
import { CryptoAuditor } from './auditor';
import { ml_kem768 } from '@noble/post-quantum/ml-kem.js';

export const PQX3DHService = {
    generateRegistrationBundle: async (numOneTimePreKeys = 50) => {
        // 1. Generate Ed25519 key strictly for signing payloads for the backend
        const identitySignKey = CryptoEngine.generateIdentityKeyPair();
        CryptoAuditor.log('KEY_GEN', 'Identity Sign Key Created', 'Ed25519 (Twisted Edwards Curve)', 'Acts as a digital signature to prove identity to the backend without revealing secrets.');

        // 2. Generate X25519 key strictly for Diffie-Hellman math
        const identityKey = CryptoEngine.generateDHKeyPair();
        CryptoAuditor.log('KEY_GEN', 'Diffie-Hellman Keys Created', 'X25519 (Montgomery Curve)', 'Generates mathematical coordinates for the X3DH key exchange.');
        
        // 3. Generate ML-KEM-768 key strictly for Quantum Resistance
        const quantumPreKey = ml_kem768.keygen();
        CryptoAuditor.log('KEY_GEN', 'ML-KEM-768 Keys Created', 'Module-Lattice-Based KEM', 'Generates FIPS-203 compliant keys to defend against Shor\'s algorithm.');

        // Save keys locally 
        await StorageEngine.saveKeyPair('identity', identityKey.privateKey, identityKey.publicKey);

        const signedPreKey = CryptoEngine.generateDHKeyPair();
        await StorageEngine.saveKeyPair('signed_prekey', signedPreKey.privateKey, signedPreKey.publicKey);
        
        // Save Quantum Keys securely (2,400-byte private key, 1,184-byte public key)
        await StorageEngine.saveKeyPair('quantum_prekey', quantumPreKey.secretKey, quantumPreKey.publicKey);

        // Sign the classical prekey using the dedicated Ed25519 Sign Key
        const signature = CryptoEngine.sign(identitySignKey.privateKey, signedPreKey.publicKey);

        const oneTimePreKeysPublic: string[] = [];
        for (let i = 0; i < numOneTimePreKeys; i++) {
            const opk = CryptoEngine.generateDHKeyPair();
            const opkHex = Encoding.toHex(opk.publicKey);
            await StorageEngine.saveKeyPair(`opk_${opkHex}`, opk.privateKey, opk.publicKey);
            oneTimePreKeysPublic.push(Encoding.toBase64(opk.publicKey));
        }

        // Return the Hybrid Bundle to be sent to the Blind Relay
        return {
            identityKey: Encoding.toBase64(identityKey.publicKey),
            identitySignKey: Encoding.toBase64(identitySignKey.publicKey), 
            signedPreKey: Encoding.toBase64(signedPreKey.publicKey),
            signature: Encoding.toBase64(signature),
            quantumPreKey: Encoding.toBase64(quantumPreKey.publicKey), 
            oneTimePreKeys: oneTimePreKeysPublic
        };
    },

    initiateHandshake: async (bobBundle: {
        identityKey: string;
        identitySignKey: string; 
        signedPreKey: string;
        signature: string;
        quantumPreKey: string; 
        oneTimePreKey?: string; 
    }) => {
        const bobIK = Encoding.fromBase64(bobBundle.identityKey);
        const bobSPK = Encoding.fromBase64(bobBundle.signedPreKey);
        const bobSPKSignature = Encoding.fromBase64(bobBundle.signature);
        const bobSignKey = Encoding.fromBase64(bobBundle.identitySignKey);
        const bobQuantumPK = Encoding.fromBase64(bobBundle.quantumPreKey);

        // Verify using Bob's dedicated Ed25519 Sign Key
        const isValid = CryptoEngine.verifySignature(bobSPKSignature, bobSPK, bobSignKey);
        if (!isValid) throw new Error("X3DH Handshake Failed: Bob's signature is invalid!");

        const aliceIdentity = await StorageEngine.getKeyPair('identity');
        if (!aliceIdentity) throw new Error("Local identity keys missing. Register first.");

        const aliceEphemeral = CryptoEngine.generateDHKeyPair();

        // Phase 1: Classical 3-DH Handshake (X25519)
        const dh1 = CryptoEngine.performDH(aliceIdentity.privateKey, bobSPK);
        const dh2 = CryptoEngine.performDH(aliceEphemeral.privateKey, bobIK);
        const dh3 = CryptoEngine.performDH(aliceEphemeral.privateKey, bobSPK);

        // Phase 2: Post-Quantum Encapsulation (ML-KEM-768)
        const { cipherText: pqCiphertext, sharedSecret: pqSharedSecret } = ml_kem768.encapsulate(bobQuantumPK);

        // Phase 3: Hybrid Master Secret Derivation
        const ikmComponents = [dh1, dh2, dh3, pqSharedSecret];

        const totalLength = ikmComponents.reduce((acc, val) => acc + val.length, 0);
        const ikm = new Uint8Array(totalLength);
        let offset = 0;
        for (const component of ikmComponents) {
            ikm.set(component, offset);
            offset += component.length;
        }

        const salt = new Uint8Array(32).fill(0);
        const info = "PQ_X3DH_Protocol_Master_Secret"; 
        const masterSecret = await CryptoEngine.deriveHKDF(ikm, salt, info, 32);

        // AUDITOR: Log the successful Hybrid Handshake
        CryptoAuditor.log('X3DH', 'Hybrid PQ-3DH Handshake Complete', 'X25519 + ML-KEM-768 + HKDF-SHA256', 'Fuses classical X25519 math with post-quantum lattice encapsulation, deriving an unbreakable 32-byte Master Key.', {
            aliceEphemeralPub: aliceEphemeral.publicKey,
            bobStaticPub: bobIK,
            quantumSharedSecret: pqSharedSecret,
            computedMasterSecret: masterSecret
        });

        return {
            masterSecret,
            aliceEphemeralPublicKey: aliceEphemeral.publicKey, 
            pqCiphertext: Encoding.toBase64(pqCiphertext) 
        };
    },

    receiveHandshake: async (alicePayload: {
        aliceIdentityKey: string;     
        aliceEphemeralKey: string;    
        pqCiphertext: string;         
    }) => {
        const aliceIK = Encoding.fromBase64(alicePayload.aliceIdentityKey);
        const aliceEK = Encoding.fromBase64(alicePayload.aliceEphemeralKey);
        const pqCiphertextBytes = Encoding.fromBase64(alicePayload.pqCiphertext);

        // 1. Retrieve Bob's private keys from local storage
        const bobIdentity = await StorageEngine.getKeyPair('identity');
        const bobSPK = await StorageEngine.getKeyPair('signed_prekey');
        const bobQuantum = await StorageEngine.getKeyPair('quantum_prekey');

        if (!bobIdentity || !bobSPK || !bobQuantum) {
            throw new Error("Local keys missing. Cannot complete PQXDH handshake.");
        }

        // Phase 1: Classical 3-DH Handshake (Bob's Perspective)
        const dh1 = CryptoEngine.performDH(bobSPK.privateKey, aliceIK);
        const dh2 = CryptoEngine.performDH(bobIdentity.privateKey, aliceEK);
        const dh3 = CryptoEngine.performDH(bobSPK.privateKey, aliceEK);

        // Phase 2: Post-Quantum Decapsulation (ML-KEM-768)
        const pqSharedSecret = ml_kem768.decapsulate(pqCiphertextBytes, bobQuantum.privateKey);

        // Phase 3: Hybrid Master Secret Derivation
        const ikmComponents = [dh1, dh2, dh3, pqSharedSecret];

        const totalLength = ikmComponents.reduce((acc, val) => acc + val.length, 0);
        const ikm = new Uint8Array(totalLength);
        let offset = 0;
        for (const component of ikmComponents) {
            ikm.set(component, offset);
            offset += component.length;
        }

        const salt = new Uint8Array(32).fill(0);
        
        // Must match Alice's domain string perfectly
        const info = "PQ_X3DH_Protocol_Master_Secret"; 
        const masterSecret = await CryptoEngine.deriveHKDF(ikm, salt, info, 32);

        // AUDITOR: Log the successful receipt of the Hybrid Handshake
        CryptoAuditor.log('X3DH', 'Hybrid PQ-3DH Handshake Accepted', 'X25519 + ML-KEM-768 + HKDF-SHA256', 'Bob successfully decapsulated the quantum ciphertext and derived the matching 32-byte Master Key.', {
            aliceEphemeralPub: aliceEK,
            bobStaticPub: bobIdentity.publicKey,
            quantumSharedSecret: pqSharedSecret,
            computedMasterSecret: masterSecret
        });

        return {
            masterSecret
        };
    }
};