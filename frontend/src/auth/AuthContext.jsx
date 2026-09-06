import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../services/supabase.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
	const [session, setSession] = useState(null);
	const [loading, setLoading] = useState(Boolean(supabase));

	useEffect(() => {
		if (!supabase) {
			setLoading(false);
			return undefined;
		}

		let mounted = true;

		supabase.auth.getSession().then(({ data, error }) => {
			if (!mounted) return;

			if (error) {
				console.error("Failed to restore Supabase session:", error);
				setSession(null);
			} else {
				setSession(data.session);
			}

			setLoading(false);
		});

		const {
			data: { subscription },
		} = supabase.auth.onAuthStateChange((_event, nextSession) => {
			setSession(nextSession);
		});

		return () => {
			mounted = false;
			subscription.unsubscribe();
		};
	}, []);

	const signUp = async (email, password) => {
		if (!supabase) {
			return {
				data: null,
				error: new Error("Supabase is not configured."),
			};
		}

		return supabase.auth.signUp({
			email,
			password,
		});
	};

	const signIn = async (email, password) => {
		if (!supabase) {
			return {
				data: null,
				error: new Error("Supabase is not configured."),
			};
		}

		return supabase.auth.signInWithPassword({
			email,
			password,
		});
	};

	const signOut = async () => {
		if (!supabase) {
			return {
				error: new Error("Supabase is not configured."),
			};
		}

		return supabase.auth.signOut();
	};

	return (
		<AuthContext.Provider
			value={{
				session,
				user: session?.user ?? null,
				loading,
				supabase,
				signUp,
				signIn,
				signOut,
			}}
		>
			{children}
		</AuthContext.Provider>
	);
}

export function useAuth() {
	const context = useContext(AuthContext);

	if (!context) {
		throw new Error("useAuth must be used within an AuthProvider.");
	}

	return context;
}
