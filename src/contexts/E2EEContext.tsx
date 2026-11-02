/// <reference types="vite/client" />
import React, { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import { StorageEngine } from '../utils/storage';
import { PQX3DHService } from '../utils/pqx3dh';
import { DoubleRatchet } from '../utils/ratchet';
import { Encoding } from '../utils/encoding';
import { Message, Group, CallType, ActiveCall, WebRTCSignalPayload } from '../types';
import { CallSounds } from '../utils/soundEffects';

const RTC_CONFIG: RTCConfiguration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
    ]
};

interface E2EEContextType {
    socket: Socket | null;
    isConnected: boolean;
    messages: Record<string, Message[]>;
    groups: Group[];
    registerAndUploadKeys: (phone: string) => Promise<void>;
    startChat: (contactPhone: string) => Promise<void>;

    // 1-on-1 Messaging Actions
    sendMessage: (receiverPhone: string, content: string, type?: 'text' | 'image', isForwarded?: boolean) => Promise<void>;
    editMessage: (receiverPhone: string, msgId: string, newText: string) => Promise<void>;
    deleteMessage: (receiverPhone: string, msgId: string) => void;

    // Group Chat Actions
    fetchGroups: () => Promise<void>;
    createGroup: (name: string, members: string[], image?: string) => Promise<Group | null>;
    sendGroupMessage: (group: Group, content: string, type?: 'text' | 'image', isForwarded?: boolean) => Promise<void>;
    editGroupMessage: (group: Group, msgId: string, newText: string) => Promise<void>;
    deleteGroupMessage: (group: Group, msgId: string) => void;

    // Message Forwarding Action
    forwardMessage: (msg: Message, targetPhones: string[], targetGroups: Group[]) => Promise<void>;

    // Voice & Video Calling (1-on-1 & Group Mesh)
    activeCall: ActiveCall | null;
    localStream: MediaStream | null;
    remoteStreams: Record<string, MediaStream>;
    isMicMuted: boolean;
    isCameraOff: boolean;
    startCall: (callType: CallType, targetPhones: string[], options?: { isGroup?: boolean; groupId?: string; groupName?: string }) => Promise<void>;
    acceptCall: () => Promise<void>;
    rejectCall: () => void;
    endCall: () => void;
    toggleMic: () => void;
    toggleCamera: () => void;
    addParticipantToCall: (newTargetPhone: string) => void;

    currentUserPhone: string | null;
    setCurrentUserPhone: (phone: string) => void;
    currentUserName: string | null;
    setCurrentUserName: (name: string) => void;
    backendUrl: string;
    setBackendUrl: (url: string) => void;
}

const E2EEContext = createContext<E2EEContextType | null>(null);

export const useE2EE = () => {
    const context = useContext(E2EEContext);
    if (!context) throw new Error("useE2EE must be used within an E2EEProvider");
    return context;
};

export const E2EEProvider = ({ children }: { children: ReactNode }) => {
    const [socket, setSocket] = useState<Socket | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [messages, setMessages] = useState<Record<string, Message[]>>({});
    const [groups, setGroups] = useState<Group[]>([]);
    const [currentUserPhone, setCurrentUserPhone] = useState<string | null>(() => localStorage.getItem("chat_currentUserPhone"));
    const [currentUserName, setCurrentUserName] = useState<string | null>(() => localStorage.getItem("chat_currentUserName"));

    const [backendUrl, setBackendUrlState] = useState<string>(() => {
        return localStorage.getItem("chat_backend_url") || "https://flask-server-pctp.onrender.com";
    });

    // Call State
    const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
    const [isMicMuted, setIsMicMuted] = useState(false);
    const [isCameraOff, setIsCameraOff] = useState(false);

    // Type-safe refs without nested '>>' JSX ambiguity
    const activeRatchets = useRef(new Map<string, DoubleRatchet>());
    const initializingChats = useRef(new Set<string>());
    const isRegistering = useRef(false);

    // WebRTC Refs
    const peerConnections = useRef(new Map<string, RTCPeerConnection>());
    const localStreamRef = useRef<MediaStream | null>(null);
    const activeCallRef = useRef<ActiveCall | null>(null);

    useEffect(() => {
        activeCallRef.current = activeCall;
    }, [activeCall]);

    const setBackendUrl = (url: string) => {
        localStorage.setItem("chat_backend_url", url);
        setBackendUrlState(url);
    };

    // Auto-Load History & Groups
    useEffect(() => {
        if (currentUserPhone) {
            localStorage.setItem("chat_currentUserPhone", currentUserPhone);
            const savedHistory = localStorage.getItem(`monolith_history_${currentUserPhone}`);
            if (savedHistory) {
                try {
                    setMessages(JSON.parse(savedHistory));
                } catch (e) {
                    console.error("Failed to parse local chat history", e);
                }
            } else {
                setMessages({});
            }
            fetchGroups();
        }
    }, [currentUserPhone]);

    useEffect(() => {
        if (currentUserName) {
            localStorage.setItem("chat_currentUserName", currentUserName);
        }
    }, [currentUserName]);

    // Auto-Save History
    useEffect(() => {
        if (currentUserPhone && Object.keys(messages).length > 0) {
            localStorage.setItem(`monolith_history_${currentUserPhone}`, JSON.stringify(messages));
        }
    }, [messages, currentUserPhone]);

    const fetchGroups = async () => {
        if (!currentUserPhone) return;
        try {
            const res = await fetch(`${backendUrl}/groups?phone=${encodeURIComponent(currentUserPhone)}`);
            if (res.ok) {
                const data = await res.json();
                setGroups(data);
            }
        } catch (err) {
            console.error("Failed to fetch groups:", err);
        }
    };

    // WebSocket Initialization
    useEffect(() => {
        const newSocket = io(backendUrl, { transports: ['websocket'] });

        newSocket.on('connect', () => {
            setIsConnected(true);
            const savedPhone = currentUserPhone || localStorage.getItem("chat_currentUserPhone");
            if (savedPhone) newSocket.emit("register", { phone: savedPhone });
        });

        newSocket.on('disconnect', () => setIsConnected(false));

        // Handle Server-Relayed Deletions (1-on-1 & Group)
        newSocket.on('message_deleted', (data: { msgId: string; groupId?: string }) => {
            setMessages(prev => {
                const updated = { ...prev };
                for (const key in updated) {
                    updated[key] = updated[key].map(m =>
                        m.id === data.msgId ? { ...m, isDeleted: true, text: "This message was deleted", image: undefined } : m
                    );
                }
                return updated;
            });
        });

        // Handle Real-Time Group Creation
        newSocket.on('group_created', (newGroup: Group) => {
            setGroups(prev => {
                if (prev.some(g => g.id === newGroup.id)) return prev;
                return [newGroup, ...prev];
            });
        });

        setSocket(newSocket);
        return () => { newSocket.disconnect(); };
    }, [backendUrl, currentUserPhone]);

    // Handle Incoming Ciphertexts (1-on-1, Group Fan-Out, Edit Signals, Forwarded Flags)
    useEffect(() => {
        if (!socket || !currentUserPhone) return;

        const handleReceiveMessage = async (payload: any) => {
            const senderPhone = payload.sender;
            let ratchet = activeRatchets.current.get(senderPhone);

            if (!ratchet) {
                ratchet = await DoubleRatchet.loadState(senderPhone) || undefined;
                if (ratchet) activeRatchets.current.set(senderPhone, ratchet);
            }

            if (payload.is_session_init) {
                try {
                    const sharedSecret = await handleIncomingX3DH(payload);
                    const mySpk = await StorageEngine.getKeyPair('signed_prekey');
                    if (!mySpk) throw new Error("Critical keys missing!");
                    ratchet = await DoubleRatchet.initAsBob(sharedSecret, mySpk.privateKey, mySpk.publicKey);
                    activeRatchets.current.set(senderPhone, ratchet);
                    await ratchet.saveState(senderPhone);
                } catch (e) {
                    console.error("Failed X3DH Bob init:", e);
                    return;
                }
            }

            if (!ratchet) return;

            try {
                const cleanHeader = { dh_pub: String(payload.header.dh_pub), pn: Number(payload.header.pn), n: Number(payload.header.n) };
                const plaintext = await ratchet.decrypt(cleanHeader, String(payload.ciphertext));
                await ratchet.saveState(senderPhone);

                let parsed;
                try {
                    parsed = JSON.parse(plaintext);
                } catch {
                    parsed = { type: 'text', content: plaintext, msgId: payload.msgId };
                }

                const msgId = parsed.msgId || payload.msgId || Date.now().toString();
                const groupId = parsed.groupId || payload.groupId;
                const bucketKey = groupId ? groupId : senderPhone;

                // Intercept and process Edit Signals silently (supports both 1-on-1 & Group)
                if (parsed.type === 'edit_signal') {
                    setMessages(prev => ({
                        ...prev,
                        [bucketKey]: (prev[bucketKey] || []).map(m =>
                            m.id === parsed.targetMsgId ? { ...m, text: parsed.newContent, isEdited: true } : m
                        )
                    }));
                    return;
                }

                // Normal message processing (Text or Image, 1-on-1 or Group)
                const newMessage: Message = {
                    id: msgId,
                    sender: senderPhone,
                    senderName: parsed.senderName,
                    receiver: groupId || currentUserPhone,
                    groupId: groupId,
                    type: parsed.type || 'text',
                    text: parsed.type === 'text' ? parsed.content : undefined,
                    image: parsed.type === 'image' ? parsed.content : undefined,
                    timestamp: new Date(payload.dateTime || Date.now()),
                    isMine: false,
                    isForwarded: Boolean(parsed.isForwarded)
                };

                setMessages(prev => ({ ...prev, [bucketKey]: [...(prev[bucketKey] || []), newMessage] }));
            } catch (error) {
                console.error("Decryption failed:", error);
            }
        };

        socket.on('receive_message', handleReceiveMessage);
        return () => { socket.off('receive_message', handleReceiveMessage); };
    }, [socket, currentUserPhone]);

    const handleIncomingX3DH = async (payload: any): Promise<Uint8Array> => {
        const { masterSecret } = await PQX3DHService.receiveHandshake({
            aliceIdentityKey: payload.alice_ik_pub,
            aliceEphemeralKey: payload.alice_ek_pub,
            pqCiphertext: payload.header.pq_ciphertext
        });
        return masterSecret;
    };

    const registerAndUploadKeys = async (phone: string) => {
        if (isRegistering.current) return;
        isRegistering.current = true;
        try {
            const bundle = await PQX3DHService.generateRegistrationBundle();
            const payload = {
                phone: phone, identityKey: bundle.identityKey, identitySignKey: bundle.identitySignKey,
                signedPreKey: bundle.signedPreKey, signature: bundle.signature,
                quantumPreKey: bundle.quantumPreKey, oneTimePreKeys: bundle.oneTimePreKeys
            };
            const response = await fetch(`${backendUrl}/keys/upload`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!response.ok) throw new Error("Server rejected keys: " + await response.text());

            if (socket) socket.emit("register", { phone });
            localStorage.setItem("chat_currentUserPhone", phone);
        } finally {
            isRegistering.current = false;
        }
    };

    const startChat = async (contactPhone: string) => {
        if (activeRatchets.current.has(contactPhone)) return;
        if (initializingChats.current.has(contactPhone)) return;
        initializingChats.current.add(contactPhone);
        try {
            const savedRatchet = await DoubleRatchet.loadState(contactPhone);
            if (savedRatchet) {
                activeRatchets.current.set(contactPhone, savedRatchet);
                return;
            }
            const response = await fetch(`${backendUrl}/keys/fetch?target_phone=${contactPhone}`);
            if (!response.ok) throw new Error("Could not fetch user bundle.");
            const data = await response.json();

            const x3dhResult = await PQX3DHService.initiateHandshake(data);
            const newRatchet = await DoubleRatchet.initAsAlice(x3dhResult.masterSecret, Encoding.fromBase64(data.signedPreKey));

            (newRatchet as any)._initialEphemeralPub = x3dhResult.aliceEphemeralPublicKey;
            (newRatchet as any)._pqCiphertext = x3dhResult.pqCiphertext;

            activeRatchets.current.set(contactPhone, newRatchet);
            await newRatchet.saveState(contactPhone);
        } finally {
            initializingChats.current.delete(contactPhone);
        }
    };

    // Internal helper to encrypt and emit a single frame to one recipient
    const encryptAndEmitToPeer = async (
        targetPhone: string,
        frameObj: Record<string, any>,
        sharedMsgId: string,
        groupId?: string
    ) => {
        if (!currentUserPhone) return;
        if (!activeRatchets.current.has(targetPhone)) {
            await startChat(targetPhone);
        }
        const ratchet = activeRatchets.current.get(targetPhone);
        if (!ratchet) throw new Error(`Could not initialize ratchet with ${targetPhone}`);

        const messageFrame = JSON.stringify(frameObj);
        const { header, ciphertext } = await ratchet.encrypt(messageFrame);
        await ratchet.saveState(targetPhone);

        const finalHeader: any = { ...header };
        const payload: any = {
            sender: currentUserPhone,
            receiver: targetPhone,
            clientMsgId: sharedMsgId,
            groupId: groupId,
            ciphertext: ciphertext,
            header: finalHeader,
            dateTime: new Date().toISOString()
        };

        if (header.n === 0 && header.pn === 0 && (ratchet as any)._initialEphemeralPub) {
            const myIdentity = await StorageEngine.getKeyPair('identity');
            if (!myIdentity) throw new Error("Identity key missing!");
            payload.is_session_init = true;
            payload.alice_ik_pub = Encoding.toBase64(myIdentity.publicKey);
            payload.alice_ek_pub = Encoding.toBase64((ratchet as any)._initialEphemeralPub);
            finalHeader.pq_ciphertext = (ratchet as any)._pqCiphertext;
        }

        socket?.emit('send_message', payload);
    };

    // 1-on-1 Send Message
    const sendMessage = async (
        receiverPhone: string,
        content: string,
        type: 'text' | 'image' = 'text',
        isForwarded: boolean = false
    ) => {
        if (!currentUserPhone) throw new Error("Not logged in.");
        const msgId = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

        await encryptAndEmitToPeer(
            receiverPhone,
            { type, content, msgId, isForwarded, senderName: currentUserName || currentUserPhone },
            msgId
        );

        const newMessage: Message = {
            id: msgId,
            sender: currentUserPhone,
            receiver: receiverPhone,
            type,
            text: type === 'text' ? content : undefined,
            image: type === 'image' ? content : undefined,
            timestamp: new Date(),
            isMine: true,
            isForwarded
        };

        setMessages(prev => ({ ...prev, [receiverPhone]: [...(prev[receiverPhone] || []), newMessage] }));
    };

    // 1-on-1 Edit Message
    const editMessage = async (receiverPhone: string, msgId: string, newText: string) => {
        if (!currentUserPhone) return;
        await encryptAndEmitToPeer(
            receiverPhone,
            { type: 'edit_signal', targetMsgId: msgId, newContent: newText },
            `edit_${Date.now()}`
        );

        setMessages(prev => ({
            ...prev,
            [receiverPhone]: (prev[receiverPhone] || []).map(m => m.id === msgId ? { ...m, text: newText, isEdited: true } : m)
        }));
    };

    // 1-on-1 Delete Message
    const deleteMessage = (receiverPhone: string, msgId: string) => {
        if (!currentUserPhone) return;
        socket?.emit('delete_message', { sender: currentUserPhone, receiver: receiverPhone, msgId });

        setMessages(prev => ({
            ...prev,
            [receiverPhone]: (prev[receiverPhone] || []).map(m =>
                m.id === msgId ? { ...m, isDeleted: true, text: "This message was deleted", image: undefined } : m
            )
        }));
    };

    // =========================================================================
    // GROUP CHAT ACTIONS (PAIRWISE FAN-OUT)
    // =========================================================================
    const createGroup = async (name: string, members: string[], image: string = ""): Promise<Group | null> => {
        if (!currentUserPhone) return null;
        try {
            const res = await fetch(`${backendUrl}/groups/create`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, admin: currentUserPhone, members, image })
            });
            const data = await res.json();
            if (res.ok && data.group) {
                setGroups(prev => prev.some(g => g.id === data.group.id) ? prev : [data.group, ...prev]);
                return data.group;
            }
        } catch (err) {
            console.error("Failed to create group:", err);
        }
        return null;
    };

    const sendGroupMessage = async (
        group: Group,
        content: string,
        type: 'text' | 'image' = 'text',
        isForwarded: boolean = false
    ) => {
        if (!currentUserPhone) return;
        const msgId = `grp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const recipients = group.members.filter(m => m !== currentUserPhone);

        // Encrypt individually for each member in the group (Pairwise E2EE Fan-Out)
        for (const memberPhone of recipients) {
            try {
                await encryptAndEmitToPeer(
                    memberPhone,
                    {
                        type,
                        content,
                        msgId,
                        groupId: group.id,
                        senderName: currentUserName || currentUserPhone,
                        isForwarded
                    },
                    msgId,
                    group.id
                );
            } catch (e) {
                console.error(`Failed group fan-out to ${memberPhone}:`, e);
            }
        }

        const newMessage: Message = {
            id: msgId,
            sender: currentUserPhone,
            senderName: currentUserName || currentUserPhone,
            receiver: group.id,
            groupId: group.id,
            type,
            text: type === 'text' ? content : undefined,
            image: type === 'image' ? content : undefined,
            timestamp: new Date(),
            isMine: true,
            isForwarded
        };

        setMessages(prev => ({ ...prev, [group.id]: [...(prev[group.id] || []), newMessage] }));
    };

    const editGroupMessage = async (group: Group, msgId: string, newText: string) => {
        if (!currentUserPhone) return;
        const recipients = group.members.filter(m => m !== currentUserPhone);

        for (const memberPhone of recipients) {
            try {
                await encryptAndEmitToPeer(
                    memberPhone,
                    { type: 'edit_signal', targetMsgId: msgId, newContent: newText, groupId: group.id },
                    `edit_${Date.now()}`,
                    group.id
                );
            } catch (e) {
                console.error(`Failed group edit fan-out to ${memberPhone}:`, e);
            }
        }

        setMessages(prev => ({
            ...prev,
            [group.id]: (prev[group.id] || []).map(m => m.id === msgId ? { ...m, text: newText, isEdited: true } : m)
        }));
    };

    const deleteGroupMessage = (group: Group, msgId: string) => {
        if (!currentUserPhone) return;
        const recipients = group.members.filter(m => m !== currentUserPhone);

        for (const memberPhone of recipients) {
            socket?.emit('delete_message', {
                sender: currentUserPhone,
                receiver: memberPhone,
                msgId,
                groupId: group.id
            });
        }

        setMessages(prev => ({
            ...prev,
            [group.id]: (prev[group.id] || []).map(m =>
                m.id === msgId ? { ...m, isDeleted: true, text: "This message was deleted", image: undefined } : m
            )
        }));
    };

    // =========================================================================
    // MESSAGE FORWARDING (MULTI-TARGET FAN-OUT)
    // =========================================================================
    const forwardMessage = async (msg: Message, targetPhones: string[], targetGroups: Group[]) => {
        const content = msg.type === 'image' ? msg.image : msg.text;
        const type: 'text' | 'image' = msg.type === 'image' ? 'image' : 'text';
        if (!content) return;

        for (const phone of targetPhones) {
            await sendMessage(phone, content, type, true);
        }
        for (const grp of targetGroups) {
            await sendGroupMessage(grp, content, type, true);
        }
    };

    // =========================================================================
    // WEBRTC VOICE & VIDEO CALLING (1-ON-1 & GROUP P2P MESH)
    // =========================================================================
    const cleanupCall = () => {
        peerConnections.current.forEach((pc: RTCPeerConnection) => {
            try { pc.close(); } catch {}
        });
        peerConnections.current.clear();

        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(t => t.stop());
            localStreamRef.current = null;
        }
        setLocalStream(null);
        setRemoteStreams({});
        setActiveCall(null);
        setIsMicMuted(false);
        setIsCameraOff(false);
    };

    const acquireMediaStream = async (callType: CallType, peerCount: number): Promise<MediaStream> => {
        const videoConstraints = callType === 'video'
            ? {
                width: { ideal: peerCount > 2 ? 640 : 1280 },
                height: { ideal: peerCount > 2 ? 360 : 720 },
                frameRate: { ideal: peerCount > 2 ? 20 : 30 }
            }
            : false;

        const stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: videoConstraints
        });
        localStreamRef.current = stream;
        setLocalStream(stream);
        return stream;
    };

    const createPeerConnection = (peerPhone: string, callId: string, callType: CallType): RTCPeerConnection => {
        const existing = peerConnections.current.get(peerPhone);
        if (existing) {
            try { existing.close(); } catch {}
        }

        const pc = new RTCPeerConnection(RTC_CONFIG);

        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => {
                pc.addTrack(track, localStreamRef.current!);
            });
        }

        pc.onicecandidate = (event) => {
            if (event.candidate && currentUserPhone) {
                socket?.emit('webrtc_signal', {
                    callId,
                    senderPhone: currentUserPhone,
                    senderName: currentUserName || currentUserPhone,
                    targetPhone: peerPhone,
                    type: 'ice-candidate',
                    candidate: event.candidate.toJSON(),
                    callType
                });
            }
        };

        pc.ontrack = (event) => {
            const [remoteStream] = event.streams;
            if (remoteStream) {
                setRemoteStreams(prev => ({ ...prev, [peerPhone]: remoteStream }));
            }
        };

        pc.onconnectionstatechange = () => {
            if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
                setRemoteStreams(prev => {
                    const copy = { ...prev };
                    delete copy[peerPhone];
                    return copy;
                });
            }
        };

        peerConnections.current.set(peerPhone, pc);
        return pc;
    };

    const startCall = async (
        callType: CallType,
        targetPhones: string[],
        options?: { isGroup?: boolean; groupId?: string; groupName?: string }
    ) => {
        if (!currentUserPhone || !socket) return;

        // Enforce production limits: Max 4 total participants (3 peers) for video calls, Max 8 (7 peers) for audio calls
        const cleanTargets = targetPhones.filter(p => p && p !== currentUserPhone);
        const maxPeers = callType === 'video' ? 3 : 7;
        const finalTargets = cleanTargets.slice(0, maxPeers);

        if (cleanTargets.length > maxPeers && callType === 'video') {
            alert(`Group Video Calls are capped at 4 participants for smooth P2P quality. Calling the first 3 members.`);
        }

        try {
            await acquireMediaStream(callType, finalTargets.length + 1);
        } catch (err) {
            alert("Could not access microphone/camera. Please check browser permissions.");
            return;
        }

        const callId = `call_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const allParticipants = [currentUserPhone, ...finalTargets];

        const newCall: ActiveCall = {
            callId,
            callType,
            isGroup: Boolean(options?.isGroup),
            groupId: options?.groupId,
            groupName: options?.groupName,
            callerPhone: currentUserPhone,
            callerName: currentUserName || currentUserPhone,
            participants: allParticipants,
            status: 'ringing_outgoing'
        };
        setActiveCall(newCall);

        for (const targetPhone of finalTargets) {
            socket.emit('call_invite', {
                callId,
                callerPhone: currentUserPhone,
                callerName: currentUserName || currentUserPhone,
                targetPhone,
                callType,
                isGroup: Boolean(options?.isGroup),
                groupId: options?.groupId,
                groupName: options?.groupName,
                participants: allParticipants
            });
        }
    };

    const acceptCall = async () => {
        const call = activeCallRef.current;
        if (!call || !currentUserPhone || !socket) return;

        try {
            await acquireMediaStream(call.callType, call.participants.length);
        } catch (err) {
            alert("Could not access microphone/camera. Please check browser permissions.");
            rejectCall();
            return;
        }

        setActiveCall({ ...call, status: 'connected' });

        // Notify all other participants in the call that we accepted
        const otherPeers = call.participants.filter(p => p !== currentUserPhone);
        for (const peerPhone of otherPeers) {
            socket.emit('call_response', {
                callId: call.callId,
                responderPhone: currentUserPhone,
                responderName: currentUserName || currentUserPhone,
                targetPhone: peerPhone,
                accepted: true
            });
        }
    };

    const rejectCall = () => {
        const call = activeCallRef.current;
        if (!call || !currentUserPhone || !socket) return;

        socket.emit('call_response', {
            callId: call.callId,
            responderPhone: currentUserPhone,
            responderName: currentUserName || currentUserPhone,
            targetPhone: call.callerPhone,
            accepted: false
        });
        cleanupCall();
    };

    const endCall = () => {
        const call = activeCallRef.current;
        if (call && currentUserPhone && socket) {
            const otherPeers = call.participants.filter(p => p !== currentUserPhone);
            for (const peerPhone of otherPeers) {
                socket.emit('call_end', {
                    callId: call.callId,
                    senderPhone: currentUserPhone,
                    targetPhone: peerPhone
                });
            }
        }
        cleanupCall();
    };

    const toggleMic = () => {
        if (!localStreamRef.current) return;
        localStreamRef.current.getAudioTracks().forEach(track => {
            track.enabled = !track.enabled;
            setIsMicMuted(!track.enabled);
        });
    };

    const toggleCamera = () => {
        if (!localStreamRef.current) return;
        localStreamRef.current.getVideoTracks().forEach(track => {
            track.enabled = !track.enabled;
            setIsCameraOff(!track.enabled);
        });
    };

    // Automatically play WhatsApp-style audio effects based on call state
    useEffect(() => {
        if (!activeCall) {
            CallSounds.stopRing();
            return;
        }
        if (activeCall.status === 'ringing_incoming') {
            CallSounds.startIncomingRing();
        } else if (activeCall.status === 'ringing_outgoing') {
            CallSounds.startOutgoingRing();
        } else if (activeCall.status === 'connected') {
            CallSounds.playConnectedBeep();
        }
        return () => CallSounds.stopRing();
    }, [activeCall?.status, activeCall?.callId]);

    // Add a new person into an active call (WhatsApp-style mid-call invite)
    const addParticipantToCall = (newTargetPhone: string) => {
        const call = activeCallRef.current;
        if (!call || !currentUserPhone || !socket) return;
        if (call.participants.includes(newTargetPhone)) return;

        const maxParticipants = call.callType === 'video' ? 4 : 8;
        if (call.participants.length >= maxParticipants) {
            alert(`Maximum limit of ${maxParticipants} participants reached for ${call.callType} calls.`);
            return;
        }

        const updatedParticipants = [...call.participants, newTargetPhone];
        const updatedCall: ActiveCall = {
            ...call,
            isGroup: updatedParticipants.length > 2 ? true : call.isGroup,
            groupName: call.groupName || `Group Call (${updatedParticipants.length})`,
            participants: updatedParticipants
        };

        setActiveCall(updatedCall);

        socket.emit('call_invite', {
            callId: call.callId,
            callerPhone: currentUserPhone,
            callerName: currentUserName || currentUserPhone,
            targetPhone: newTargetPhone,
            callType: call.callType,
            isGroup: updatedCall.isGroup,
            groupId: call.groupId,
            groupName: updatedCall.groupName,
            participants: updatedParticipants
        });
    };

    // WebRTC Socket Signaling Listeners
    useEffect(() => {
        if (!socket || !currentUserPhone) return;

        const handleIncomingCall = (data: any) => {
            if (activeCallRef.current) return;

            setActiveCall({
                callId: data.callId,
                callType: data.callType || 'audio',
                isGroup: Boolean(data.isGroup),
                groupId: data.groupId,
                groupName: data.groupName,
                callerPhone: data.callerPhone,
                callerName: data.callerName || data.callerPhone,
                participants: data.participants || [data.callerPhone, currentUserPhone],
                status: 'ringing_incoming'
            });
        };

        const handleCallResponse = async (data: any) => {
            const call = activeCallRef.current;
            if (!call || call.callId !== data.callId) return;

            if (!data.accepted) {
                if (!call.isGroup) {
                    cleanupCall();
                }
                return;
            }

            setActiveCall(prev => prev ? { ...prev, status: 'connected' } : null);

            const peerPhone = data.responderPhone;
            const pc = createPeerConnection(peerPhone, call.callId, call.callType);
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            socket.emit('webrtc_signal', {
                callId: call.callId,
                senderPhone: currentUserPhone,
                senderName: currentUserName || currentUserPhone,
                targetPhone: peerPhone,
                type: 'offer',
                sdp: pc.localDescription,
                callType: call.callType
            });
        };

        const handleWebRTCSignal = async (data: WebRTCSignalPayload) => {
            const call = activeCallRef.current;
            if (!call || call.callId !== data.callId) return;

            const peerPhone = data.senderPhone;
            let pc = peerConnections.current.get(peerPhone);

            if (data.type === 'offer' && data.sdp) {
                pc = createPeerConnection(peerPhone, call.callId, call.callType);
                await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);

                socket.emit('webrtc_signal', {
                    callId: call.callId,
                    senderPhone: currentUserPhone,
                    senderName: currentUserName || currentUserPhone,
                    targetPhone: peerPhone,
                    type: 'answer',
                    sdp: pc.localDescription,
                    callType: call.callType
                });
            } else if (data.type === 'answer' && data.sdp && pc) {
                await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
            } else if (data.type === 'ice-candidate' && data.candidate && pc) {
                try {
                    await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
                } catch (e) {
                    console.error("Error adding ICE candidate:", e);
                }
            }
        };

        const handleCallEnded = (data: any) => {
            const call = activeCallRef.current;
            if (!call || call.callId !== data.callId) return;

            const peerPhone = data.senderPhone;
            const pc = peerConnections.current.get(peerPhone);
            if (pc) {
                try { pc.close(); } catch {}
                peerConnections.current.delete(peerPhone);
            }

            setRemoteStreams(prev => {
                const updated = { ...prev };
                delete updated[peerPhone];
                if (!call.isGroup || Object.keys(updated).length === 0) {
                    cleanupCall();
                }
                return updated;
            });
        };

        socket.on('incoming_call', handleIncomingCall);
        socket.on('call_response', handleCallResponse);
        socket.on('webrtc_signal', handleWebRTCSignal);
        socket.on('call_ended', handleCallEnded);

        return () => {
            socket.off('incoming_call', handleIncomingCall);
            socket.off('call_response', handleCallResponse);
            socket.off('webrtc_signal', handleWebRTCSignal);
            socket.off('call_ended', handleCallEnded);
        };
    }, [socket, currentUserPhone, currentUserName]);

    return (
        <E2EEContext.Provider value={{
            socket, isConnected, messages, groups,
            registerAndUploadKeys, startChat,
            sendMessage, editMessage, deleteMessage,
            fetchGroups, createGroup, sendGroupMessage, editGroupMessage, deleteGroupMessage,
            forwardMessage,
            activeCall, localStream, remoteStreams, isMicMuted, isCameraOff,
            startCall, acceptCall, rejectCall, endCall, toggleMic, toggleCamera, addParticipantToCall,
            currentUserPhone, setCurrentUserPhone,
            currentUserName, setCurrentUserName,
            backendUrl, setBackendUrl
        }}>
            {children}
        </E2EEContext.Provider>
    );
};