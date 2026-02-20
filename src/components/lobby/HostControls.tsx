import { models } from "../../../shared/models.js";
import { useProfile } from "../../contexts/ProfileContext.tsx";
import React from "react";
import type { LobbySettings } from "../../hooks/lobby/useLobbySocketSync.tsx";
import type { LadderRole, Role } from "../../../shared/roles.js";
import { atLeast, normalizeRole } from "../../../shared/roles.js";

type ReasoningEffortSetting = "off" | "low" | "medium" | "high";
type ModelDef = (typeof models)[number];

interface HostControlsProps {
  lobbySettings: LobbySettings | null;
  updateLobbySettings: (patch: Partial<LobbySettings>) => void;

  isSoloLobby: boolean;

  boardJsonError: string | null;
  setBoardJsonError: (value: string | null) => void;
  tryValidateBoardJson: (raw: string) => string | null;

  onCreateGame: () => void;
}

function asLadderRole(role: Role): LadderRole {
  // normalizeRole can return "banned"; atLeast() expects LadderRole
  return role === "banned" ? "default" : role;
}

function useRoleGate(rawRole: unknown) {
  const role = normalizeRole(rawRole); // Role ("default" | ... | "banned")
  const ladder = asLadderRole(role);

  return {
    role,
    ladder,
    atLeast: (min: LadderRole) => atLeast(ladder, min),
  };
}

const HostControls: React.FC<HostControlsProps> = ({
  lobbySettings,
  updateLobbySettings,
  boardJsonError,
  setBoardJsonError,
  tryValidateBoardJson,
  onCreateGame,
}) => {
  const { profile } = useProfile();
  const [advancedOpen, setAdvancedOpen] = React.useState(false);

  const gate = useRoleGate(profile?.role);

  const selectedModel = lobbySettings?.selectedModel ?? "gpt-5.2";
  const timeToBuzz = lobbySettings?.timeToBuzz ?? 10;
  const timeToAnswer = lobbySettings?.timeToAnswer ?? 10;
  const visualMode = lobbySettings?.visualMode ?? "off";
  const reasoningEffort = lobbySettings?.reasoningEffort ?? "off";
  const boardJson = lobbySettings?.boardJson ?? "";

  const onModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    updateLobbySettings({ selectedModel: e.target.value });
  };

  const setTimeToBuzz = (time: number) => {
    updateLobbySettings({ timeToBuzz: time });
  };

  const setTimeToAnswer = (time: number) => {
    updateLobbySettings({ timeToAnswer: time });
  };

  const setVisualMode = (value: "off" | "commons" | "brave") => {
    updateLobbySettings({ visualMode: value });
  };

  const setReasoningEffort = (value: ReasoningEffortSetting) => {
    updateLobbySettings({ reasoningEffort: value });
  };

  const setBoardJson = (value: string) => {
    updateLobbySettings({ boardJson: value });
  };

  const selectedModelDef = models.find((m) => m.value === selectedModel);
  const modelSupportsReasoningEffort = selectedModelDef?.supportsReasoningEffort === true;

  const usingImportedBoard = boardJson.trim().length > 0;

  const canUsePremium = gate.atLeast("privileged");
  const canUseBrave = gate.atLeast("privileged");

  const isReasoningLevelLocked = (level: ReasoningEffortSetting) => {
    if (level === "off" || level === "low") return false;
    return !gate.atLeast("privileged");
  };

  // Group the models by price
  const groupedModels = models.reduce(
    (groups, model) => {
      if (!groups[model.price]) groups[model.price] = [];
      groups[model.price].push(model);
      return groups;
    },
    {} as Record<number, ModelDef[]>,
  );

  function checkCantUseModel(model: ModelDef) {
    if (model.price === 0) return false;
    return !canUsePremium;
  }

  const handleTimeChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    updateTime: (time: number) => void,
  ) => {
    const value = parseInt(e.target.value);
    if (isNaN(value)) return;

    const clampedValue = Math.min(Math.max(value, 5), 60);
    updateTime(clampedValue);
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
    <div className="w-full">
      <div className="w-full rounded-xl border border-gray-200 bg-gray-50 p-4">
        <div className="flex flex-col gap-4">
          {/* Top Row */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Game Settings left */}
            <div className="lg:col-span-8">
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex items-center justify-between gap-2 mb-4">
                  <div>
                    <div className="text-gray-900 text-lg font-semibold">Game Settings</div>
                    <div className="text-sm text-gray-500">Timers for buzzing and answering.</div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                    <label className="block text-sm font-medium text-gray-800 mb-2">
                      Time to Buzz
                    </label>

                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="5"
                        max="60"
                        value={timeToBuzz === -1 ? "" : timeToBuzz}
                        onChange={(e) => handleTimeChange(e, setTimeToBuzz)}
                        disabled={timeToBuzz === -1}
                        placeholder="5-60"
                        className={`p-2 rounded-md border border-gray-300 text-black w-28 ${
                          timeToBuzz === -1 ? "bg-gray-100" : "bg-white"
                        }`}
                      />
                      <span className="text-gray-600 text-sm">seconds</span>
                    </div>

                    <div className="mt-2 text-xs text-gray-500">
                      How long contestants have to buzz in.
                    </div>
                  </div>

                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                    <label className="block text-sm font-medium text-gray-800 mb-2">
                      Time to Answer
                    </label>

                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="5"
                        max="60"
                        value={timeToAnswer === -1 ? "" : timeToAnswer}
                        onChange={(e) => handleTimeChange(e, setTimeToAnswer)}
                        disabled={timeToAnswer === -1}
                        placeholder="5-60"
                        className={`p-2 rounded-md border border-gray-300 text-black w-28 ${
                          timeToAnswer === -1 ? "bg-gray-100" : "bg-white"
                        }`}
                      />
                      <span className="text-gray-600 text-sm">seconds</span>
                    </div>

                    <div className="mt-2 text-xs text-gray-500">
                      How long the buzzed player has to respond.
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Start Game right */}
            <div className="lg:col-span-4">
              <div className="rounded-xl border border-gray-200 bg-white p-4 h-full flex flex-col justify-between">
                <div>
                  <div className="text-gray-900 text-lg font-semibold">Ready?</div>
                  <div className="text-sm text-gray-500 mt-1">
                    Start the game with the current lobby settings.
                  </div>
                </div>

                <button
                  onClick={onCreateGame}
                  className="mt-4 w-full text-xl px-6 py-4 bg-blue-600 text-white rounded-xl cursor-pointer shadow-md hover:bg-blue-500 transition active:scale-[0.99]"
                >
                  Start Game
                </button>

                <div className="mt-3" />
              </div>
            </div>
          </div>

          {/* Advanced Settings */}
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <button
              type="button"
              onClick={() => setAdvancedOpen((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition"
              aria-expanded={advancedOpen}
            >
              <div className="flex flex-col items-start">
                <div className="text-gray-900 font-semibold">Advanced Settings</div>
                <div className="text-xs text-gray-500">
                  Custom boards, model selection, visuals.
                </div>
              </div>

              <div
                className={`text-gray-500 transition-transform duration-200 ${
                  advancedOpen ? "rotate-180" : ""
                }`}
              >
                ▼
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
                    {/* Custom Board JSON */}
                    <div className="lg:col-span-7">
                      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 h-full">
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div>
                            <h3 className="text-gray-900 text-lg font-semibold">
                              Custom Board JSON
                            </h3>
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

                    {/* Model Settings */}
                    <div className="lg:col-span-5">
                      <div
                        className={`rounded-xl border border-gray-200 bg-gray-50 p-4 ${
                          usingImportedBoard ? "opacity-50 pointer-events-none" : ""
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <div>
                            <div className="text-gray-900 text-lg font-semibold">
                              Model Settings
                            </div>
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
                          <label className="text-sm font-medium text-gray-800">
                            Model Selection
                          </label>
                          <select
                            value={selectedModel}
                            onChange={onModelChange}
                            disabled={usingImportedBoard}
                            className="p-2 rounded-md border border-gray-300 text-black w-full bg-white cursor-pointer"
                          >
                            {Object.entries(groupedModels).map(([price, models]) => (
                              <optgroup
                                key={price}
                                label={price === "0" ? "Free Models" : "Premium Models"}
                              >
                                {models.map((model) => (
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

                        {/* Reasoning Effort */}
                        <div className="mt-4 pt-3 border-t border-gray-300">
                          <div className="text-sm font-medium text-gray-700 mb-2">
                            Reasoning Effort
                          </div>

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

                        {/* Visuals */}
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
                    {/* end grid */}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* end stack */}
        </div>
      </div>
    </div>
  );
};

export default HostControls;
