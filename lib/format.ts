/** Number formatting. Figures render in IBM Plex Mono with tabular digits. */

export function usd(n: number, digits = 0) {
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

export function signedUsd(n: number, digits = 0) {
  return `${n > 0 ? "+" : ""}${usd(n, digits)}`;
}

export function price(n: number) {
  return usd(n, n >= 1000 ? 0 : 2);
}

export function pct(n: number, digits = 1) {
  return `${n.toFixed(digits)}%`;
}

export function signedPct(n: number, digits = 1) {
  return `${n > 0 ? "+" : ""}${n.toFixed(digits)}%`;
}

export function shares(n: number) {
  return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

/** A Google Drive file or folder link from its id. */
export function driveUrl(id: string, kind: "doc" | "folder" | "file" = "file") {
  if (kind === "doc") return `https://docs.google.com/document/d/${id}/edit`;
  if (kind === "folder") return `https://drive.google.com/drive/folders/${id}`;
  return `https://drive.google.com/file/d/${id}/view`;
}
