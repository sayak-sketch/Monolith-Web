import React, { useState, useRef } from "react";
import { User, Group } from "../types";
import { useE2EE } from "../contexts/E2EEContext";
import { X, Users, Camera, Check } from "lucide-react";

interface CreateGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  users: User[];
  onGroupCreated?: (group: Group) => void;
}

export const CreateGroupModal: React.FC<CreateGroupModalProps> = ({
  isOpen,
  onClose,
  users,
  onGroupCreated,
}) => {
  const { createGroup } = useE2EE();
  const [groupName, setGroupName] = useState("");
  const [selectedPhones, setSelectedPhones] = useState<string[]>([]);
  const [groupImage, setGroupImage] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const toggleMember = (phone: string) => {
    setSelectedPhones((prev) =>
      prev.includes(phone) ? prev.filter((p) => p !== phone) : [...prev, phone]
    );
  };

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1.5 * 1024 * 1024) {
      alert("Group icon must be under 1.5MB");
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => setGroupImage(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim() || selectedPhones.length === 0) return;

    setIsSubmitting(true);
    try {
      const created = await createGroup(groupName.trim(), selectedPhones, groupImage);
      if (created) {
        onGroupCreated?.(created);
        setGroupName("");
        setSelectedPhones([]);
        setGroupImage("");
        onClose();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-white/10 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2 text-white font-semibold text-sm">
            <Users className="w-4 h-4 text-indigo-400" />
            <span>New Zero-Knowledge Group</span>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleCreate} className="p-4 space-y-4">
          {/* Group Icon & Name */}
          <div className="flex items-center gap-3">
            <input type="file" accept="image/*" ref={fileRef} className="hidden" onChange={handleAvatarUpload} />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 hover:border-indigo-500/50 flex items-center justify-center overflow-hidden shrink-0 cursor-pointer transition-all"
            >
              {groupImage ? (
                <img src={groupImage} alt="Group" className="w-full h-full object-cover" />
              ) : (
                <Camera className="w-5 h-5 text-slate-400" />
              )}
            </button>
            <input
              type="text"
              placeholder="Enter group name..."
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              required
            />
          </div>

          {/* Select Members */}
          <div>
            <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
              <span>Select Members ({selectedPhones.length} selected)</span>
              <span className="text-[10px] text-indigo-400">PQ-X3DH Pairwise Fan-Out</span>
            </div>
            <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
              {users.map((u) => {
                const isSelected = selectedPhones.includes(u.phone);
                return (
                  <div
                    key={u.phone}
                    onClick={() => toggleMember(u.phone)}
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

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs text-slate-300 hover:bg-white/5 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!groupName.trim() || selectedPhones.length === 0 || isSubmitting}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40 cursor-pointer"
            >
              {isSubmitting ? "Creating..." : "Create Group"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};