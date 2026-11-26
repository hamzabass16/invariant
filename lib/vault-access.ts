import "server-only";

import { googleRefreshToken } from "@/lib/google-user";
import { microsoftRefreshToken } from "@/lib/microsoft-user";
import type { EnrolmentAccess } from "@/lib/registry";
import { linkedDriveRefresh, openVault } from "@/lib/vault";

/**
 * What a scheduled report may open the signed-in person's vault with while
 * they are away: nothing extra for a chosen bucket (the registry holds its
 * credential), else the refresh token of the sign-in behind their folder.
 * An email sign-in has no token of its own: the Drive linked on Welcome
 * stands in. Null when the sign-in gave no refresh token, so the Reports
 * screen can say what to do.
 */
export async function enrolmentAccess(): Promise<EnrolmentAccess | null> {
  const vault = await openVault();
  if (vault.kind === "bucket") return { provider: "bucket" };
  if (vault.provider === "microsoft") {
    const refresh = await microsoftRefreshToken();
    return refresh ? { provider: "microsoft", refreshToken: refresh } : null;
  }
  const refresh = (await googleRefreshToken()) ?? (await linkedDriveRefresh());
  return refresh ? { provider: "google", refreshToken: refresh } : null;
}
