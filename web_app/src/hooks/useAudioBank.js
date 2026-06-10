// SPDX-License-Identifier: MIT
// Copyright (c) 2024 Victor Hogeweij
import { useState, useCallback } from 'react';

export function useAudioBank() {
  // bank: { [key]: { name: string, url: string (blob URL), data: ArrayBuffer } }
  const [bank, setBank] = useState({});

  // Reads file eagerly into ArrayBuffer so export never has to deal with File/Blob objects,
  // which JSZip can silently fail to include in the generated zip.
  const addFile = useCallback((key, file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = e.target.result;
      const url  = URL.createObjectURL(new Blob([data], { type: file.type }));
      setBank(prev => {
        if (prev[key]) URL.revokeObjectURL(prev[key].url);
        return { ...prev, [key]: { name: file.name, url, data } };
      });
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const removeFile = useCallback((key) => {
    setBank(prev => {
      if (prev[key]) URL.revokeObjectURL(prev[key].url);
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  // Returns entries for ZIP export: [{ key, name, data: ArrayBuffer }]
  const getExportEntries = useCallback(() =>
    Object.entries(bank).map(([key, { name, data }]) => ({ key, name, data })),
  [bank]);

  // Restore from import: entries = [{ key, name, data: ArrayBuffer }]
  const importEntries = useCallback((entries) => {
    setBank(prev => {
      Object.values(prev).forEach(e => URL.revokeObjectURL(e.url));
      return Object.fromEntries(
        entries.map(({ key, name, data }) => [
          key,
          { name, url: URL.createObjectURL(new Blob([data])), data },
        ])
      );
    });
  }, []);

  return { bank, addFile, removeFile, getExportEntries, importEntries };
}
