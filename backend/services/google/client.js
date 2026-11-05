import { google } from "googleapis";
import { getAuthenticatedClient } from "./auth.js";

export const DRIVE_FOLDER_ID =
	"1KvDIRNFB4JQCZ4DmTBd77RZ3M2rwvNcD";

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
