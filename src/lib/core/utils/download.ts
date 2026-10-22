export function download_blob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  // Revoked later: some browsers start reading the URL only after click() returns.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
