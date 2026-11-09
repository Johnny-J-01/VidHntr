import { spawn } from "child_process";

import { getBypassArgs, resolveYtDlpPath } from "./config.js";

function fetchMetadata(url) {
	return new Promise((resolve, reject) => {
		const args = [
			url,
			...getBypassArgs(),
			"--dump-json",
			"--no-playlist",
			"--no-warnings",
		];

		const proc = spawn(resolveYtDlpPath(), args, { windowsHide: true });
		let stdout = "";
		let stderr = "";

		proc.stdout.on("data", (chunk) => {
			stdout += chunk.toString();
		});

		proc.stderr.on("data", (chunk) => {
			stderr += chunk.toString();
		});

		proc.on("error", (error) => {
			reject(error);
		});

		proc.on("close", (code) => {
			if (code !== 0) {
				reject(new Error(`Failed to fetch YouTube metadata.\n${stderr}`));
				return;
			}

			try {
				resolve(JSON.parse(stdout));
			} catch (error) {
				reject(new Error(`Could not parse YouTube metadata: ${error.message}`));
			}
		});
	});
}

export { fetchMetadata };
