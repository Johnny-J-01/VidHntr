import { useCallback, useState } from 'react';
import { api } from '../services/api.js';

export function useSearch(videoId) {
	const [results, setResults] = useState([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState(null);
	const [lastQuery, setLastQuery] = useState('');

	const search = useCallback(async (query) => {
		if (!videoId || !query?.trim()) return;
		setLoading(true);
		setError(null);
		setLastQuery(query);
		try {
			const data = await api.search(videoId, query.trim());
			setResults(data.results || []);
		} catch (e) {
			setError(e.message);
			setResults([]);
		} finally {
			setLoading(false);
		}
	}, [videoId]);

	const searchMood = useCallback(async (mood) => {
		if (!videoId) return;
		setLoading(true);
		setError(null);
		setLastQuery(mood);
		try {
			const data = await api.searchByMood(videoId, mood);
			setResults(data.results || []);
		} catch (e) {
			setError(e.message);
			setResults([]);
		} finally {
			setLoading(false);
		}
	}, [videoId]);

	const reset = useCallback(() => {
		setResults([]);
		setError(null);
		setLastQuery('');
	}, []);

	return { results, loading, error, lastQuery, search, searchMood, reset };
}
