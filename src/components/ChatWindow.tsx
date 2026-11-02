import React, { useState, useEffect, useRef } from "react";
import { User, Group, Message } from "../types";
import { useE2EE } from "../contexts/E2EEContext";
import {
  Send,
  Check,
  Smile,
  ArrowLeft,
  Lock,
  Image as ImageIcon,
  Edit2,
  Trash2,
  X,
  Ban,
  Phone,
  Video,
  Forward,
  Users,
} from "lucide-react";
import { ForwardMessageModal } from "./ForwardMessageModal";

interface ChatWindowProps {
  selectedUser?: User | null;
  selectedGroup?: Group | null;
  allUsers?: User[];
  onBack: () => void;
}

export const ChatWindow: React.FC<ChatWindowProps> = ({
  selectedUser,
  selectedGroup,
  allUsers = [],
  onBack,
}) => {
  const {
    messages,
    sendMessage,
    editMessage,
    deleteMessage,
    sendGroupMessage,
    editGroupMessage,
    deleteGroupMessage,
    startChat,
    startCall,
    isConnected,
  } = useE2EE();

  const isGroupChat = Boolean(selectedGroup);
  const activeChatKey = isGroupChat ? selectedGroup!.id : selectedUser?.phone || "";
  const activeTitle = isGroupChat ? selectedGroup!.name : selectedUser?.name || "";
  const activeAvatar = isGroupChat
    ? selectedGroup!.image || `https://api.dicebear.com/7.x/identicon/svg?seed=${selectedGroup!.id}`
    : selectedUser?.image || `https://api.dicebear.com/7.x/bottts/svg?seed=${selectedUser?.phone}`;

  const [inputText, setInputText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Inline Edit State
  const [editingMsg, setEditingMsg] = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");

  // Forwarding Modal State
  const [forwardingMsg, setForwardingMsg] = useState<Message | null>(null);

  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{
    msg: Message;
    x: number;
    y: number;
    canModify: boolean;
  } | null>(null);

  useEffect(() => {
    if (!isGroupChat && selectedUser?.phone) {
      startChat(selectedUser.phone).catch((err) => {
        console.error("Failed to perform X3DH Handshake:", err);
      });
    }
  }, [isGroupChat, selectedUser?.phone, startChat]);

  // Close context menu if user clicks anywhere else
  useEffect(() => {
    const closeMenu = () => setContextMenu(null);
    document.addEventListener("click", closeMenu);
    return () => document.removeEventListener("click", closeMenu);
  }, []);

  const currentMessages = messages[activeChatKey] || [];

  const getGroupedMessages = () => {
    const groupedMap: { [key: string]: Message[] } = {};
    const chronologicalMessages = [...currentMessages];

    chronologicalMessages.forEach((msg) => {
      const dateKey = new Date(msg.timestamp).toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
      if (!groupedMap[dateKey]) groupedMap[dateKey] = [];
      groupedMap[dateKey].push(msg);
    });
    return groupedMap;
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [currentMessages, activeChatKey]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !activeChatKey) return;

    try {
      if (isGroupChat && selectedGroup) {
        await sendGroupMessage(selectedGroup, inputText.trim(), "text");
      } else if (selectedUser) {
        await sendMessage(selectedUser.phone, inputText.trim(), "text");
      }
      setInputText("");
    } catch (error) {
      console.error("Failed to send message:", error);
      alert("Failed to send. Ensure the secure session is initialized.");
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        alert("Image size must be less than 2MB to prevent payload issues.");
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        if (isGroupChat && selectedGroup) {
          sendGroupMessage(selectedGroup, base64, "image").catch(console.error);
        } else if (selectedUser) {
          sendMessage(selectedUser.phone, base64, "image").catch(console.error);
        }
        if (fileInputRef.current) fileInputRef.current.value = "";
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveEdit = async () => {
    if (editingMsg && editVal.trim()) {
      if (isGroupChat && selectedGroup) {
        await editGroupMessage(selectedGroup, editingMsg, editVal.trim());
      } else if (selectedUser) {
        await editMessage(selectedUser.phone, editingMsg, editVal.trim());
      }
    }
    setEditingMsg(null);
    setEditVal("");
  };

  const handleDelete = (msgId: string) => {
    if (isGroupChat && selectedGroup) {
      deleteGroupMessage(selectedGroup, msgId);
    } else if (selectedUser) {
      deleteMessage(selectedUser.phone, msgId);
    }
  };

  const insertQuickText = (text: string) => {
    if (isGroupChat && selectedGroup) {
      sendGroupMessage(selectedGroup, text, "text").catch(console.error);
    } else if (selectedUser) {
      sendMessage(selectedUser.phone, text, "text").catch(console.error);
    }
  };

  const isWithin10Minutes = (timestamp: Date | string): boolean => {
    const msgTime = new Date(timestamp).getTime();
    const currentTime = Date.now();
    return (currentTime - msgTime) / (1000 * 60) <= 10;
  };

  // Right-Click Handler (Forward works on any non-deleted message; Edit/Delete only within 10m for sender)
  const handleContextMenu = (e: React.MouseEvent, msg: Message, canModify: boolean) => {
    if (msg.isDeleted) return;
    e.preventDefault();
    setContextMenu({
      msg,
      x: e.clientX,
      y: e.clientY,
      canModify,
    });
  };

  const triggerCall = (type: "audio" | "video") => {
    if (isGroupChat && selectedGroup) {
      startCall(type, selectedGroup.members, {
        isGroup: true,
        groupId: selectedGroup.id,
        groupName: selectedGroup.name,
      });
    } else if (selectedUser) {
      startCall(type, [selectedUser.phone], { isGroup: false });
    }
  };

  const grouped = getGroupedMessages();

  return (
    <div className="flex-1 h-full flex flex-col bg-transparent relative" id="chat-window">
      {/* Header */}
      <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/[0.01] backdrop-blur-md shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-1.5 hover:bg-white/5 text-slate-400 hover:text-white rounded-xl md:hidden mr-1 transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="relative">
            <img
              src={activeAvatar}
              alt={activeTitle}
              className="w-10 h-10 rounded-xl object-cover border border-white/10 bg-zinc-900"
              referrerPolicy="no-referrer"
            />
            <div
              className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#050608] ${
                isConnected ? "bg-emerald-500" : "bg-zinc-600"
              }`}
            />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold text-white font-sans">{activeTitle}</span>
              {isGroupChat && (
                <span className="px-1.5 py-0.5 text-[9px] rounded-md bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex items-center gap-1">
                  <Users className="w-2.5 h-2.5" /> {selectedGroup?.members.length}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-sans mt-0.5">
              <span
                className={
                  isConnected ? "text-emerald-400 font-medium animate-pulse" : "text-slate-500 font-sans"
                }
              >
                {isConnected
                  ? isGroupChat
                    ? "Zero-Knowledge Fan-Out Active"
                    : "Secure Connection"
                  : "Connecting..."}
              </span>
            </div>
          </div>
        </div>

        {/* Call Buttons + PQ Badge */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => triggerCall("audio")}
            className="p-2 rounded-xl bg-white/5 hover:bg-indigo-600/20 border border-white/10 hover:border-indigo-500/40 text-slate-300 hover:text-indigo-300 transition-all cursor-pointer"
            title={isGroupChat ? "Start Group Voice Call" : "Start Voice Call"}
          >
            <Phone className="w-4 h-4" />
          </button>
          <button
            onClick={() => triggerCall("video")}
            className="p-2 rounded-xl bg-white/5 hover:bg-indigo-600/20 border border-white/10 hover:border-indigo-500/40 text-slate-300 hover:text-indigo-300 transition-all cursor-pointer"
            title={isGroupChat ? "Start Group Video Call (Max 4)" : "Start Video Call"}
          >
            <Video className="w-4 h-4" />
          </button>

          <div className="relative hidden sm:block">
            <div className="h-7 px-3 py-1 rounded-full text-[10px] font-semibold border transition-all duration-300 flex items-center gap-2 shadow-sm bg-indigo-500/10 text-indigo-400 border-indigo-500/30 backdrop-blur-md">
              <Lock className="w-3 h-3 text-indigo-400 shrink-0" />
              <span>PQ-X3DH Active</span>
            </div>
          </div>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 bg-gradient-to-b from-[#050608]/20 via-[#050608]/40 to-[#050608]/20">
        {Object.keys(grouped).length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center p-8 text-center text-slate-500">
            <Smile className="w-8 h-8 opacity-25 mb-2" />
            <p className="text-xs font-sans italic">Secure channel established. Say hello!</p>
          </div>
        ) : (
          Object.entries(grouped).map(([date, msgs]) => (
            <div key={date} className="space-y-4">
              <div className="flex items-center justify-center">
                <span className="px-3 py-1 bg-white/5 border border-white/10 rounded-full text-[10px] text-slate-500 font-sans tracking-[0.1em] uppercase font-bold">
                  {date}
                </span>
              </div>

              {msgs.map((m) => {
                const isMe = m.isMine;
                const canModify = isMe && !m.isDeleted && isWithin10Minutes(m.timestamp);

                return (
                  <div key={m.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                    <div className="flex items-end gap-3 max-w-[85%] sm:max-w-[70%]">
                      {!isMe && (
                        <img
                          src={`https://api.dicebear.com/7.x/bottts/svg?seed=${m.sender}`}
                          alt=""
                          className="w-8 h-8 rounded-lg object-cover border border-white/10 bg-zinc-900 shrink-0 mb-4 hidden sm:block"
                          referrerPolicy="no-referrer"
                        />
                      )}

                      <div className="flex flex-col w-full">
                        {/* Group Sender Name */}
                        {isGroupChat && !isMe && (
                          <span className="text-[10px] text-indigo-400 font-semibold mb-1 pl-1">
                            {m.senderName || m.sender}
                          </span>
                        )}

                        {/* THE MESSAGE BUBBLE */}
                        <div
                          onContextMenu={(e) => handleContextMenu(e, m, canModify)}
                          className={`p-1 rounded-2xl relative shadow-md transition-all cursor-context-menu ${
                            isMe
                              ? "bg-indigo-600 text-white rounded-br-none shadow-indigo-900/10 border border-indigo-500/20"
                              : "bg-white/5 border border-white/10 text-slate-200 rounded-bl-none backdrop-blur-sm"
                          }`}
                        >
                          {m.isDeleted ? (
                            <div className="px-3 py-2 flex items-center gap-2 text-slate-400 italic">
                              <Ban className="w-4 h-4 opacity-70" />
                              <span className="text-sm font-sans">{m.text}</span>
                            </div>
                          ) : (
                            <>
                              {/* Forwarded Label */}
                              {m.isForwarded && (
                                <div className="px-3 pt-1.5 flex items-center gap-1 text-[10px] italic opacity-75">
                                  <Forward className="w-3 h-3" />
                                  <span>Forwarded</span>
                                </div>
                              )}

                              {editingMsg === m.id ? (
                                <div className="p-2 flex flex-col gap-2 min-w-[200px]">
                                  <input
                                    type="text"
                                    autoFocus
                                    value={editVal}
                                    onChange={(e) => setEditVal(e.target.value)}
                                    className="w-full bg-black/20 border border-white/20 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-400"
                                  />
                                  <div className="flex justify-end gap-2">
                                    <button
                                      onClick={() => setEditingMsg(null)}
                                      className="p-1 hover:bg-white/10 rounded-md text-slate-300"
                                    >
                                      <X className="w-4 h-4" />
                                    </button>
                                    <button
                                      onClick={handleSaveEdit}
                                      className="p-1 hover:bg-indigo-500/50 rounded-md text-emerald-300"
                                    >
                                      <Check className="w-4 h-4" />
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className={`px-4 py-3 ${m.type === "image" ? "p-1.5" : ""}`}>
                                  {m.type === "image" && m.image ? (
                                    <img
                                      src={m.image}
                                      alt="Encrypted Attachment"
                                      className="max-w-full sm:max-w-[300px] rounded-xl object-contain border border-white/10 bg-black/20"
                                    />
                                  ) : (
                                    <p className="text-sm font-sans break-all whitespace-pre-wrap leading-relaxed">
                                      {m.text}
                                    </p>
                                  )}
                                </div>
                              )}
                            </>
                          )}
                        </div>

                        {/* Timestamp & Meta Data */}
                        <div
                          className={`flex items-center gap-1.5 mt-1 shrink-0 ${
                            isMe ? "justify-end" : "justify-start pl-1"
                          }`}
                        >
                          <span className="text-[10px] text-slate-500 font-mono">
                            {new Date(m.timestamp).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                          {m.isEdited && !m.isDeleted && (
                            <span className="text-[10px] text-slate-400/70 italic font-sans">
                              (edited)
                            </span>
                          )}
                          {isMe && (
                            <span className="shrink-0 flex items-center">
                              <Check className="w-3 h-3 text-indigo-400/80" />
                              <Check className="w-3 h-3 text-indigo-400/80 -ml-1.5" />
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Templates Bar */}
      <div className="px-5 py-2 border-t border-white/10 bg-white/[0.01] overflow-x-auto whitespace-nowrap flex gap-1.5 scrollbar-none">
        <span className="text-[10px] text-slate-500 font-medium self-center mr-1 uppercase tracking-wider">
          Templates:
        </span>
        {[
          "Hey! 👋",
          "How's your day?",
          "Sure, let's chat!",
          "Got it, thanks!",
          "Meeting in 10 mins",
          "Awesome 🚀",
        ].map((p, idx) => (
          <button
            key={idx}
            onClick={() => insertQuickText(p)}
            className="px-2.5 py-1.5 bg-white/5 border border-white/10 hover:border-indigo-500/50 hover:bg-white/10 rounded-lg text-[10px] text-slate-300 hover:text-white transition-all cursor-pointer font-sans"
          >
            {p}
          </button>
        ))}
      </div>

      {/* Input Area */}
      <div className="p-4 sm:p-6 border-t border-white/10 bg-white/[0.01]">
        <form
          onSubmit={handleSend}
          className="max-w-4xl mx-auto flex items-center gap-2 sm:gap-4 bg-white/[0.03] border border-white/10 p-2 pl-4 rounded-2xl backdrop-blur-xl"
        >
          <input
            type="file"
            accept="image/*"
            className="hidden"
            ref={fileInputRef}
            onChange={handleImageUpload}
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-2 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-indigo-400 rounded-xl transition-colors cursor-pointer shrink-0"
            title="Send Secure Image"
          >
            <ImageIcon className="w-5 h-5" />
          </button>

          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={
              isGroupChat
                ? `Message ${selectedGroup?.name} (E2EE Fan-Out)...`
                : `Type an encrypted message...`
            }
            className="flex-1 bg-transparent border-none focus:outline-none text-sm text-slate-200 placeholder-slate-500 focus:ring-0 min-w-0"
          />

          <button
            type="submit"
            disabled={!inputText.trim()}
            className="p-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl shadow-lg hover:shadow-indigo-600/20 disabled:opacity-30 disabled:shadow-none hover:scale-102 transition-all transform active:scale-95 cursor-pointer shrink-0"
          >
            <Send className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </form>
      </div>

      {/* CUSTOM RIGHT CLICK MENU */}
      {contextMenu && (
        <div
          className="fixed bg-zinc-800 border border-white/10 shadow-2xl rounded-xl overflow-hidden z-50 flex flex-col py-1 min-w-[170px] backdrop-blur-xl"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <button
            onClick={() => {
              setForwardingMsg(contextMenu.msg);
              setContextMenu(null);
            }}
            className="px-4 py-2.5 text-xs text-left text-slate-200 hover:bg-indigo-500/20 hover:text-indigo-300 flex items-center gap-2 cursor-pointer transition-colors"
          >
            <Forward className="w-3.5 h-3.5" /> Forward Message
          </button>

          {contextMenu.canModify && contextMenu.msg.type === "text" && (
            <button
              onClick={() => {
                setEditingMsg(contextMenu.msg.id);
                setEditVal(contextMenu.msg.text || "");
                setContextMenu(null);
              }}
              className="px-4 py-2.5 text-xs text-left text-slate-200 hover:bg-indigo-500/20 hover:text-indigo-300 flex items-center gap-2 cursor-pointer transition-colors"
            >
              <Edit2 className="w-3.5 h-3.5" /> Edit Message
            </button>
          )}

          {contextMenu.canModify && (
            <button
              onClick={() => {
                handleDelete(contextMenu.msg.id);
                setContextMenu(null);
              }}
              className="px-4 py-2.5 text-xs text-left text-slate-200 hover:bg-rose-500/20 hover:text-rose-400 flex items-center gap-2 cursor-pointer transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete for Everyone
            </button>
          )}
        </div>
      )}

      {/* FORWARD MESSAGE MODAL */}
      <ForwardMessageModal
        message={forwardingMsg}
        onClose={() => setForwardingMsg(null)}
        users={allUsers}
      />
    </div>
  );
};