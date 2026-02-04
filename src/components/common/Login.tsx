import React, { useMemo, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";

function normalizeUsername(input: string) {
    return input.trim().toLowerCase();
}

const Login: React.FC = () => {
    const { login } = useAuth();
    const [usernameInput, setUsernameInput] = useState("");
    const [password, setPassword] = useState("");

    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const usernameLower = useMemo(() => normalizeUsername(usernameInput), [usernameInput]);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError("");

        try {
            await login({ username: usernameLower, password });
        } catch (err) {
            setError(String((err as any)?.message || err || "Login failed"));
        } finally {
            setLoading(false);
        }
    };

    const canSubmit = !loading && usernameLower.length > 0 && password.length > 0;

    return (
        <div className="max-w-sm mx-auto rounded-lg p-6">
            <h2 className="text-2xl font-semibold mb-4 text-center text-blue-500">Login</h2>

            <form onSubmit={handleLogin} className="space-y-4">
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
                            if (usernameInput !== usernameLower) setUsernameInput(usernameLower);
                        }}
                        placeholder="chandler"
                        autoComplete="username"
                        required
                        className="w-full p-3 border border-gray-300 rounded text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    {!!usernameInput && usernameInput !== usernameLower && (
                        <p className="text-gray-500 text-xs mt-1">
                            Using: <span className="font-mono">{usernameLower}</span>
                        </p>
                    )}
                </div>

                <div>
                    <label htmlFor="password" className="block text-blue-500 font-medium">
                        Password
                    </label>
                    <input
                        type="password"
                        id="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter your password"
                        autoComplete="current-password"
                        required
                        className="w-full p-3 border border-gray-300 rounded text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>

                {error && <p className="text-red-500 text-sm mt-2">{error}</p>}

                <button
                    type="submit"
                    disabled={!canSubmit}
                    className={`w-full py-3 bg-blue-500 text-white font-semibold rounded hover:bg-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-300 ${
                        !canSubmit ? "opacity-50 cursor-not-allowed" : ""
                    }`}
                >
                    {loading ? "Logging in..." : "Login"}
                </button>
            </form>
        </div>
    );
};

export default Login;
