import { studyMarkdown } from "@/lib/research";
import { getWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

/** The study as a Markdown file, from the signed-in person's own vault. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const ws = await getWorkspace();
  const study = ws.research.studies.find((s) => s.id === id);
  if (!study || !ws.modules.includes("research")) return new Response("Not found", { status: 404 });
  const name = `${study.subject.replace(/[^A-Za-z0-9-]+/g, "-")}-study-${study.requestedAt.slice(0, 10)}.md`;
  return new Response(studyMarkdown(study), {
    headers: { "content-type": "text/markdown; charset=utf-8", "content-disposition": `attachment; filename="${name}"`, "cache-control": "private, no-store" },
  });
}
