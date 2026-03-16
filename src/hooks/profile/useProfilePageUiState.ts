import { useEffect, useState } from "react";
import type { LadderRole } from "../../../shared/roles";
import type { Profile as P } from "../../contexts/ProfileContext";
import type { Board } from "../../types/Board";
import {
  COLOR_TARGETS,
  normalizeHex,
  type ColorTarget,
} from "./profilePageController.shared";
import { getSavedHexForTarget, loadProfileBoards } from "./profilePageController.helpers";

type UseProfilePageUiStateArgs = {
  routeProfile: P | null;
  usernameParam: string | undefined;
};

export function useProfilePageUiState(args: UseProfilePageUiStateArgs) {
  const { routeProfile, usernameParam } = args;

  const [boards, setBoards] = useState<Board[]>([]);
  const [boardsLoading, setBoardsLoading] = useState(true);
  const [localError, setLocalError] = useState<string | null>(null);

  const [bioDraft, setBioDraft] = useState<string>("");
  const [savingBio, setSavingBio] = useState(false);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [colorTarget, setColorTarget] = useState<ColorTarget>("color");
  const [hexDraft, setHexDraft] = useState<string>("#3b82f6");

  const [promoteOpen, setPromoteOpen] = useState(false);
  const [banOpen, setBanOpen] = useState(false);
  const [promoteDraft, setPromoteDraft] = useState<LadderRole | "">("");
  const [banCheck, setBanCheck] = useState(false);

  useEffect(() => {
    setBioDraft(routeProfile?.bio ?? "");
  }, [routeProfile?.bio, routeProfile?.id]);

  useEffect(() => {
    if (!routeProfile) return;
    const meta = COLOR_TARGETS.find((target) => target.key === colorTarget)!;
    const current = routeProfile[colorTarget] ?? meta.defaultHex;
    setHexDraft(normalizeHex(String(current), meta.defaultHex));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    routeProfile?.id,
    routeProfile?.color,
    routeProfile?.text_color,
    routeProfile?.name_color,
    routeProfile?.border_color,
    routeProfile?.background_color,
    colorTarget,
  ]);

  useEffect(() => {
    const run = async () => {
      setBoardsLoading(true);
      setLocalError(null);

      const result = await loadProfileBoards(usernameParam);
      setBoards(result.boards);
      setLocalError(result.error);
      setBoardsLoading(false);
    };

    void run();
  }, [usernameParam]);

  const cancelHexDraft = () => {
    if (!routeProfile) return;
    setHexDraft(getSavedHexForTarget(routeProfile, colorTarget));
  };

  return {
    boards,
    boardsLoading,
    localError,
    setLocalError,
    bioDraft,
    setBioDraft,
    savingBio,
    setSavingBio,
    settingsOpen,
    setSettingsOpen,
    colorTarget,
    setColorTarget,
    hexDraft,
    setHexDraft,
    cancelHexDraft,
    promoteOpen,
    setPromoteOpen,
    banOpen,
    setBanOpen,
    promoteDraft,
    setPromoteDraft,
    banCheck,
    setBanCheck,
  };
}
