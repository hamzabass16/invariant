import "server-only";

import { providerFor } from "@/lib/hosted-model";
import type { Book } from "@/lib/holdings";
import { callModel } from "@/lib/methodology-draft";
import { EVAL_MODEL, evaluationRequestBody, evaluationView, parseEvaluationResponse, type EvaluationParse } from "@/lib/methodology-evaluation";
import type { Methodology } from "@/lib/methodology";
import { modelFor, type ModelRequest } from "@/lib/model-provider";
import { SyncError } from "@/lib/sync-error";
import type { Vault } from "@/lib/vault";

/**
 * How to judge a methodology that states no proof of its own, proposed on
 * the AI (Hamza, 23 Oct 2026: "the AI will give an advice
 * how you should evaluate that"). One call, made when they ask: the
 * methodology in words (its summary, classes and rules) and the dates of
 * their record go to the model, never an amount. The tests it proposes are
 * of the app's fixed kinds and the app computes them; nothing counts until
 * they confirm it (lib/methodology-evaluation.ts).
 */
export async function proposeEvaluation(vault: Vault, m: Methodology, book: Book | null, benchmarks: readonly string[]): Promise<EvaluationParse> {
  const provider = await providerFor(vault);
  if (!provider) throw new SyncError("The AI is not set up on this deployment yet.", "evaluation no provider");
  const view = evaluationView(m, book, benchmarks);
  return parseEvaluationResponse(await callModel(provider, evaluationRequestBody(view, modelFor(provider, EVAL_MODEL)) as ModelRequest, { agent: "methodology", step: "evaluation", subject: "evaluation" }), view);
}
