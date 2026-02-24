import { models } from "../../../../shared/models.js";
import React from "react";
import type { ModelDef, ReasoningEffortSetting } from "./HostControls.types.ts";

interface HostControlsAdvancedSectionProps {
  advancedOpen: boolean;
  setAdvancedOpen: React.Dispatch<React.SetStateAction<boolean>>;
  boardJson: string;
  boardJsonError: string | null;
  setBoardJsonError: (value: string | null) => void;
  tryValidateBoardJson: (raw: string) => string | null;
  selectedModel: string;
  visualMode: "off" | "commons" | "brave";
  reasoningEffort: ReasoningEffortSetting;
  canUsePremium: boolean;
  canUseBrave: boolean;
  isReasoningLevelLocked: (level: ReasoningEffortSetting) => boolean;
  setBoardJson: (value: string) => void;
  setSelectedModel: (value: string) => void;
  setVisualMode: (value: "off" | "commons" | "brave") => void;
  setReasoningEffort: (value: ReasoningEffortSetting) => void;
}

const HostControlsAdvancedSection: React.FC<HostControlsAdvancedSectionProps> = ({
  advancedOpen,
  setAdvancedOpen,
  boardJson,
  boardJsonError,
  setBoardJsonError,
  tryValidateBoardJson,
  selectedModel,
  visualMode,
  reasoningEffort,
  canUsePremium,
  canUseBrave,
  isReasoningLevelLocked,
  setBoardJson,
  setSelectedModel,
  setVisualMode,
  setReasoningEffort,
}) => {
  const selectedModelDef = models.find((m) => m.value === selectedModel);
  const modelSupportsReasoningEffort = selectedModelDef?.supportsReasoningEffort === true;
  const usingImportedBoard = boardJson.trim().length > 0;

  const groupedModels = models.reduce(
    (groups, model) => {
      if (!groups[model.price]) groups[model.price] = [];
      groups[model.price].push(model);
      return groups;
    },
    {} as Record<number, ModelDef[]>,
  );

  const checkCantUseModel = (model: ModelDef) => {
    if (model.price === 0) return false;
    return !canUsePremium;
  };

  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setBoardJson(text);
      setBoardJsonError(tryValidateBoardJson(text));
    } catch (err) {
      console.error("Clipboard paste failed:", err);
      setBoardJsonError(
        "Could not read clipboard (permission denied or insecure context). Try Ctrl+V.",
      );
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <button
        type="button"
        onClick={() => setAdvancedOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition"
        aria-expanded={advancedOpen}
      >
        <div className="flex flex-col items-start">
          <div className="text-gray-900 font-semibold">Advanced Settings</div>
          <div className="text-xs text-gray-500">Custom boards, model selection, visuals.</div>
        </div>

        <div
          className={`text-gray-500 transition-transform duration-200 ${
            advancedOpen ? "rotate-180" : ""
          }`}
        >
          <span>&#9660;</span>
        </div>
      </button>

      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-out ${
          advancedOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <div className="border-t border-gray-200 p-4">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <div className="lg:col-span-7">
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 h-full">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div>
                      <h3 className="text-gray-900 text-lg font-semibold">Custom Board JSON</h3>
                      <p className="text-sm text-gray-600 mt-1">
                        Paste a saved board JSON to skip AI generation.
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handlePasteFromClipboard}
                        className="px-3 py-1.5 rounded-md bg-white border border-gray-200 text-gray-800 hover:bg-gray-100"
                      >
                        Paste
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setBoardJson("");
                          setBoardJsonError(null);
                        }}
                        className="px-3 py-1.5 rounded-md bg-white border border-gray-200 text-gray-800 hover:bg-gray-100"
                      >
                        Clear
                      </button>
                    </div>
                  </div>

                  <textarea
                    value={boardJson}
                    onChange={(e) => {
                      const next = e.target.value;
                      setBoardJson(next);
                      setBoardJsonError(tryValidateBoardJson(next));
                    }}
                    className="w-full h-44 p-3 rounded-lg border border-gray-300 font-mono text-sm text-black bg-white"
                    placeholder="Paste board JSON here... (must include firstBoard, secondBoard, finalJeopardy)"
                  />

                  {boardJsonError && boardJson.trim().length > 0 && (
                    <div className="mt-2 text-sm text-red-600">{boardJsonError}</div>
                  )}
                </div>
              </div>

              <div className="lg:col-span-5">
                <div
                  className={`rounded-xl border border-gray-200 bg-gray-50 p-4 ${
                    usingImportedBoard ? "opacity-50 pointer-events-none" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                      <div className="text-gray-900 text-lg font-semibold">Model Settings</div>
                      <div className="text-sm text-gray-500">
                        Choose a model and optional features.
                      </div>
                    </div>
                  </div>

                  {usingImportedBoard && (
                    <div className="text-sm text-gray-600 mb-3">
                      Disabled because a pasted board will be used.
                    </div>
                  )}

                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-gray-800">Model Selection</label>
                    <select
                      value={selectedModel}
                      onChange={(e) => setSelectedModel(e.target.value)}
                      disabled={usingImportedBoard}
                      className="p-2 rounded-md border border-gray-300 text-black w-full bg-white cursor-pointer"
                    >
                      {Object.entries(groupedModels).map(([price, grouped]) => (
                        <optgroup
                          key={price}
                          label={price === "0" ? "Free Models" : "Premium Models"}
                        >
                          {grouped.map((model) => (
                            <option
                              key={model.value}
                              value={model.value}
                              disabled={checkCantUseModel(model)}
                            >
                              {model.label}
                              {model.price > 0 && !canUsePremium ? " (Locked)" : ""}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>

                  <div className="mt-4 pt-3 border-t border-gray-300">
                    <div className="text-sm font-medium text-gray-700 mb-2">Reasoning Effort</div>

                    <div className="h-12 flex items-start">
                      {modelSupportsReasoningEffort && !usingImportedBoard ? (
                        <div className="flex p-1 bg-gray-200 rounded-lg w-full gap-1">
                          {(["off", "low", "medium", "high"] as ReasoningEffortSetting[])
                            .filter((level) => !isReasoningLevelLocked(level))
                            .map((level) => (
                              <button
                                key={level}
                                type="button"
                                onClick={() => setReasoningEffort(level)}
                                className={`flex-1 py-1.5 text-[10px] font-medium rounded-md transition-all duration-200 flex flex-col items-center justify-center ${
                                  reasoningEffort === level
                                    ? "bg-white text-blue-600 shadow-sm"
                                    : "text-gray-500 hover:text-gray-700"
                                }`}
                              >
                                <span>{level.charAt(0).toUpperCase() + level.slice(1)}</span>
                              </button>
                            ))}
                        </div>
                      ) : (
                        <div className="w-full rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500">
                          Not available for this model.
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-1 flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="includeVisualsCommons"
                        checked={visualMode === "commons"}
                        onChange={(e) => setVisualMode(e.target.checked ? "commons" : "off")}
                        disabled={usingImportedBoard}
                        className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <label htmlFor="includeVisualsCommons" className="text-gray-700">
                        Enable Visual Clues (Wikimedia Commons)
                      </label>
                    </div>

                    {canUseBrave && (
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="includeVisualsBrave"
                          checked={visualMode === "brave"}
                          onChange={(e) => setVisualMode(e.target.checked ? "brave" : "off")}
                          disabled={usingImportedBoard}
                          className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                        />
                        <label htmlFor="includeVisualsBrave" className="text-gray-700">
                          Enable Visual Clues (Brave Image Search)
                        </label>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HostControlsAdvancedSection;
