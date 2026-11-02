import React, { useState } from "react";
import { User, Group, Message } from "../types";
import { useE2EE } from "../contexts/E2EEContext";
import { X, Forward, Check, Users } from "lucide-react";

interface ForwardMessageModalProps {
  message: Message | null;
  onClose: () => void;
  users: User[];
}

export const ForwardMessageModal: React.FC<ForwardMessageModalProps> = ({
  message,
  onClose,
  users,
}) => {
  const { groups, forwardMessage } = useE2EE();
  const [selectedPhones, setSelectedPhones] = useState<string[]>([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [isSending, setIsSending] = useState(false);

  if (!message) return null;

  const togglePhone = (phone: string) => {
    setSelectedPhones((prev) =>
      prev.includes(phone) ? prev.filter((p) => p !== phone) : [...prev, phone]
    );
  };

  const toggleGroup = (groupId: string) => {
    setSelectedGroupIds((prev) =>
      prev.includes(groupId) ? prev.filter((id) => id !== groupId) : [...prev, groupId]
    );
  };

  const handleForward = async () => {
    if (selectedPhones.length === 0 && selectedGroupIds.length === 0) return;
    setIsSending(true);
    try {
      const targetGroups = groups.filter((g) => selectedGroupIds.includes(g.id));
      await forwardMessage(message, selectedPhones, targetGroups);
      onClose();
    } catch (err) {
      console.error("Failed to forward message:", err);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-white/10 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2 text-white font-semibold text-sm">
            <Forward className="w-4 h-4 text-indigo-400" />
            <span>Forward Encrypted Message</span>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Preview */}
          <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-xs text-slate-300 truncate">
            {message.type === "image" ? "📷 [Encrypted Image Attachment]" : message.text}
          </div>

          <div className="max-h-64 overflow-y-auto space-y-3 pr-1">
            {/* Groups Section */}
            {groups.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1.5">
                  Groups
                </p>
                <div className="space-y-1.5">
                  {groups.map((g) => {
                    const isSelected = selectedGroupIds.includes(g.id);
                    return (
                      <div
                        key={g.id}
                        onClick={() => toggleGroup(g.id)}
                        className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                          isSelected
                            ? "bg-indigo-600/20 border-indigo-500/40 text-white"
                            : "bg-white/[0.02] border-white/5 text-slate-300 hover:bg-white/5"
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center">
                            <Users className="w-4 h-4 text-indigo-400" />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-xs font-medium">{g.name}</span>
                            <span className="text-[10px] text-slate-500">{g.members.length} members</span>
                          </div>
                        </div>
                        <div
                          className={`w-5 h-5 rounded-md flex items-center justify-center border ${
                            isSelected ? "bg-indigo-600 border-indigo-500 text-white" : "border-white/20"
                          }`}
                        >
                          {isSelected && <Check className="w-3.5 h-3.5" />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Contacts Section */}
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1.5">
                Contacts
              </p>
              <div className="space-y-1.5">
                {users.map((u) => {
                  const isSelected = selectedPhones.includes(u.phone);
                  return (
                    <div
                      key={u.phone}
                      onClick={() => togglePhone(u.phone)}
                      className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                        isSelected
                          ? "bg-indigo-600/20 border-indigo-500/40 text-white"
                          : "bg-white/[0.02] border-white/5 text-slate-300 hover:bg-white/5"
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <img
                          src={u.image || `https://api.dicebear.com/7.x/bottts/svg?seed=${u.phone}`}
                          alt={u.name}
                          className="w-8 h-8 rounded-lg object-cover bg-zinc-800"
                        />
                        <div className="flex flex-col">
                          <span className="text-xs font-medium">{u.name}</span>
                          <span className="text-[10px] text-slate-500">{u.phone}</span>
                        </div>
                      </div>
                      <div
                        className={`w-5 h-5 rounded-md flex items-center justify-center border ${
                          isSelected ? "bg-indigo-600 border-indigo-500 text-white" : "border-white/20"
                        }`}
                      >
                        {isSelected && <Check className="w-3.5 h-3.5" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs text-slate-300 hover:bg-white/5 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleForward}
              disabled={(selectedPhones.length === 0 && selectedGroupIds.length === 0) || isSending}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40 flex items-center gap-1.5 cursor-pointer"
            >
              <Forward className="w-3.5 h-3.5" />
              <span>{isSending ? "Encrypting & Sending..." : "Forward"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};