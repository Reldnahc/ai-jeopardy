import React, { useMemo, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";

function normalizeUsername(input: string) {
  return input.trim().toLowerCase();
}

function normalizeEmail(input: string) {
  const v = input.trim().toLowerCase();
  return v.length ? v : "";
}

function validateUsername(usernameLower: string): string | null {
  if (!usernameLower) return "Username is required.";
  if (usernameLower.length < 3 || usernameLower.length > 16) {
    return "Username must be 3–16 characters.";
  }
  if (!/^[a-z][a-z0-9_ ]*$/.test(usernameLower)) {
    return "Username must start with a letter and contain only letters, numbers, spaces, or underscores.";
  }
  if (/\s{2,}/.test(usernameLower)) {
    return "Username cannot contain consecutive spaces.";
  }
  return null;
}

function validatePassword(password: string): string | null {
  if (!password) return "Password is required.";
  if (password.length < 8) return "Password must be at least 8 characters.";
  return null;
}

const Signup: React.FC = () => {
  const { signup } = useAuth();

  const [email, setEmail] = useState("");
  const [usernameInput, setUsernameInput] = useState("");
  const [password, setPassword] = useState("");

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const usernameLower = useMemo(() => normalizeUsername(usernameInput), [usernameInput]);
  const usernameError = useMemo(() => validateUsername(usernameLower), [usernameLower]);
  const passwordError = useMemo(() => validatePassword(password), [password]);

  const canSubmit = !loading && !usernameError && !passwordError;

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const emailNorm = normalizeEmail(email);

      // IMPORTANT:
      // - username sent as lowercase (stored normalized)
      // - displayname NOT sent; backend will set displayname from the original username
      await signup({
        email: emailNorm.length ? emailNorm : null,
        username: usernameLower,
        password,
      });

      setSuccess("Account created!");
    } catch (err) {
      setError(String((err as any)?.message || err || "Signup failed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-sm mx-auto rounded-lg p-6">
      <h2 className="text-2xl font-semibold mb-4 text-center text-blue-500">Sign Up</h2>

      <form onSubmit={handleSignup} className="space-y-4">
        {/* Email (optional) */}
        <div>
          <label htmlFor="email" className="block text-blue-500 font-medium">
            Email <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <input
            type="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full p-3 border border-gray-300 text-black rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Username (always lowercase in DB) */}
        <div>
          <label htmlFor="username" className="block text-blue-500 font-medium">
            Username
          </label>
          <input
            type="text"
            id="username"
            value={usernameInput}
            onChange={(e) => setUsernameInput(e.target.value)}
            onBlur={() => {
              // Snap visible input to lowercase on blur so it's obvious what will be stored.
              if (usernameInput !== usernameLower) setUsernameInput(usernameLower);
            }}
            placeholder="username"
            required
            autoComplete="username"
            className={`w-full p-3 border rounded text-black focus:outline-none focus:ring-2 ${
              usernameError
                ? "border-red-500 focus:ring-red-500"
                : "border-gray-300 focus:ring-blue-500"
            }`}
          />
          {!!usernameInput && usernameInput !== usernameLower && (
            <p className="text-gray-500 text-xs mt-1">
              Will be saved as: <span className="font-mono">{usernameLower}</span>
            </p>
          )}
          {usernameError && <p className="text-red-500 text-sm mt-1">{usernameError}</p>}
        </div>

        {/* Password */}
        <div>
          <label htmlFor="password" className="block text-blue-500 font-medium">
            Password
          </label>
          <input
            type="password"
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            autoComplete="new-password"
            required
            className={`w-full p-3 border rounded text-black focus:outline-none focus:ring-2 ${
              passwordError
                ? "border-red-500 focus:ring-red-500"
                : "border-gray-300 focus:ring-blue-500"
            }`}
          />
          {passwordError && <p className="text-red-500 text-sm mt-1">{passwordError}</p>}
        </div>

        {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
        {success && <p className="text-green-500 text-sm mt-2">{success}</p>}

        <button
          type="submit"
          disabled={!canSubmit}
          className={`w-full py-3 bg-blue-500 text-white font-semibold rounded hover:bg-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-300 ${
            !canSubmit ? "opacity-50 cursor-not-allowed" : ""
          }`}
        >
          {loading ? "Signing up..." : "Sign Up"}
        </button>
      </form>
    </div>
  );
};

export default Signup;
