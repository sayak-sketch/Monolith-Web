import { CryptoEngine } from './crypto';
import { Encoding } from './encoding';
import { StorageEngine } from './storage';
import { CryptoAuditor } from './auditor';

const MAX_SKIP = 1000;

const hmacSHA256 = async (key: Uint8Array, data: Uint8Array): Promise<Uint8Array> => {
    const importedKey = await crypto.subtle.importKey(
        'raw', key as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', importedKey, data as BufferSource);
    return new Uint8Array(signature);
};

export class DoubleRatchet {
    RK: Uint8Array;
    DHs: { privateKey: Uint8Array; publicKey: Uint8Array };
    DHr: Uint8Array | null = null;
    CKs: Uint8Array | null = null;
    CKr: Uint8Array | null = null;
    
    Ns: number = 0;
    Nr: number = 0;
    PN: number = 0;
    
    _initialEphemeralPub: Uint8Array | null = null;
    MKSKIPPED: Record<string, Uint8Array> = {};

    // THE EXECUTION QUEUE LOCK: Prevents WebCrypto Race Conditions
    private _queue: Promise<any> = Promise.resolve();

    private constructor(rk: Uint8Array, dhs: { privateKey: Uint8Array; publicKey: Uint8Array }) {
        this.RK = rk;
        this.DHs = dhs;
    }

    static async initAsAlice(sharedSecret: Uint8Array, bobDhPublicKey: Uint8Array): Promise<DoubleRatchet> {
        const dhs = CryptoEngine.generateDHKeyPair();
        const ratchet = new DoubleRatchet(sharedSecret, dhs);
        ratchet.DHr = bobDhPublicKey;

        const dhOut = CryptoEngine.performDH(ratchet.DHs.privateKey, ratchet.DHr);
        const [newRK, newCKs] = await ratchet._kdfRK(sharedSecret, dhOut);
        
        ratchet.RK = newRK;
        ratchet.CKs = newCKs;
        return ratchet;
    }

    static async initAsBob(sharedSecret: Uint8Array, bobDhPrivateKey: Uint8Array, bobDhPublicKey: Uint8Array): Promise<DoubleRatchet> {
        const dhs = { privateKey: bobDhPrivateKey, publicKey: bobDhPublicKey };
        return new DoubleRatchet(sharedSecret, dhs); 
    }

    private async _kdfRK(rk: Uint8Array, dhOut: Uint8Array): Promise<[Uint8Array, Uint8Array]> {
        const derived = await CryptoEngine.deriveHKDF(dhOut, rk, "DoubleRatchet-RootChain", 64);
        return [derived.slice(0, 32), derived.slice(32, 64)];
    }

    private async _kdfCK(ck: Uint8Array): Promise<[Uint8Array, Uint8Array]> {
        const mkInput = new Uint8Array([0x01]);
        const messageKey = await hmacSHA256(ck, mkInput);

        const ckInput = new Uint8Array([0x02]);
        const nextChainKey = await hmacSHA256(ck, ckInput);

        return [nextChainKey, messageKey];
    }

    private async _dhRatchet(headerDhPub: Uint8Array): Promise<void> {
        this.PN = this.Ns;
        this.Ns = 0;
        this.Nr = 0;
        this.DHr = headerDhPub;

        const dhReceive = CryptoEngine.performDH(this.DHs.privateKey, this.DHr);
        const [rkRecv, ckr] = await this._kdfRK(this.RK, dhReceive);
        this.RK = rkRecv;
        this.CKr = ckr;

        this.DHs = CryptoEngine.generateDHKeyPair();
        const dhSend = CryptoEngine.performDH(this.DHs.privateKey, this.DHr);
        const [rkSend, cks] = await this._kdfRK(this.RK, dhSend);
        this.RK = rkSend;
        this.CKs = cks;
    }

    private async _skipMessageKeys(until: number): Promise<void> {
        if (until < this.Nr) return;
        if (until - this.Nr > MAX_SKIP) throw new Error("Too many skipped messages.");

        while (this.Nr < until) {
            if (!this.CKr) throw new Error("CKr is missing during skip iteration.");
            const [nextCkr, mk] = await this._kdfCK(this.CKr);
            this.CKr = nextCkr;
            
            const dhPubHex = Encoding.toHex(this.DHr!);
            this.MKSKIPPED[`${dhPubHex}_${this.Nr}`] = mk;
            this.Nr += 1;
        }
    }

    private _buildAssociatedData(header: { dh_pub: string; pn: number; n: number }, extraAd: Uint8Array): Uint8Array {
        const dhPubBuffer = Encoding.fromBase64(header.dh_pub);
        
        const pnBuffer = new Uint8Array(4);
        new DataView(pnBuffer.buffer).setUint32(0, header.pn, false);
        
        const nBuffer = new Uint8Array(4);
        new DataView(nBuffer.buffer).setUint32(0, header.n, false);
        
        const ad = new Uint8Array(extraAd.length + dhPubBuffer.length + 8);
        ad.set(extraAd, 0);
        ad.set(dhPubBuffer, extraAd.length);
        ad.set(pnBuffer, extraAd.length + dhPubBuffer.length);
        ad.set(nBuffer, extraAd.length + dhPubBuffer.length + 4);
        
        return ad;
    }

    public async encrypt(plaintextStr: string, associatedData: Uint8Array = new Uint8Array(0)): Promise<{ header: { dh_pub: string, pn: number, n: number }; ciphertext: string }> {
        // CHAIN THE EXECUTION TO PREVENT CONCURRENT WRITES
        this._queue = this._queue.then(async () => {
            if (!this.CKs) throw new Error("Sending chain not established.");

            const [nextCks, mk] = await this._kdfCK(this.CKs);
            this.CKs = nextCks;

            const header = {
                dh_pub: Encoding.toBase64(this.DHs.publicKey),
                pn: this.PN,
                n: this.Ns
            };
            
            // AUDITOR: Log the Ratchet Step
            CryptoAuditor.log('RATCHET', `Sending Chain Stepped Forward (n=${this.Ns})`, 'HMAC-SHA256 (KDF)', 'Spins the message key forward like a combination lock. Ensures Perfect Forward Secrecy so old keys cannot be reused.', { messageKey: mk });
            this.Ns += 1;

            const ad = this._buildAssociatedData(header, associatedData);
            const plaintextBytes = Encoding.toBuffer(plaintextStr);
            
            const ciphertextBytes = await CryptoEngine.encryptAESGCM(mk, plaintextBytes, ad);
            
            // AUDITOR: Log Encryption Success
            CryptoAuditor.log('ENCRYPT', `Message Encrypted`, 'AES-GCM (256-bit)', 'Locks the plaintext and attaches an authentication tag to mathematically prove it was not tampered with in transit.', { plaintext: plaintextStr });

            return {
                header,
                ciphertext: Encoding.toBase64(ciphertextBytes)
            };
        }).catch(e => { throw e; });

        return this._queue;
    }

    public async decrypt(header: { dh_pub: string; pn: number; n: number }, ciphertextBase64: string, associatedData: Uint8Array = new Uint8Array(0)): Promise<string> {
        // CHAIN THE EXECUTION TO PREVENT CONCURRENT WRITES
        this._queue = this._queue.then(async () => {
            const dhPubHex = Encoding.toHex(Encoding.fromBase64(header.dh_pub));
            const mkKey = `${dhPubHex}_${header.n}`;
            let mk = this.MKSKIPPED[mkKey];

            if (mk) {
                delete this.MKSKIPPED[mkKey];
            } else {
                const currentDhrBase64 = this.DHr ? Encoding.toBase64(this.DHr) : null;
                if (header.dh_pub !== currentDhrBase64) {
                    await this._skipMessageKeys(header.pn);
                    await this._dhRatchet(Encoding.fromBase64(header.dh_pub));
                }
                await this._skipMessageKeys(header.n);
                
                // GUARD: Prevent blind chain advancement on duplicate payloads
                if (header.n < this.Nr) {
                    throw new Error("Duplicate or delayed message already skipped/processed.");
                }

                const [nextCkr, newMk] = await this._kdfCK(this.CKr!);
                this.CKr = nextCkr;
                mk = newMk;
                
                // AUDITOR: Log the Receiving Ratchet Step
                CryptoAuditor.log('RATCHET', `Receiving Chain Stepped Forward (n=${header.n})`, 'HMAC-SHA256 (KDF)', 'Synchronizes with the sender\'s combination lock to derive the exact matching decryption key.', { derivedMessageKey: mk });
                this.Nr += 1;
            }

            const ad = this._buildAssociatedData(header, associatedData);
            const ciphertextBytes = Encoding.fromBase64(ciphertextBase64);
            
            try {
                const plaintextBytes = await CryptoEngine.decryptAESGCM(mk, ciphertextBytes, ad);
                
                // AUDITOR: Log Decryption Success
                CryptoAuditor.log('DECRYPT', `Message Decrypted & Authenticated`, 'AES-GCM (256-bit)', 'Verifies the authentication tag and unlocks the ciphertext into readable text.');
                
                return Encoding.toString(plaintextBytes);
            } catch (e) {
                throw new Error("Message Authentication Failed! Ciphertext tampered or wrong key.");
            }
        }).catch(e => { throw e; });

        return this._queue;
    }
    
    public async saveState(contactPhone: string) {
        const state = {
            RK: Encoding.toBase64(this.RK),
            DHs_priv: Encoding.toBase64(this.DHs.privateKey),
            DHr: this.DHr ? Encoding.toBase64(this.DHr) : null,
            CKs: this.CKs ? Encoding.toBase64(this.CKs) : null,
            CKr: this.CKr ? Encoding.toBase64(this.CKr) : null,
            Ns: this.Ns,
            Nr: this.Nr,
            PN: this.PN,
            _initialEphemeralPub: this._initialEphemeralPub ? Encoding.toBase64(this._initialEphemeralPub) : null,
            MKSKIPPED: Object.entries(this.MKSKIPPED).map(([k, v]) => {
                const [dhPubHex, nStr] = k.split('_');
                return {
                    dh_pub: Encoding.toBase64(Encoding.fromHex(dhPubHex)),
                    n: parseInt(nStr, 10),
                    mk: Encoding.toBase64(v)
                };
            })
        };
        await StorageEngine.saveSession(contactPhone, state);
    }

    static async loadState(contactPhone: string): Promise<DoubleRatchet | null> {
        const state = await StorageEngine.loadSession(contactPhone);
        if (!state) return null;

        const privKey = Encoding.fromBase64(state.DHs_priv);
        const dhs = {
            privateKey: privKey,
            publicKey: CryptoEngine.getDHPublicKey(privKey)
        };
        const ratchet = new DoubleRatchet(Encoding.fromBase64(state.RK), dhs);
        
        ratchet.DHr = state.DHr ? Encoding.fromBase64(state.DHr) : null;
        ratchet.CKs = state.CKs ? Encoding.fromBase64(state.CKs) : null;
        ratchet.CKr = state.CKr ? Encoding.fromBase64(state.CKr) : null;
        ratchet.Ns = state.Ns;
        ratchet.Nr = state.Nr;
        ratchet.PN = state.PN;
        ratchet._initialEphemeralPub = state._initialEphemeralPub ? Encoding.fromBase64(state._initialEphemeralPub) : null;
        
        ratchet.MKSKIPPED = {};
        for (const item of state.MKSKIPPED) {
            const dhPubHex = Encoding.toHex(Encoding.fromBase64(item.dh_pub));
            ratchet.MKSKIPPED[`${dhPubHex}_${item.n}`] = Encoding.fromBase64(item.mk);
        }
        
        return ratchet;
    }
}