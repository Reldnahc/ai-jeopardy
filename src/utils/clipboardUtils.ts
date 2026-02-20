// utils/clipboardUtils.ts
export const copyToClipboard = (
  text: string,
  onSuccess?: () => void,
  onError?: (reason: string) => void,
) => {
  if (!text) return;

  navigator.clipboard
    .writeText(text)
    .then(() => {
      if (onSuccess) onSuccess(); // Call the success callback
    })
    .catch((error) => {
      if (onError) onError(error); // Call the error callback
      console.error("Failed to copy text to clipboard:", error);
    });
};
