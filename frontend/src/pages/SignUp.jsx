import { useState } from "react";
import { useAuth } from "../auth/AuthContext.jsx";

export default function SignUp() {
	const { signUp } = useAuth();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [error, setError] = useState("");
	const [message, setMessage] = useState("");
	const [loading, setLoading] = useState(false);

	const handleSubmit = async (event) => {
		event.preventDefault();
		setError("");
		setMessage("");

		if (!email.trim() || !password || !confirmPassword) {
			setError("Please fill in all fields.");
			return;
		}

		if (password.length < 6) {
			setError("Password must be at least 6 characters.");
			return;
		}

		if (password !== confirmPassword) {
			setError("Passwords do not match.");
			return;
		}

		setLoading(true);

		const { data, error: signUpError } = await signUp(
			email.trim(),
			password,
		);

		setLoading(false);

		if (signUpError) {
			setError(signUpError.message);
			return;
		}

		if (data?.session) {
			window.location.href = "/";
			return;
		}

		setMessage("Account created successfully. You can now sign in.");
	};

	return (
		<div className="min-h-screen bg-cf-bg text-cf-text flex items-center justify-center px-4">
			<div className="w-full max-w-md">
				<div className="mb-8 text-center">
					<button
						type="button"
						onClick={() => {
							window.location.href = "/";
						}}
						className="inline-flex items-center gap-2"
					>
						<span className="w-8 h-8 rounded-cf bg-cf-yellow flex items-center justify-center text-black">
							🎬
						</span>

						<span className="text-xl font-semibold tracking-tight">
							ClipFinder
						</span>
					</button>

					<h1 className="mt-8 text-2xl font-semibold">
						Create your account
					</h1>

					<p className="mt-2 text-sm text-cf-muted">
						Create an account to get started with ClipFinder.
					</p>
				</div>

				<form onSubmit={handleSubmit} className="cf-panel p-6">
					<div className="space-y-5">
						<div>
							<label
								htmlFor="email"
								className="mb-2 block text-sm font-medium"
							>
								Email
							</label>

							<input
								id="email"
								type="email"
								autoComplete="email"
								value={email}
								onChange={(event) =>
									setEmail(event.target.value)
								}
								placeholder="you@example.com"
								disabled={loading}
								className="cf-input w-full h-10 px-3 outline-none focus:border-cf-yellow"
							/>
						</div>

						<div>
							<label
								htmlFor="password"
								className="mb-2 block text-sm font-medium"
							>
								Password
							</label>

							<input
								id="password"
								type="password"
								autoComplete="new-password"
								value={password}
								onChange={(event) =>
									setPassword(event.target.value)
								}
								placeholder="At least 6 characters"
								disabled={loading}
								className="cf-input w-full h-10 px-3 outline-none focus:border-cf-yellow"
							/>
						</div>

						<div>
							<label
								htmlFor="confirmPassword"
								className="mb-2 block text-sm font-medium"
							>
								Confirm password
							</label>

							<input
								id="confirmPassword"
								type="password"
								autoComplete="new-password"
								value={confirmPassword}
								onChange={(event) =>
									setConfirmPassword(event.target.value)
								}
								placeholder="Enter your password again"
								disabled={loading}
								className="cf-input w-full h-10 px-3 outline-none focus:border-cf-yellow"
							/>
						</div>

						{error && (
							<div className="rounded-cf border border-red-900/60 bg-red-950/30 px-3 py-2.5 text-sm text-red-400">
								{error}
							</div>
						)}

						{message && (
							<div className="rounded-cf border border-cf-yellow/30 bg-cf-yellowDim px-3 py-2.5 text-sm text-cf-yellow">
								{message}
							</div>
						)}

						<button
							type="submit"
							disabled={loading}
							className="cf-btn-primary w-full h-10 text-sm disabled:cursor-not-allowed disabled:opacity-50"
						>
							{loading ? "Creating account..." : "Sign Up"}
						</button>
					</div>

					<div className="mt-6 text-center text-sm text-cf-muted">
						Already have an account?{" "}
						<button
							type="button"
							onClick={() => {
								window.location.href = "/signin";
							}}
							className="font-medium text-cf-yellow hover:underline"
						>
							Sign In
						</button>
					</div>

					<div className="mt-3 text-center">
						<button
							type="button"
							onClick={() => {
								window.location.href = "/";
							}}
							className="text-sm text-cf-muted hover:text-cf-text"
						>
							Continue as guest
						</button>
					</div>
				</form>
			</div>
		</div>
	);
}
