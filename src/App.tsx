import { useState, useEffect } from "react";
import { ShieldCheck, Smartphone } from "lucide-react";
import { User, Group } from "./types";
import { useE2EE } from "./contexts/E2EEContext";
import { AuthPage } from "./components/AuthPage";
import { ChatWindow } from "./components/ChatWindow";
import { Sidebar } from "./components/Sidebar";
import { CallOverlay } from "./components/CallOverlay";

export default function App() {
  // 1. Hook into our Cryptographic & WebRTC Engine
  const {
    currentUserPhone,
    currentUserName,
    setCurrentUserName,
    isConnected,
    messages,
    backendUrl: contextBackendUrl,
  } = useE2EE();

  // 2. Local UI State
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [showDocOverlay, setShowDocOverlay] = useState(false);

  const backendUrl =
    import.meta.env.VITE_APP_URL ||
    contextBackendUrl ||
    "https://flask-server-pctp.onrender.com";

  // 3. Keep polling for active users & sync current user's display name
  useEffect(() => {
    if (!currentUserPhone) return;

    const fetchUsers = async () => {
      try {
        const res = await fetch(`${backendUrl}/users?phone=${currentUserPhone}`);
        const data = await res.json();
        if (Array.isArray(data)) {
          setUsers(data);
          const me = data.find((u: User) => u.phone === currentUserPhone);
          if (me?.name && me.name !== currentUserName) {
            setCurrentUserName(me.name);
          }
        }
      } catch (err) {
        console.warn("Could not fetch active users.", err);
      }
    };

    // Also check cached profile from login/signup
    const cachedProfileRaw = localStorage.getItem("chat_current_user_profile");
    if (cachedProfileRaw) {
      try {
        const parsed = JSON.parse(cachedProfileRaw);
        if (parsed?.name && parsed.name !== currentUserName) {
          setCurrentUserName(parsed.name);
        }
      } catch {}
    }

    fetchUsers();
    const pollInterval = setInterval(fetchUsers, 8000);
    return () => clearInterval(pollInterval);
  }, [currentUserPhone, backendUrl, currentUserName, setCurrentUserName]);

  const handleLogout = () => {
    localStorage.removeItem("chat_currentUserPhone");
    localStorage.removeItem("chat_currentUserName");
    window.location.reload();
  };

  // 4. Authentication Routing
  if (!currentUserPhone) {
    return <AuthPage />;
  }

  const currentUserObj = {
    id: currentUserPhone,
    name: currentUserName || currentUserPhone,
    phone: currentUserPhone,
  };

  const hasActiveChat = Boolean(selectedUser || selectedGroup);
  const otherUsers = users.filter((u) => u.phone !== currentUserPhone);

  // 5. Main UI Render
  return (
    <div
      className="relative h-screen w-screen bg-[#050608] flex flex-col overflow-hidden text-slate-100"
      id="main-app-container"
    >
      {/* Global Voice & Video Call Overlay */}
      <CallOverlay />

      {/* Background Effects */}
      <div className="absolute top-[-100px] right-[-100px] w-[400px] h-[400px] bg-indigo-600/20 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-50px] left-[200px] w-[300px] h-[300px] bg-emerald-500/10 rounded-full blur-[100px] pointer-events-none"></div>
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-30 pointer-events-none" />

      {/* Header */}
      <header className="h-14 backdrop-blur-md bg-white/[0.02] border-b border-white/10 px-6 flex items-center justify-between shrink-0 relative z-10">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-sm text-white shadow-[0_0_15px_rgba(99,102,241,0.3)]">
            💬
          </div>
          <span className="font-display font-medium tracking-tight text-white text-base">
            Monolith{" "}
            <span className="text-[10px] text-indigo-400 font-mono tracking-wide px-1.5 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 ml-1">
              Secure
            </span>
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div
            className={`text-[10px] font-mono px-2 py-1 rounded border ${
              isConnected
                ? "bg-green-500/10 text-green-400 border-green-500/20"
                : "bg-red-500/10 text-red-400 border-red-500/20"
            }`}
          >
            {isConnected ? "SOCKET LIVE" : "CONNECTING..."}
          </div>
          <button
            onClick={() => setShowDocOverlay(true)}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-indigo-300 text-xs font-mono transition-all cursor-pointer"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
            <span>Connection Guide</span>
          </button>
        </div>
      </header>

      {/* Main Layout */}
      <main className="flex-1 flex overflow-hidden relative z-0">
        {/* Sidebar */}
        <div className={`w-full md:w-auto md:flex h-full ${hasActiveChat ? "hidden" : "block"}`}>
          <Sidebar
            currentUser={currentUserObj}
            users={users}
            selectedUser={selectedUser}
            onSelectUser={setSelectedUser}
            selectedGroup={selectedGroup}
            onSelectGroup={setSelectedGroup}
            onLogout={handleLogout}
            messages={Object.values(messages).flat()}
            connectionStatus={isConnected ? "connected" : "disconnected"}
          />
        </div>

        {/* Chat Area */}
        <div className={`flex-1 h-full ${hasActiveChat ? "block" : "hidden md:block"}`}>
          {hasActiveChat ? (
            <ChatWindow
              selectedUser={selectedUser}
              selectedGroup={selectedGroup}
              allUsers={otherUsers}
              onBack={() => {
                setSelectedUser(null);
                setSelectedGroup(null);
              }}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-zinc-500 font-mono text-sm">
              Select a contact or encrypted group to initiate a secure channel.
            </div>
          )}
        </div>
      </main>

      {/* Documentation Modal */}
      {showDocOverlay && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-lg w-full p-6 relative shadow-2xl">
            <h2 className="text-lg font-bold text-white flex items-center gap-2 mb-3 font-sans">
              <ShieldCheck className="w-5 h-5 text-indigo-400" /> E2EE Architecture Active
            </h2>
            <div className="space-y-3.5 text-xs text-zinc-300 font-sans leading-relaxed">
              <p>
                Monolith utilizes the Double Ratchet Algorithm with Hybrid Post-Quantum X3DH (ML-KEM-768 + X25519) Key Agreement, Pairwise Fan-Out Group Encryption, and P2P WebRTC Calling.
              </p>
              <div className="flex items-start gap-2.5 bg-indigo-500/5 border border-indigo-500/20 p-3 rounded-xl">
                <Smartphone className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
                <p className="text-[11px] text-indigo-300 leading-normal">
                  <strong>Forward Secrecy Verified</strong>: Your cryptographic keys never leave this browser. The server at {backendUrl} only routes AES-256-GCM ciphertexts and blind WebRTC signaling.
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowDocOverlay(false)}
              className="mt-5 w-full py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-medium text-xs rounded-xl cursor-pointer transition-colors"
            >
              Dismiss Guide
            </button>
          </div>
        </div>
      )}
    </div>
  );
}