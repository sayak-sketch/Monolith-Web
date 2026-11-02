/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { User, Group, Message } from "../types";
import { useE2EE } from "../contexts/E2EEContext";
import {
  Search,
  LogOut,
  Radio,
  UserX,
  MessageSquareCode,
  Users,
  Plus,
} from "lucide-react";
import { CreateGroupModal } from "./CreateGroupModal";

interface SidebarProps {
  currentUser: { id: string; name: string; phone: string; image?: string };
  users: User[];
  selectedUser: User | null;
  onSelectUser: (user: User | null) => void;
  selectedGroup?: Group | null;
  onSelectGroup?: (group: Group | null) => void;
  onLogout: () => void;
  messages: Message[]; // Flat array of all messages from all threads
  connectionStatus: "connected" | "disconnected" | "connecting";
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentUser,
  users,
  selectedUser,
  onSelectUser,
  selectedGroup = null,
  onSelectGroup,
  onLogout,
  messages,
  connectionStatus,
}) => {
  const { groups, messages: contextMessagesMap } = useE2EE();
  const [searchTerm, setSearchTerm] = useState("");
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);

  // Rehydrate the current user's full profile from local storage
  const cachedProfileRaw = localStorage.getItem("chat_current_user_profile");
  const cachedProfile = cachedProfileRaw ? JSON.parse(cachedProfileRaw) : null;
  const displayUser = {
    ...currentUser,
    name: cachedProfile?.name || currentUser.name,
    image: cachedProfile?.image || currentUser.image,
  };

  // Filter out current user from the list and apply search filter
  const otherUsers = users.filter((u) => u.phone !== currentUser.phone);
  const filteredUsers = otherUsers.filter((u) => {
    const match = searchTerm.toLowerCase();
    return (
      u.name.toLowerCase().includes(match) || u.phone.includes(match)
    );
  });

  // Filter groups by search term
  const filteredGroups = groups.filter((g) =>
    g.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Helper to find the last message between currentUser and a 1-on-1 contact
  const getLastMessage = (contactPhone: string) => {
    const directThread = contextMessagesMap[contactPhone];
    if (directThread && directThread.length > 0) {
      return directThread[directThread.length - 1];
    }

    const threadMessages = messages.filter(
      (m) =>
        !m.groupId &&
        ((m.isMine && m.receiver === contactPhone) ||
          (!m.isMine && m.sender === contactPhone))
    );
    if (threadMessages.length === 0) return null;
    return threadMessages[threadMessages.length - 1];
  };

  // Helper to find the last message in a Group chat
  const getLastGroupMessage = (groupId: string) => {
    const groupThread = contextMessagesMap[groupId];
    if (groupThread && groupThread.length > 0) {
      return groupThread[groupThread.length - 1];
    }
    return null;
  };

  const onlineCount = otherUsers.filter((u) => u.online).length;

  return (
    <div
      className="w-full md:w-80 h-full flex flex-col bg-white/[0.03] border-r border-white/10 backdrop-blur-2xl shrink-0"
      id="sidebar"
    >
      {/* Current User Header */}
      <div
        className="p-6 border-b border-white/10 flex items-center justify-between"
        id="sidebar-header"
      >
        <div className="flex items-center gap-3">
          <div className="relative">
            <img
              src={
                displayUser.image ||
                `https://api.dicebear.com/7.x/bottts/svg?seed=${displayUser.phone}`
              }
              alt={displayUser.name}
              className="w-10 h-10 rounded-xl object-cover border border-white/10 ring-2 ring-white/10"
              referrerPolicy="no-referrer"
            />
            <div
              className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-zinc-950 ${
                connectionStatus === "connected"
                  ? "bg-emerald-500 animate-pulse"
                  : connectionStatus === "connecting"
                  ? "bg-amber-500"
                  : "bg-rose-500"
              }`}
              title={`Network: ${connectionStatus}`}
            />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-white font-sans max-w-[130px] truncate">
              {displayUser.name}
            </span>
            <span className="text-[10px] text-emerald-400 font-medium uppercase tracking-wider font-sans">
              Online
            </span>
          </div>
        </div>

        {/* Action Button: Logout */}
        <button
          onClick={onLogout}
          className="p-2 text-slate-400 hover:text-rose-400 hover:bg-white/5 rounded-lg transition-colors cursor-pointer"
          title="Sign Out"
          id="btn-logout"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>

      {/* Connection Indicator Bar */}
      <div className="px-6 py-1.5 bg-white/[0.02] flex items-center justify-between text-[10px] border-b border-white/5">
        <div className="flex items-center gap-1 text-slate-400">
          <Radio className="w-3 h-3 text-indigo-400 animate-pulse" />
          <span>Status:</span>
          <span
            className={`font-semibold capitalize ${
              connectionStatus === "connected"
                ? "text-emerald-400"
                : connectionStatus === "connecting"
                ? "text-amber-400"
                : "text-rose-400"
            }`}
          >
            {connectionStatus}
          </span>
        </div>
        <span className="text-slate-500 font-mono">{onlineCount} online</span>
      </div>

      {/* Search Bar + New Group Button */}
      <div className="p-4 flex items-center gap-2" id="sidebar-search">
        <div className="relative flex-1">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500 pointer-events-none">
            <Search className="w-4 h-4" />
          </span>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search contacts or groups..."
            className="w-full bg-white/5 border border-white/10 hover:border-white/20 focus:border-indigo-500/50 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none transition-colors"
          />
        </div>
        <button
          onClick={() => setIsGroupModalOpen(true)}
          className="p-2 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 text-indigo-300 rounded-xl transition-all cursor-pointer shrink-0 flex items-center gap-1 text-xs font-medium"
          title="Create Encrypted Group"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Groups & Contacts List */}
      <div
        className="flex-1 overflow-y-auto divide-y divide-white/[0.02] px-3"
        id="contacts-list"
      >
        {/* GROUPS SECTION */}
        {filteredGroups.length > 0 && (
          <div className="mb-3">
            <div className="px-3 py-2 text-[10px] uppercase tracking-widest text-indigo-400 font-bold flex items-center justify-between">
              <span>Encrypted Groups</span>
              <span className="font-mono text-[9px] bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/20">
                {filteredGroups.length}
              </span>
            </div>

            {filteredGroups.map((group) => {
              const isSelected = selectedGroup?.id === group.id;
              const lastMsg = getLastGroupMessage(group.id);

              return (
                <button
                  key={group.id}
                  onClick={() => {
                    onSelectUser(null);
                    onSelectGroup?.(group);
                  }}
                  className={`w-full flex items-center gap-3 p-3 my-1 rounded-2xl cursor-pointer text-left border transition-all ${
                    isSelected
                      ? "bg-indigo-500/20 border-indigo-500/30 text-white shadow-[0_4px_20px_rgba(99,102,241,0.08)]"
                      : "border-transparent hover:bg-white/5 text-slate-300 hover:text-white"
                  }`}
                >
                  <div className="relative shrink-0">
                    <img
                      src={
                        group.image ||
                        `https://api.dicebear.com/7.x/identicon/svg?seed=${group.id}`
                      }
                      alt={group.name}
                      className="w-11 h-11 rounded-xl object-cover border border-white/10 bg-zinc-900"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute -bottom-1 -right-1 px-1 py-0.2 rounded bg-indigo-600 text-[8px] font-bold text-white border border-[#050608] flex items-center">
                      <Users className="w-2.5 h-2.5" />
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline mb-0.5">
                      <span className="text-xs font-semibold font-sans truncate">
                        {group.name}
                      </span>
                      {lastMsg && (
                        <span className="text-[10px] text-slate-500 font-mono">
                          {new Date(lastMsg.timestamp).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      )}
                    </div>

                    <p className="text-[10px] text-indigo-400/80 font-mono truncate mb-1">
                      {group.members.length} members
                    </p>

                    <p className="text-xs text-slate-400 truncate font-sans">
                      {lastMsg ? (
                        <span className="flex items-center gap-1">
                          <span className="text-slate-500 shrink-0 font-medium">
                            {lastMsg.isMine
                              ? "You:"
                              : `${lastMsg.senderName || lastMsg.sender}:`}
                          </span>
                          <span className="truncate">
                            {lastMsg.type === "image"
                              ? "📷 Encrypted Image"
                              : lastMsg.text}
                          </span>
                        </span>
                      ) : (
                        <span className="text-slate-500 italic text-[11px]">
                          Tap to start group chat
                        </span>
                      )}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* DIRECT MESSAGES SECTION */}
        <div className="px-3 py-2 text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2">
          Direct Messages
        </div>

        {filteredUsers.length === 0 ? (
          <div className="p-8 text-center flex flex-col items-center justify-center gap-3">
            <UserX className="w-8 h-8 text-slate-600" />
            <p className="text-xs text-slate-500 font-sans">
              {users.length <= 1
                ? "Waiting for other users to connect..."
                : "No matching contacts found"}
            </p>
          </div>
        ) : (
          filteredUsers.map((user) => {
            const isSelected = !selectedGroup && selectedUser?.phone === user.phone;
            const lastMsg = getLastMessage(user.phone);

            return (
              <button
                key={user.id}
                onClick={() => {
                  onSelectGroup?.(null);
                  onSelectUser(user);
                }}
                className={`w-full flex items-center gap-3 p-3 my-1 rounded-2xl cursor-pointer text-left border transition-all ${
                  isSelected
                    ? "bg-indigo-500/20 border-indigo-500/30 text-white shadow-[0_4px_20px_rgba(99,102,241,0.08)]"
                    : "border-transparent hover:bg-white/5 text-slate-300 hover:text-white"
                }`}
                id={`contact-${user.phone}`}
              >
                {/* Contact Avatar & Online Badge */}
                <div className="relative shrink-0">
                  <img
                    src={
                      user.image ||
                      `https://api.dicebear.com/7.x/bottts/svg?seed=${user.phone}`
                    }
                    alt={user.name}
                    className="w-11 h-11 rounded-xl object-cover border border-white/1 ring-1 ring-white/10"
                    referrerPolicy="no-referrer"
                  />
                  <div
                    className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#050608] ${
                      user.online ? "bg-emerald-500" : "bg-zinc-600"
                    }`}
                  />
                </div>

                {/* Info and Last Message Preview */}
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-baseline mb-0.5">
                    <span className="text-xs font-semibold font-sans truncate">
                      {user.name}
                    </span>
                    {lastMsg && (
                      <span className="text-[10px] text-slate-500 font-mono">
                        {new Date(lastMsg.timestamp).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    )}
                  </div>

                  <p className="text-[10px] text-slate-400 font-mono truncate mb-1">
                    {user.phone}
                  </p>

                  <p className="text-xs text-slate-400 truncate font-sans">
                    {lastMsg ? (
                      <span className="flex items-center gap-1">
                        {lastMsg.isMine && (
                          <span className="text-slate-500 shrink-0 font-medium">
                            You:
                          </span>
                        )}
                        <span className="truncate">
                          {lastMsg.type === "image"
                            ? "📷 Encrypted Image"
                            : lastMsg.text}
                        </span>
                      </span>
                    ) : (
                      <span className="text-slate-500 italic text-[11px]">
                        No messages yet
                      </span>
                    )}
                  </p>
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Extra Branding Foot */}
      <div className="p-4 border-t border-white/10 bg-white/[0.01] flex items-center justify-between text-[10px] text-slate-500">
        <span className="flex items-center gap-1">
          <MessageSquareCode className="w-3.5 h-3.5 text-slate-600" />
          <span>Monolith E2EE</span>
        </span>
        <span className="font-mono">v2.0</span>
      </div>

      {/* Create Group Modal */}
      <CreateGroupModal
        isOpen={isGroupModalOpen}
        onClose={() => setIsGroupModalOpen(false)}
        users={otherUsers}
        onGroupCreated={(newGrp) => {
          onSelectUser(null);
          onSelectGroup?.(newGrp);
        }}
      />
    </div>
  );
};