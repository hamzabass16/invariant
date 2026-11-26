import { notFound } from "next/navigation";

import { ReviewEmbed } from "@/components/reports/review-embed";
import { embedsItself, ReportView } from "@/components/reports/report-view";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";
import { demoReview, DEMO_REVIEW_IDS } from "@/lib/demo-review";
import { reportsFileSchema } from "@/lib/report";
import { SyncError } from "@/lib/sync-error";
import { screen } from "@/lib/workspace";
import { localMoment } from "@/lib/time";

export const metadata = { title: "Report · Invariant" };

/** One past report from the vault; in the demo, its weekly or monthly, built on the visit (lib/demo-review.ts). */
export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const ws = await screen("overview");
  const { id } = await params;
  if (ws.mode !== "drive") {
    const kind = id === DEMO_REVIEW_IDS.weekly ? "weekly" : id === DEMO_REVIEW_IDS.monthly ? "monthly" : null;
    const demo = kind ? await demoReview(ws, kind) : null;
    if (!demo) notFound();
    return (
      <>
        <PageHeader title={demo.title} subtitle="Built on this visit from the demo's snapshot; nothing is kept or sent." />
        <PageBody>
          <ReviewEmbed report={demo} />
          {embedsItself(demo) ? null : <ReportView report={demo} />}
        </PageBody>
      </>
    );
  }
  const { openVault } = await import("@/lib/vault");
  let file;
  try {
    file = await (await openVault()).readJson("reports", reportsFileSchema);
  } catch (e) {
    if (!(e instanceof SyncError)) throw e;
    return (
      <>
        <PageHeader title="Report" />
        <PageBody>
          <p className="rounded-card bg-danger/15 px-4 py-3 text-subhead text-danger">{e.message}</p>
        </PageBody>
      </>
    );
  }
  const report = file?.reports.find((r) => r.id === id);
  if (!report) notFound();
  return (
    <>
      <PageHeader title={report.title} subtitle={`Built ${localMoment(report.builtAt)}${report.sentAt ? `, sent ${localMoment(report.sentAt)}` : ", not sent"}, your time`} />
      <PageBody>
        <ReviewEmbed report={report} />
        {embedsItself(report) ? null : <ReportView report={report} />}
      </PageBody>
    </>
  );
}
