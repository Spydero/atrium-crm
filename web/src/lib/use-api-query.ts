"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";

type Result<T> = {
  path: string;
  revision: number;
  data: T | null;
  error: string;
};

export function useApiQuery<T>(path: string | null) {
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<Result<T> | null>(null);
  const refresh = useCallback(() => setRevision((n) => n + 1), []);

  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    api<T>(path, { signal: controller.signal }).then(
      (data) => {
        if (!controller.signal.aborted) setResult({ path, revision, data, error: "" });
      },
      (error) => {
        if (controller.signal.aborted) return;
        setResult((previous) => ({
          path,
          revision,
          data: previous?.path === path ? previous.data : null,
          error: error instanceof Error ? error.message : "Could not load data",
        }));
      },
    );
    return () => controller.abort();
  }, [path, revision]);

  const current = result?.path === path ? result : null;
  const loading = Boolean(path) && current?.revision !== revision;
  return {
    data: current?.data ?? null,
    error: loading ? "" : current?.error ?? "",
    loading,
    refresh,
  };
}
