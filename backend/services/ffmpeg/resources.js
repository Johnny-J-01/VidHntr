import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import { performance } from "node:perf_hooks";

const SAMPLE_INTERVAL_MS = 500;
let clockTicksPromise;
async function clockTicksPerSecond() {
	clockTicksPromise ||= promisify(execFile)("getconf", ["CLK_TCK"], {
		timeout: 2000,
		windowsHide: true,
	}).then(({ stdout }) => Number(stdout.trim()) || null).catch(() => null);
	return clockTicksPromise;
}

function cpuSnapshot() {
	let idle = 0;
	let total = 0;
	for (const cpu of os.cpus()) {
		for (const [name, value] of Object.entries(cpu.times)) {
			total += value;
			if (name === "idle") idle += value;
		}
	}
	return { idle, total };
}

function cpuPercent(start, end) {
	const total = end.total - start.total;
	if (!(total > 0)) return null;
	return Math.max(0, (1 - (end.idle - start.idle) / total) * 100);
}

function rounded(value) {
	return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}

async function readProcessSample(pid) {
	if (process.platform === "win32" || !pid) return null;
	try {
		const [stat, status, clockTicks] = await Promise.all([
			fs.readFile(`/proc/${pid}/stat`, "utf8"),
			fs.readFile(`/proc/${pid}/status`, "utf8"),
			clockTicksPerSecond(),
		]);
		if (!(clockTicks > 0)) return null;
		const fields = stat.slice(stat.lastIndexOf(")") + 1).trim().split(/\s+/);
		const ticks = Number(fields[11]) + Number(fields[12]);
		const rssMatch = status.match(/^VmRSS:\s+(\d+)\s+kB$/m);
		return {
			at: performance.now(),
			cpuSeconds: ticks / clockTicks,
			rssBytes: rssMatch ? Number(rssMatch[1]) * 1024 : null,
		};
	} catch {
		return null;
	}
}

export function createResourceMonitor() {
	let timer = null;
	let pendingSample = null;
	let stopped = false;
	let pid = null;
	let previousHostCpu = cpuSnapshot();
	let previousProcess = null;
	let firstProcess = null;
	let lastProcess = null;
	const hostCpuSamples = [];
	const processCpuSamples = [];
	let minimumHostFreeMemoryBytes = os.freemem();
	let peakProcessRssBytes = null;
	let processSamples = 0;

	function sample() {
		if (pendingSample) return pendingSample;
		if (stopped) return Promise.resolve();
		pendingSample = collectSample().finally(() => { pendingSample = null; });
		return pendingSample;
	}

	async function collectSample() {
		const nextHostCpu = cpuSnapshot();
		const hostPercent = cpuPercent(previousHostCpu, nextHostCpu);
		if (hostPercent !== null) hostCpuSamples.push(hostPercent);
		previousHostCpu = nextHostCpu;
		minimumHostFreeMemoryBytes = Math.min(minimumHostFreeMemoryBytes, os.freemem());

		const processSample = await readProcessSample(pid);
		if (!processSample) return;
		processSamples += 1;
		if (!firstProcess) firstProcess = processSample;
		if (previousProcess && processSample.at > previousProcess.at) {
			const percent = (processSample.cpuSeconds - previousProcess.cpuSeconds) /
				((processSample.at - previousProcess.at) / 1000) * 100;
			if (percent >= 0) processCpuSamples.push(percent);
		}
		if (processSample.rssBytes !== null) {
			peakProcessRssBytes = Math.max(peakProcessRssBytes || 0, processSample.rssBytes);
		}
		previousProcess = processSample;
		lastProcess = processSample;
	}

	return {
		attach(childProcess) {
			pid = childProcess?.pid || null;
			void sample();
		},
		start() {
			if (timer) return;
			timer = setInterval(() => { void sample(); }, SAMPLE_INTERVAL_MS);
			void sample();
		},
		async stop() {
			if (stopped) return this.snapshot();
			stopped = true;
			if (timer) clearInterval(timer);
			timer = null;
			await pendingSample;
			await collectSample();
			return this.snapshot();
		},
		snapshot() {
			const processAverage = firstProcess && lastProcess && lastProcess.at > firstProcess.at
				? (lastProcess.cpuSeconds - firstProcess.cpuSeconds) /
					((lastProcess.at - firstProcess.at) / 1000) * 100
				: null;
			return {
				sampleIntervalMs: SAMPLE_INTERVAL_MS,
				hostCpuPercentAverage: hostCpuSamples.length
					? rounded(hostCpuSamples.reduce((sum, value) => sum + value, 0) / hostCpuSamples.length)
					: null,
				hostCpuPercentMax: hostCpuSamples.length ? rounded(Math.max(...hostCpuSamples)) : null,
				minimumHostFreeMemoryBytes,
				processCpuPercentAverage: rounded(processAverage),
				processCpuPercentMax: processCpuSamples.length ? rounded(Math.max(...processCpuSamples)) : null,
				peakProcessRssBytes,
				processSampleCount: processSamples,
				processMetricsAvailable: processSamples > 0,
				note: "Host metrics include unrelated activity. Process metrics use Linux /proc when available; Windows process metrics are not collected.",
			};
		},
	};
}
