import React, { useState, useMemo } from "react";
import { useAuth } from "../../contexts/AuthContext";

const AuthForm: React.FC = () => {
  const { login, signup } = useAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });

  // Normalize username: trim and lowercase
  const cleanUsername = useMemo(() => username.trim().toLowerCase(), [username]);

  const handleAction = async (action: "login" | "signup") => {
    if (!cleanUsername || password.length < 8) {
      setMessage({ type: "error", text: "Please enter a username and a password (min 8 chars)." });
      return;
    }

    setLoading(true);
    setMessage({ type: "", text: "" });

    try {
      if (action === "login") {
        await login({ username: cleanUsername, password });
      } else {
        // For signup, we send null for email as per your previous logic
        await signup({ username: cleanUsername, displayname: username, password, email: null });
        setMessage({ type: "success", text: "Account created successfully!" });
      }
    } catch (err: any) {
      setMessage({ type: "error", text: err?.message || `${action} failed.` });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-sm mx-auto bg-white rounded-lg p-6">
      <h2 className="text-2xl font-semibold mb-6 text-center text-blue-600">Welcome</h2>

      <div className="space-y-4">
        {/* Username */}
        <div>
          <label className="block text-blue-500 font-medium mb-1">Username</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="username"
            className="w-full p-3 border border-gray-300 rounded text-black focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>

        {/* Password */}
        <div>
          <label className="block text-blue-500 font-medium mb-1">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full p-3 border border-gray-300 rounded text-black focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>

        {/* Feedback Message */}
        {message.text && (
          <p className={`text-sm ${message.type === "error" ? "text-red-500" : "text-green-500"}`}>
            {message.text}
          </p>
        )}

        {/* Buttons */}
        <div className="grid grid-cols-2 gap-4 pt-2">
          <button
            onClick={() => handleAction("login")}
            disabled={loading}
            className="py-3 bg-blue-500 text-white font-semibold rounded hover:bg-blue-600 disabled:opacity-50 transition-colors"
          >
            {loading ? "..." : "Login"}
          </button>
          <button
            onClick={() => handleAction("signup")}
            disabled={loading}
            className="py-3 border-2 border-blue-500 text-blue-500 font-semibold rounded hover:bg-blue-50 disabled:opacity-50 transition-colors"
          >
            Sign Up
          </button>
        </div>
      </div>
    </div>
  );
};

export default AuthForm;
