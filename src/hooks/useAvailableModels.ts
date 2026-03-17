import { useEffect, useState } from "react";
import type { Model } from "../../shared/models.js";
import { models } from "../../shared/models.js";
import { fetchJson, getApiBase } from "../utils/utils.ts";

type ModelCatalogResponse = {
  models?: Model[];
};

const fallbackModels = models;

export function useAvailableModels() {
  const [availableModels, setAvailableModels] = useState<Model[]>(fallbackModels);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        const api = getApiBase();
        const result = await fetchJson<ModelCatalogResponse>(`${api}/api/models`);
        if (!cancelled && Array.isArray(result.models)) {
          setAvailableModels(result.models);
        }
      } catch (error) {
        console.error("Failed to load available models:", error);
      } finally {
        if (!cancelled) {
          setIsLoaded(true);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, []);

  return { availableModels, isLoaded };
}
