import React from "react";
import { useProfile } from "../../../contexts/ProfileContext.tsx";
import HostControlsAdvancedSection from "./HostControlsAdvancedSection.tsx";
import HostControlsBasicSection from "./HostControlsBasicSection.tsx";
import type { HostControlsProps, ReasoningEffortSetting } from "./HostControls.types.ts";
import { getRoleGate } from "./HostControlsRoleGate.ts";

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

  const gate = getRoleGate(profile?.role);

  const selectedModel = lobbySettings?.selectedModel ?? "gpt-5.2";
  const timeToBuzz = lobbySettings?.timeToBuzz ?? 10;
  const timeToAnswer = lobbySettings?.timeToAnswer ?? 10;
  const visualMode = lobbySettings?.visualMode ?? "off";
  const reasoningEffort = lobbySettings?.reasoningEffort ?? "off";
  const boardJson = lobbySettings?.boardJson ?? "";

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

  const canUsePremium = gate.atLeast("privileged");
  const canUseBrave = gate.atLeast("privileged");

  const isReasoningLevelLocked = (level: ReasoningEffortSetting) => {
    if (level === "off" || level === "low") return false;
    return !gate.atLeast("privileged");
  };

  return (
    <div className="w-full">
      <div className="w-full rounded-xl border border-gray-200 bg-gray-50 p-4">
        <div className="flex flex-col gap-4">
          <HostControlsBasicSection
            timeToBuzz={timeToBuzz}
            timeToAnswer={timeToAnswer}
            onTimeToBuzzChange={setTimeToBuzz}
            onTimeToAnswerChange={setTimeToAnswer}
            onCreateGame={onCreateGame}
          />

          <HostControlsAdvancedSection
            advancedOpen={advancedOpen}
            setAdvancedOpen={setAdvancedOpen}
            boardJson={boardJson}
            boardJsonError={boardJsonError}
            setBoardJsonError={setBoardJsonError}
            tryValidateBoardJson={tryValidateBoardJson}
            selectedModel={selectedModel}
            visualMode={visualMode}
            reasoningEffort={reasoningEffort}
            canUsePremium={canUsePremium}
            canUseBrave={canUseBrave}
            isReasoningLevelLocked={isReasoningLevelLocked}
            setBoardJson={setBoardJson}
            setSelectedModel={(value) => updateLobbySettings({ selectedModel: value })}
            setVisualMode={setVisualMode}
            setReasoningEffort={setReasoningEffort}
          />
        </div>
      </div>
    </div>
  );
};

export default HostControls;
