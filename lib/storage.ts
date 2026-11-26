/**
 * Where a deployment keeps each person's setup and figures.
 *
 *   drive: in the person's own Google Drive, in a "Portfolio OS" folder the
 *          app creates and can see nothing outside of (the drive.file scope).
 *          The deployment holds no portfolio data of its own.
 *   demo:  fictional sample data only, with the visitor's choices kept in a
 *          cookie. Never touches Drive, never calls a model.
 *
 * Set by STORAGE. Anything other than "drive" is the demo, so a deployment
 * that forgets the setting shows samples rather than failing open.
 */
export type StorageMode = "drive" | "demo";

export function storageMode(): StorageMode {
  return process.env.STORAGE === "drive" ? "drive" : "demo";
}

/** A public demo needs no sign-in. Only ever in demo mode: drive mode always signs in. */
export function demoIsPublic(): boolean {
  return storageMode() === "demo" && process.env.DEMO_PUBLIC === "1";
}
