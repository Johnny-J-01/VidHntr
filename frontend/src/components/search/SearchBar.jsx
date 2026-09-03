import { useState } from "react";

export default function SearchBar({ onSearch, disabled }) {
	const [value, setValue] = useState("");

	function submit(e) {
		e.preventDefault();

		if (!value.trim() || disabled) return;

		onSearch(value.trim());
	}

	return (
		<form onSubmit={submit} className="relative w-full">
			<input
				value={value}
				onChange={(e) => setValue(e.target.value)}
				disabled={disabled}
				placeholder="What moment are you looking for?"
				className="cf-input w-full h-9 sm:h-10 pl-3 sm:pl-4 pr-10 sm:pr-11 text-xs sm:text-sm disabled:opacity-50"
			/>

			<button
				type="submit"
				disabled={disabled}
				aria-label="Search"
				className="absolute right-1 top-1 sm:right-1.5 sm:top-1.5 w-7 h-7 rounded-cf border border-cf-yellow/60 text-cf-yellow flex items-center justify-center hover:bg-cf-yellowDim transition disabled:opacity-40"
			>
				⌕
			</button>
		</form>
	);
}
