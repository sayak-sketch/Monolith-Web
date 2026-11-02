# Monolith (Webapp Version) — Secure Messaging & Collaboration Suite

**Monolith** is a state-of-the-art, true Zero-Knowledge End-to-End Encrypted (E2EE) web application designed for high-security team communication, real-time file sharing, and encrypted P2P mesh audio/video calling.

---

## Authors & Project Contributors

* Ankita Biswas
* Arijeet Das
* Rohan Koner
* Ritayan Maity
* Sayak Mukherjee

---

## Key Architecture & Security Highlights

* **Post-Quantum Cryptographic Handshake:** Combines **ML-KEM-768** (Kyber) quantum-resistant key encapsulation with classical **X25519** ECDH (Hybrid PQ-X3DH protocol) to ensure absolute long-term confidentiality against quantum and classical adversaries.
* **Double Ratchet & AES-256-GCM:** Provides forward secrecy and break-in recovery for every single message sent across direct or group channels.
* **Zero-Knowledge Pairwise Fan-Out:** Group chats securely distribute messages by encrypting payloads individually for each participant's ratchet session via a blind relay server.
* **Decentralized P2P Mesh Calling:** Real-time 1-on-1 and group voice/video calls (up to 8 audio / 4 video participants) stream directly from browser to browser via WebRTC. The server functions purely as a blind signaling router.
* **Rich Messaging Features:**
* End-to-end encrypted Base64 image attachments.
* 10-minute inline message editing.
* "Delete for Everyone" synchronization across all chat participants.
* Multi-target message forwarding.



---

## Tech Stack

* **Client:** React, Vite, Tailwind CSS, Lucide Icons, Socket.IO-Client
* **Backend Server:** Python, Flask, Flask-SocketIO (Blind Relay)
* **Database & Storage:** MongoDB Atlas (Public Key Directory, Offline Message Queue, Groups Collection)
* **Networking & Security:** WebRTC Mesh (STUN/TURN), Cryptography (Python cryptography library & Web Crypto APIs)

---

## Getting Started Locally

### 1. Clone the Repository & Configure Environment

Create a `.env` file for your backend and client configurations containing your MongoDB Atlas connection string (`MONGO_URI`) and server secrets. Ensure your MongoDB Atlas network access list includes `0.0.0.0/0` to allow inbound connections from cloud containers or local testing.

### 2. Run the Backend Relay

```bash
cd server
pip install -r requirements.txt
python app.py

```

### 3. Run the Frontend Client

```bash
cd client
npm install
npm run dev

```

---

## License & Attribution

Developed by Sayak Mukherjee and the CryptIndo Labs development team. Distributed under the Apache-2.0 License.
