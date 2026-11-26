"use client";

import { ActionForm } from "@/components/app/action-form";

import { followAction } from "@/app/(app)/community/actions";

/** Follow or unfollow one handle; the list is the person's own preference. */
export function FollowButton({ handle, following }: { handle: string; following: boolean }) {
  return (
    <ActionForm action={followAction} label={following ? "Unfollow" : "Follow"} pendingLabel={following ? "Unfollowing" : "Following"} doneLabel={following ? "Unfollowed" : "Following"} variant={following ? "ghost" : "secondary"} size="sm">
      <input type="hidden" name="handle" value={handle} />
      <input type="hidden" name="follow" value={following ? "no" : "yes"} />
    </ActionForm>
  );
}
