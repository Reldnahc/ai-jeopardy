type CategoryOfTheDay = {
  category: string;
  description: string;
};

let cotd: CategoryOfTheDay = {
  category: "",
  description: "",
};

export function getCOTD(): CategoryOfTheDay {
  return cotd;
}

export function setCOTD(next: CategoryOfTheDay): void {
  cotd = next;
}
