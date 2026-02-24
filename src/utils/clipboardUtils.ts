// utils/clipboardUtils.ts
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text) return false;

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

export const copyToClipboard = (
  text: string,
  onSuccess?: () => void,
  onError?: (reason: string) => void,
) => {
  void copyTextToClipboard(text).then((ok) => {
    if (ok) {
      if (onSuccess) onSuccess();
      return;
    }
    if (onError) onError("copy-failed");
  });
};
