import type { CategoryOfTheDayPayload } from "../../shared/types/lobby.js";

let cotd: CategoryOfTheDayPayload = {
  category: "",
  description: "",
};

export function getCOTD(): CategoryOfTheDayPayload {
  return cotd;
}

export function setCOTD(next: CategoryOfTheDayPayload): void {
  cotd = next;
}
