import fs from "fs";

export function buildFillFilter(width, height, verticalPosition = 0.42) {
	const targetAspect = width / height;
	const cropWidth = `if(gt(iw/ih\\,${targetAspect})\\,ih*${targetAspect}\\,iw)`;
	const cropHeight = `if(gt(iw/ih\\,${targetAspect})\\,ih\\,iw/${targetAspect})`;
	const cropX = `(iw-${cropWidth})/2`;
	const cropY = `(ih-${cropHeight})*${verticalPosition}`;

	return [
		`crop=w=${cropWidth}:h=${cropHeight}:x=${cropX}:y=${cropY}`,
		`scale=w=${width}:h=${height}:flags=bilinear`,
	];
}

export function escapeFilterPath(filePath) {
	return filePath
		.replace(/\\/g, "/")
		.replace(/:/g, "\\:")
		.replace(/'/g, "\\'");
}

export function buildCaptionFilter(captionsSrtPath, width, height) {
	if (!captionsSrtPath || !fs.existsSync(captionsSrtPath)) {
		return null;
	}

	try {
		const stats = fs.statSync(captionsSrtPath);
		if (stats.size === 0) {
			return null;
		}
	} catch {
		return null;
	}

	const escaped = escapeFilterPath(captionsSrtPath);
	const isVertical = height && width ? height > width : false;

	const forceStyle = isVertical
		? "FontName=Trebuchet MS,FontSize=14,Bold=1,PrimaryColour=&H0015CCFA,OutlineColour=&H00000000,BackColour=&H80000000,BorderStyle=1,Outline=3,Shadow=3,Alignment=2,MarginV=55"
		: "FontName=Trebuchet MS,FontSize=14,Bold=1,PrimaryColour=&H0015CCFA,OutlineColour=&H00000000,BackColour=&H80000000,BorderStyle=1,Outline=2.5,Shadow=2.5,Alignment=2,MarginV=30";

	return `subtitles='${escaped}':force_style='${forceStyle}'`;
}
