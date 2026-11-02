import React, { useEffect, useRef, useState } from "react";
import { useE2EE } from "../contexts/E2EEContext";
import { User } from "../types";
import {
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  Video,
  VideoOff,
  ShieldCheck,
  UserPlus,
  X,
  Check,
} from "lucide-react";
import { CallSounds } from "../utils/soundEffects";

interface CallOverlayProps {
  users?: User[];
}

const VideoTile: React.FC<{
  stream: MediaStream;
  label: string;
  isLocal?: boolean;
  isAudioOnly?: boolean;
}> = ({ stream, label, isLocal = false, isAudioOnly = false }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className="relative bg-zinc-900 border border-white/10 rounded-2xl overflow-hidden flex items-center justify-center aspect-video shadow-xl">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        className={`w-full h-full object-cover ${isAudioOnly ? "hidden" : ""}`}
      />
      {isAudioOnly && (
        <div className="flex flex-col items-center gap-3">
          <div className="w-20 h-20 rounded-full bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center animate-pulse">
            <img
              src={`https://api.dicebear.com/7.x/bottts/svg?seed=${label}`}
              alt={label}
              className="w-14 h-14 rounded-full"
            />
          </div>
          <span className="text-xs font-semibold text-white">{label}</span>
        </div>
      )}
      <div className="absolute bottom-3 left-3 px-2.5 py-1 rounded-lg bg-black/60 backdrop-blur-md text-[11px] text-white font-medium">
        {label} {isLocal ? "(You)" : ""}
      </div>
    </div>
  );
};

export const CallOverlay: React.FC<CallOverlayProps> = ({ users = [] }) => {
  const {
    activeCall,
    localStream,
    remoteStreams,
    isMicMuted,
    isCameraOff,
    acceptCall,
    rejectCall,
    endCall,
    toggleMic,
    toggleCamera,
    addParticipantToCall,
    currentUserPhone,
  } = useE2EE();

  const [showInviteModal, setShowInviteModal] = useState(false);
  const [invitedPhones, setInvitedPhones] = useState<string[]>([]);

  useEffect(() => {
    if (!activeCall) {
      setShowInviteModal(false);
      setInvitedPhones([]);
    }
  }, [activeCall]);

  if (!activeCall) return null;

  const isAudioCall = activeCall.callType === "audio";
  const remoteEntries = Object.entries(remoteStreams);
  const maxParticipants = isAudioCall ? 8 : 4;

  const getDisplayName = (phone: string) => {
    const found = users.find((u) => u.phone === phone);
    return found ? found.name : phone;
  };

  // Contacts who are not already in the call
  const availableContacts = users.filter(
    (u) =>
      u.phone !== currentUserPhone &&
      !activeCall.participants.includes(u.phone) &&
      ! Object.keys(remoteStreams).includes(u.phone)
  );

  // Incoming Call Ringing Modal
  if (activeCall.status === "ringing_incoming") {
    return (
      <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xl flex items-center justify-center p-4">
        <div className="bg-zinc-900 border border-white/15 rounded-3xl p-8 max-w-sm w-full text-center space-y-6 shadow-2xl">
          <div className="w-24 h-24 mx-auto rounded-full bg-indigo-600/20 border-2 border-indigo-500/40 flex items-center justify-center animate-bounce">
            <img
              src={`https://api.dicebear.com/7.x/bottts/svg?seed=${activeCall.callerPhone}`}
              alt={activeCall.callerName}
              className="w-16 h-16 rounded-full"
            />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">
              {activeCall.isGroup
                ? activeCall.groupName || "Group Call"
                : getDisplayName(activeCall.callerPhone)}
            </h3>
            <p className="text-xs text-indigo-400 mt-1">
              Incoming Encrypted {activeCall.isGroup ? "Group " : ""}
              {isAudioCall ? "Voice" : "Video"} Call...
            </p>
          </div>
          <div className="flex items-center justify-center gap-6 pt-2">
            <button
              onClick={() => {
                CallSounds.playCallEndBeep();
                rejectCall();
              }}
              className="p-4 rounded-full bg-rose-600 hover:bg-rose-500 text-white shadow-lg cursor-pointer transition-transform active:scale-95"
              title="Decline"
            >
              <PhoneOff className="w-6 h-6" />
            </button>
            <button
              onClick={acceptCall}
              className="p-4 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg cursor-pointer transition-transform active:scale-95"
              title="Accept"
            >
              <Phone className="w-6 h-6" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Active or Outgoing Call Screen
  return (
    <div className="fixed inset-0 z-50 bg-[#050608]/95 backdrop-blur-2xl flex flex-col justify-between p-4 sm:p-6">
      {/* Top Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="px-3 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 text-xs font-semibold flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4" />
            <span>P2P Encrypted {isAudioCall ? "Voice" : "Video"} Mesh</span>
          </div>
          <span className="text-xs text-slate-400">
            {activeCall.status === "ringing_outgoing" && remoteEntries.length === 0
              ? "Ringing..."
              : `${remoteEntries.length + 1} / ${maxParticipants} Connected`}
          </span>
        </div>

        {/* WhatsApp-style Add Participant Button */}
        <button
          onClick={() => setShowInviteModal(true)}
          disabled={activeCall.participants.length >= maxParticipants}
          className="px-3.5 py-2 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 text-indigo-300 text-xs font-semibold flex items-center gap-2 cursor-pointer disabled:opacity-40 transition-all"
          title="Add Person to Call"
        >
          <UserPlus className="w-4 h-4" />
          <span className="hidden sm:inline">Add Person</span>
        </button>
      </div>

      {/* Media Grid */}
      <div className="flex-1 flex items-center justify-center my-4 overflow-y-auto">
        <div
          className={`grid gap-4 w-full max-w-5xl ${
            remoteEntries.length === 0
              ? "grid-cols-1 max-w-xl"
              : "grid-cols-1 sm:grid-cols-2"
          }`}
        >
          {localStream && (
            <VideoTile
              stream={localStream}
              label="Me"
              isLocal
              isAudioOnly={isAudioCall || isCameraOff}
            />
          )}
          {remoteEntries.map(([peerPhone, stream]) => (
            <VideoTile
              key={peerPhone}
              stream={stream}
              label={getDisplayName(peerPhone)}
              isAudioOnly={isAudioCall}
            />
          ))}
        </div>
      </div>

      {/* Call Controls Bar */}
      <div className="flex items-center justify-center gap-4 pb-4">
        <button
          onClick={toggleMic}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            isMicMuted
              ? "bg-rose-500/20 border-rose-500/40 text-rose-400"
              : "bg-white/10 border-white/10 text-white hover:bg-white/20"
          }`}
          title={isMicMuted ? "Unmute Mic" : "Mute Mic"}
        >
          {isMicMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </button>

        {!isAudioCall && (
          <button
            onClick={toggleCamera}
            className={`p-4 rounded-2xl border transition-all cursor-pointer ${
              isCameraOff
                ? "bg-rose-500/20 border-rose-500/40 text-rose-400"
                : "bg-white/10 border-white/10 text-white hover:bg-white/20"
            }`}
            title={isCameraOff ? "Turn Camera On" : "Turn Camera Off"}
          >
            {isCameraOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
          </button>
        )}

        <button
          onClick={() => {
            CallSounds.playCallEndBeep();
            endCall();
          }}
          className="px-6 py-4 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs flex items-center gap-2 shadow-lg cursor-pointer transition-all"
        >
          <PhoneOff className="w-5 h-5" />
          <span>End Call</span>
        </button>
      </div>

      {/* Add Person to Call Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-white/10 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2 text-white font-semibold text-sm">
                <UserPlus className="w-4 h-4 text-indigo-400" />
                <span>Add Person to Call</span>
              </div>
              <button
                onClick={() => setShowInviteModal(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 max-h-64 overflow-y-auto space-y-2">
              {availableContacts.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-6">
                  All available contacts are already in this call.
                </p>
              ) : (
                availableContacts.map((u) => {
                  const isInvited = invitedPhones.includes(u.phone);
                  return (
                    <div
                      key={u.phone}
                      className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2.5">
                        <img
                          src={
                            u.image ||
                            `https://api.dicebear.com/7.x/bottts/svg?seed=${u.phone}`
                          }
                          alt={u.name}
                          className="w-8 h-8 rounded-lg object-cover bg-zinc-800"
                        />
                        <div className="flex flex-col">
                          <span className="text-xs font-medium text-white">
                            {u.name}
                          </span>
                          <span className="text-[10px] text-slate-500">
                            {u.phone}
                          </span>
                        </div>
                      </div>

                      <button
                        disabled={isInvited}
                        onClick={() => {
                          addParticipantToCall(u.phone);
                          setInvitedPhones((prev) => [...prev, u.phone]);
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer transition-all ${
                          isInvited
                            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                            : "bg-indigo-600 hover:bg-indigo-500 text-white"
                        }`}
                      >
                        {isInvited ? (
                          <>
                            <Check className="w-3.5 h-3.5" /> Ringing
                          </>
                        ) : (
                          "Ring"
                        )}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};