import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";

import { FollowButton } from "@/components/community/follow-button";
import { ProfileBody } from "@/components/community/profile-body";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";
import { HANDLE, type CommunityProfile } from "@/lib/community";
import { communityFor, screen } from "@/lib/workspace";

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  return { title: `@${decodeURIComponent(handle)} · Community · Invariant` };
}

async function profileOf(ws: Awaited<ReturnType<typeof screen>>, handle: string): Promise<CommunityProfile | null> {
  if (ws.mode === "demo") return (await communityFor(ws)).profiles.find((p) => p.handle === handle) ?? null;
  const { registryAvailable, communityProfile } = await import("@/lib/registry");
  if (!registryAvailable()) return null;
  return communityProfile(handle);
}

/**
 * One shared profile: the person's theses in their words and their weights
 * in percent, as a donut and a list. Nothing of their money's size is here,
 * since nothing of it was shared.
 */
export default async function CommunityProfilePage({ params }: { params: Promise<{ handle: string }> }) {
  const ws = await screen("overview");
  const { handle: raw } = await params;
  const handle = decodeURIComponent(raw).toLowerCase();
  if (!HANDLE.test(handle)) notFound();
  const p = await profileOf(ws, handle);
  if (!p) notFound();
  const following = ws.preferences.following.includes(p.handle);
  const handleOfMine = ws.mode === "demo" ? null : (await communityFor(ws)).mine?.handle ?? null;

  return (
    <>
      <PageHeader
        title={p.name}
        subtitle={`@${p.handle}`}
        action={
          <Link href={"/community" as Route} className="text-subhead text-accent-text">
            Community
          </Link>
        }
      />
      <PageBody>
        <ProfileBody p={p} link={ws.mode !== "demo"} follow={ws.operator.email && p.handle !== handleOfMine ? <FollowButton handle={p.handle} following={following} /> : null} />
      </PageBody>
    </>
  );
}
