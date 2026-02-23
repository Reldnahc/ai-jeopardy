let cotd = {
  category: "",
  description: "",
};

export function getCOTD() {
  return cotd;
}

export function setCOTD(next) {
  cotd = next;
}
