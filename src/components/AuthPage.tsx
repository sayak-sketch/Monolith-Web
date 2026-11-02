/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from "react";
import { motion } from "motion/react";
import { Phone, Lock, User as UserIcon, Image as ImageIcon, MessageSquare, AlertCircle, Settings } from "lucide-react";
import { useE2EE } from "../contexts/E2EEContext";

export const AuthPage: React.FC = () => {
  const { registerAndUploadKeys, setCurrentUserPhone, backendUrl, setBackendUrl } = useE2EE();

  const [isLogin, setIsLogin] = useState(true);
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  
  // Stores the Base64 string of the uploaded image
  const [imageUrl, setImageUrl] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [showSettings, setShowSettings] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Handle device file upload and convert to Base64
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Optional: Check file size (e.g., limit to 2MB to avoid huge database payloads)
      if (file.size > 2 * 1024 * 1024) {
        setError("Image size must be less than 2MB");
        return;
      }
      
      const reader = new FileReader();
      reader.onloadend = () => {
        setImageUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!phone || !password) {
      setError("Please fill in all required fields.");
      return;
    }

    if (!isLogin && !name) {
      setError("Please enter your name to register.");
      return;
    }

    setLoading(true);

    try {
      const endpoint = isLogin ? "/login" : "/signup";
      const payload = isLogin
        ? { phone, password }
        : { phone, password, name, image: imageUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${phone}` };

      const response = await fetch(`${backendUrl}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status}`);
      }

      const data = await response.json();

      if (data.status) {
        await registerAndUploadKeys(phone);
        
        localStorage.setItem("chat_current_user_profile", JSON.stringify({
          name: data.name || name || phone,
          image: data.image || imageUrl
        }));

        setCurrentUserPhone(phone);
      } else {
        setError(data.message || "Authentication failed. Please verify your credentials.");
      }
    } catch (err: any) {
      console.error("Auth error:", err);
      setError(`Cannot reach server at ${backendUrl}. Check your configuration settings.`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-[#050608] px-4 overflow-hidden" id="auth-page">
      <div className="absolute top-[-100px] right-[-100px] w-[400px] h-[400px] bg-indigo-600/20 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-50px] left-[200px] w-[300px] h-[300px] bg-emerald-500/10 rounded-full blur-[100px] pointer-events-none"></div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative w-full max-w-md z-10"
      >
        <div className="mb-4 flex flex-col items-end">
          <button
            type="button"
            onClick={() => setShowSettings(!showSettings)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:border-indigo-500/50 hover:bg-white/10 text-xs text-slate-400 hover:text-white transition-all backdrop-blur-md cursor-pointer"
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Server Settings</span>
          </button>

          {showSettings && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="w-full mt-2 p-3 bg-white/[0.03] border border-white/10 rounded-xl backdrop-blur-xl shadow-xl flex flex-col gap-2"
            >
              <label className="text-xs font-semibold text-slate-300">Monolith Node Endpoint</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={backendUrl}
                  onChange={(e) => setBackendUrl(e.target.value)}
                  className="flex-1 bg-black/40 border border-white/10 hover:border-white/20 focus:border-indigo-500 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none transition-colors font-mono"
                />
                <button
                  type="button"
                  onClick={() => {
                    setBackendUrl("https://flask-server-pctp.onrender.com");
                    setShowSettings(false);
                  }}
                  className="px-2.5 py-1.5 bg-white/10 hover:bg-white/25 text-slate-300 hover:text-white rounded-lg text-xs transition-colors cursor-pointer"
                >
                  Reset
                </button>
              </div>
            </motion.div>
          )}
        </div>

        <div className="backdrop-blur-2xl bg-white/[0.03] border border-white/10 rounded-2xl p-8 shadow-2xl relative">
          <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent rounded-t-2xl" />

          <div className="flex flex-col items-center mb-8">
            <div className="w-12 h-12 bg-indigo-600/20 border border-indigo-500/30 rounded-xl flex items-center justify-center text-indigo-400 mb-3 shadow-[0_0_20px_rgba(99,102,241,0.15)]">
              <MessageSquare className="w-6 h-6 animate-pulse" />
            </div>
            <h1 className="text-2xl font-bold font-display tracking-tight text-white mb-1.5">
              {isLogin ? "Welcome Back" : "Monolith Setup"}
            </h1>
            <p className="text-xs text-slate-400 font-sans text-center">
              {isLogin ? "Sign in to connect securely" : "Zero-Knowledge E2EE Architecture"}
            </p>
          </div>

          <form onSubmit={handleAuthSubmit} className="space-y-4">
            {error && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 flex gap-2 text-rose-300 text-xs leading-relaxed"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </motion.div>
            )}

            {!isLogin && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 font-sans" htmlFor="signup-name">Display Name</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500">
                    <UserIcon className="w-4 h-4" />
                  </span>
                  <input
                    type="text"
                    id="signup-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Alex Mercer"
                    className="w-full bg-black/40 border border-white/10 hover:border-white/20 focus:border-indigo-500 rounded-xl pl-10 pr-4 py-3 text-sm text-white focus:outline-none transition-colors"
                  />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 font-sans" htmlFor="auth-phone">Phone Number</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500">
                  <Phone className="w-4 h-4" />
                </span>
                <input
                  type="tel"
                  id="auth-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Enter phone number"
                  className="w-full bg-black/40 border border-white/10 hover:border-white/20 focus:border-indigo-500 rounded-xl pl-10 pr-4 py-3 text-sm text-white focus:outline-none transition-colors font-mono"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 font-sans" htmlFor="auth-password">Password</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500">
                  <Lock className="w-4 h-4" />
                </span>
                <input
                  type="password"
                  id="auth-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-black/40 border border-white/10 hover:border-white/20 focus:border-indigo-500 rounded-xl pl-10 pr-4 py-3 text-sm text-white focus:outline-none transition-colors font-mono"
                />
              </div>
            </div>

            {/* --- NEW FILE UPLOAD SECTION --- */}
            {!isLogin && (
              <div className="space-y-2 pt-2 flex flex-col items-center">
                <label className="text-xs font-semibold text-slate-300 block font-sans w-full text-left">Profile Picture</label>
                
                {/* Hidden file input */}
                <input 
                  type="file" 
                  accept="image/*" 
                  className="hidden" 
                  ref={fileInputRef} 
                  onChange={handleFileUpload} 
                />
                
                {/* Clickable Avatar Preview */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="relative w-20 h-20 rounded-full border-2 border-dashed border-white/20 hover:border-indigo-500 hover:bg-white/5 flex items-center justify-center overflow-hidden transition-all group cursor-pointer"
                >
                  {imageUrl ? (
                    <img src={imageUrl} alt="Avatar preview" className="w-full h-full object-cover" />
                  ) : (
                    <div className="flex flex-col items-center text-slate-400 group-hover:text-indigo-400 transition-colors">
                      <ImageIcon className="w-6 h-6 mb-1" />
                      <span className="text-[10px]">Upload</span>
                    </div>
                  )}
                </button>
                
                {/* Remove Image Button */}
                {imageUrl && (
                  <button 
                    type="button" 
                    onClick={() => {
                      setImageUrl("");
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }} 
                    className="text-[10px] text-rose-400 hover:text-rose-300 hover:underline mt-1 cursor-pointer"
                  >
                    Remove Image
                  </button>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm rounded-xl cursor-pointer hover:shadow-[0_0_15px_rgba(99,102,241,0.3)] transition-all flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed mt-2"
            >
              {loading ? (
                <div className="flex gap-2 items-center">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Securing Session...</span>
                </div>
              ) : (
                <span>{isLogin ? "Sign In Securely" : "Register Now"}</span>
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => {
                setIsLogin(!isLogin);
                setError(null);
                setPhone("");
                setPassword("");
                setName("");
                setImageUrl("");
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
              className="text-xs text-indigo-400 hover:text-indigo-300 font-sans hover:underline focus:outline-none cursor-pointer"
            >
              {isLogin ? "Don't have an account? Sign Up" : "Already have an account? Log In"}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};