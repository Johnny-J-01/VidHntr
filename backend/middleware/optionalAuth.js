import { supabase } from "../db/client.js";

export async function optionalAuth(request, response, next) {
	request.user = null;

	const authorization = request.get("authorization");

	if (!authorization) {
		return next();
	}

	const match = authorization.match(/^Bearer\s+(.+)$/i);

	if (!match) {
		return response.status(401).json({ error: "Invalid authorization header." });
	}

	const { data, error } = await supabase.auth.getUser(match[1]);

	if (error || !data.user) {
		return response.status(401).json({ error: "Invalid or expired session." });
	}

	request.user = { id: data.user.id };
	return next();
}
