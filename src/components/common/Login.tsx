import { useState } from "react";
import { supabase } from "../../supabaseClient";

const Login = () => {
    const [identifier, setIdentifier] = useState(""); // email OR username
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const handleLogin = async (e: { preventDefault: () => void }) => {
        e.preventDefault();
        setLoading(true);
        setError("");

        const id = identifier.trim();
        const pw = password.trim();

        if (!id || !pw) {
            setError("Please enter your email/username and password.");
            setLoading(false);
            return;
        }

        try {
            // 1) Resolve email (if identifier is already email, function returns it)
            const { data: email, error: rpcError } = await supabase.rpc(
                "login_email_for",
                { identifier: id }
            );

            if (rpcError) {
                setError("Login lookup failed. Please try again.");
                return;
            }

            if (!email) {
                setError("No account found for that email/username.");
                return;
            }

            // 2) Sign in with password using resolved email
            const { data, error: signInError } = await supabase.auth.signInWithPassword({
                email,
                password: pw,
            });

            if (signInError) {
                setError(signInError.message);
                return;
            }

            console.log("User logged in:", data.user);
        } catch (err) {
            console.error("Unexpected error:", err);
            setError("An unexpected error occurred. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-sm mx-auto rounded-lg p-6">
            <h2 className="text-2xl font-semibold mb-4 text-center text-blue-500">Login</h2>

            <form onSubmit={handleLogin} className="space-y-4">
                <div>
                    <label htmlFor="identifier" className="block text-blue-500 font-medium">
                        Email or Username
                    </label>
                    <input
                        type="text"
                        id="identifier"
                        value={identifier}
                        onChange={(e) => setIdentifier(e.target.value)}
                        placeholder="Enter your email or username"
                        autoComplete="username"
                        required
                        className="w-full p-3 border border-gray-300 rounded text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
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
                    disabled={loading}
                    className={`w-full py-3 bg-blue-500 text-white font-semibold rounded hover:bg-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-300 ${
                        loading ? "opacity-50 cursor-not-allowed" : ""
                    }`}
                >
                    {loading ? "Logging in..." : "Login"}
                </button>
            </form>
        </div>
    );
};

export default Login;
