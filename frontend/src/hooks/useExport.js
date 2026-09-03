import { useCallback, useRef, useState } from 'react';
import { api } from '../services/api.js';

const TERMINAL = new Set(['READY', 'ERROR']);

export function useExport() {
  const [exportId, setExportId] = useState(null);
  const [status, setStatus] = useState(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const [filename, setFilename] = useState(null);
  const timer = useRef(null);

  const poll = useCallback((id) => {
    async function tick() {
      try {
        const data = await api.getExportStatus(id);

        setStatus(data.status);
        setProgress(data.progress ?? 0);
        setError(data.error || null);
        setFilename(data.filename || null);

        if (!TERMINAL.has(data.status)) {
          timer.current = setTimeout(tick, 1200);
        }
      } catch (e) {
        setError(e.message);
        timer.current = setTimeout(tick, 3000);
      }
    }

    tick();
  }, []);

  const startExport = useCallback(
    async (payload) => {
      setError(null);
      setStatus('QUEUED');
      setProgress(0);
      setFilename(null);
      setExportId(null);

      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }

      try {
        const data = await api.createExport(payload);

        setExportId(data.exportId);
        poll(data.exportId);
      } catch (e) {
        setError(e.message);
        setStatus('ERROR');
      }
    },
    [poll]
  );

  const resetExport = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }

    setExportId(null);
    setStatus(null);
    setProgress(0);
    setError(null);
    setFilename(null);
  }, []);

  const downloadUrl = exportId
    ? api.exportDownloadUrl(exportId)
    : null;

  return {
    startExport,
    resetExport,
    exportId,
    status,
    progress,
    error,
    downloadUrl,
    filename,
  };
}
