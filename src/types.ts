export interface Message {
    id: string;
    sender: string;
    senderName?: string;      // Displayed on incoming group chat bubbles
    receiver: string;         // Phone number (for 1-on-1) or Group ID (for groups)
    groupId?: string;         // Present if message belongs to a group chat
    text?: string;
    image?: string;
    type?: 'text' | 'image' | 'edit_signal';
    timestamp: Date | string;
    isMine: boolean;
    isEdited?: boolean;
    isDeleted?: boolean;
    isForwarded?: boolean;    // Renders the "↪ Forwarded" badge
    status?: number;          // 1 = sent, 2 = delivered, 3 = read
}

export interface User {
    id: string;
    name: string;
    phone: string;
    image?: string;
    online?: boolean;
}

export interface Group {
    id: string;
    name: string;
    admin: string;
    members: string[];        // Array of member phone numbers
    image?: string;
    createdAt?: string;
}

export type CallType = 'audio' | 'video';

export interface ActiveCall {
    callId: string;
    callType: CallType;
    isGroup: boolean;
    groupId?: string;
    groupName?: string;
    callerPhone: string;
    callerName: string;
    participants: string[];   // Phone numbers in the call
    status: 'ringing_incoming' | 'ringing_outgoing' | 'connected';
}

export interface WebRTCSignalPayload {
    callId: string;
    senderPhone: string;
    senderName?: string;
    targetPhone: string;
    type: 'offer' | 'answer' | 'ice-candidate';
    sdp?: RTCSessionDescriptionInit;
    candidate?: RTCIceCandidateInit;
    callType?: CallType;
}