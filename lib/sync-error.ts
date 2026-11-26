/**
 * A failure fit to show the owner.
 *
 * `message` is the sentence for the screen. `logDetail` is for the server log
 * and is still scrubbed: an error code, an HTTP status, never a response body,
 * a token, a key or a URL with a token in it.
 */
export class SyncError extends Error {
  constructor(
    message: string,
    readonly logDetail?: string,
  ) {
    super(message);
    this.name = "SyncError";
  }
}
