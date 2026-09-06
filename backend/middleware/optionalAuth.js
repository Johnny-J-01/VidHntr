import { supabase } from "../db/client.js";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

const GUEST_COOKIE = "clipforge_guest";
const guestSecret = process.env.GUEST_ID_SECRET || process.env.SUPABASE_SECRET_KEY;

function signGuestId(id) {
	return createHmac("sha256", guestSecret).update(id).digest("base64url");
}

function readGuestId(request) {
	const value = (request.get("cookie") || "").split(";").map((part) => part.trim().split("=")).find(([name]) => name === GUEST_COOKIE)?.[1];
	if (!value) return null;

	const [id, signature] = value.split(".");
	if (!id || !signature || !/^[0-9a-f-]{36}$/i.test(id)) return null;

	const expected = Buffer.from(signGuestId(id));
	const received = Buffer.from(signature);
	return expected.length === received.length && timingSafeEqual(expected, received) ? id : null;
}

function ensureGuest(request, response) {
	const existing = readGuestId(request);
	if (existing) return existing;

	const id = randomUUID();
	response.cookie(GUEST_COOKIE, `${id}.${signGuestId(id)}`, {
		httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
		maxAge: 365 * 24 * 60 * 60 * 1000, path: "/api",
	});
	return id;
}

export async function optionalAuth(request, response, next) {
	request.user = null;
	request.guestId = null;

	const authorization = request.get("authorization");

	if (!authorization) {
		request.guestId = ensureGuest(request, response);
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
