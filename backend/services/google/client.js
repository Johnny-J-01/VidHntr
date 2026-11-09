import { google } from "googleapis";
import { getAuthenticatedClient } from "./auth.js";

export const DRIVE_FOLDER_ID =
	"1bejfJiPJ-NvgCfjRkYwqoSwbutfv3Es2";

export function getDrive() {
	const auth = getAuthenticatedClient();

	if (!auth) {
		throw new Error(
			"Google Drive is not authorized.",
		);
	}

	return google.drive({
		version: "v3",
		auth,
	});
}
