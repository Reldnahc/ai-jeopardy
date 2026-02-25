import type { ReactNode } from "react";
import type { AlertButton } from "../../contexts/AlertContext.tsx";
import { useCallback } from "react";

type Categories = {
  firstBoard: string[];
  secondBoard: string[];
};

type Params = {
  profile: { id: string } | null;
  showAlert: (
    header: ReactNode,
    text: ReactNode,
    buttons: AlertButton[],
  ) => Promise<string>;
  boardJson: string;
  tryValidateBoardJson: (raw: string) => string | null;
  usingImportedBoard: boolean;
  setBoardJsonError: (error: string | null) => void;
  categories: Categories;
  setManualLoading: (msg: string) => void;
  isSocketReady: boolean;
  gameId?: string;
  sendJson: (payload: Record<string, unknown>) => void;
};

export function useLobbyCreateGame({
  profile,
  showAlert,
  boardJson,
  tryValidateBoardJson,
  usingImportedBoard,
  setBoardJsonError,
  categories,
  setManualLoading,
  isSocketReady,
  gameId,
  sendJson,
}: Params) {
  return useCallback(async () => {
    if (!profile) {
      await showAlert("Login Required", <span>You need to be logged in to do this.</span>, [
        {
          label: "Okay",
          actionValue: "okay",
          styleClass: "bg-green-500 text-white hover:bg-green-600",
        },
      ]);
      return;
    }

    const localJsonError = tryValidateBoardJson(boardJson);
    setBoardJsonError(localJsonError);

    if (usingImportedBoard && localJsonError) {
      await showAlert(
        "Invalid Board JSON",
        <span>
          <span>{localJsonError}</span>
        </span>,
        [
          {
            label: "Okay",
            actionValue: "okay",
            styleClass: "bg-green-500 text-white hover:bg-green-600",
          },
        ],
      );
      return;
    }

    // Only require categories when NOT importing
    if (!usingImportedBoard) {
      if (
        categories.firstBoard.some((c) => !c.trim()) ||
        categories.secondBoard.some((c) => !c.trim())
      ) {
        await showAlert("Missing Categories", <span>Please fill in all the categories.</span>, [
          {
            label: "Okay",
            actionValue: "okay",
            styleClass: "bg-green-500 text-white hover:bg-green-600",
          },
        ]);
        return;
      }
    }

    try {
      setManualLoading("Generating your questions...");

      if (!isSocketReady) return;
      if (!gameId) return;

      // Server authoritative: create-game only needs gameId.
      sendJson({
        type: "create-game",
        gameId,
      });
    } catch (error) {
      console.error("Failed to generate board data:", error);
      await showAlert(
        "Generation Failed",
        <span>Failed to generate board data. Please try again.</span>,
        [
          {
            label: "Okay",
            actionValue: "okay",
            styleClass: "bg-green-500 text-white hover:bg-green-600",
          },
        ],
      );
    }
  }, [
    profile,
    showAlert,
    boardJson,
    tryValidateBoardJson,
    usingImportedBoard,
    setBoardJsonError,
    categories.firstBoard,
    categories.secondBoard,
    setManualLoading,
    isSocketReady,
    gameId,
    sendJson,
  ]);
}
