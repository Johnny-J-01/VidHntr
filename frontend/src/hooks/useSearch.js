export function useSearch() {
	return {
		results: [],
		loading: false,
		error: null,
		lastQuery: "",
		search: async () => {},
		searchMood: async () => {},
		reset: () => {},
	};
}