"use client";

import { saveEtoroAction, saveFlexAction, saveSnapTradeAction } from "@/app/(app)/setup/actions";
import { chooseBucketAction } from "@/app/(app)/setup/vault-actions";
import { ActionForm } from "@/components/app/action-form";

const field = "mt-1 block w-full rounded-control border border-hairline-strong bg-surface-2 px-3 py-2 text-body text-text";

/** The IBKR Flex Web Service token and query id: kept in the vault, fetched at once, never shown again. */
export function FlexTokenForm({ replacing }: { replacing: boolean }) {
  return (
    <ActionForm action={saveFlexAction} label={replacing ? "Replace and fetch" : "Keep and fetch"} pendingLabel="Fetching from IBKR" note="IBKR can take up to a minute to make the statement." doneLabel="Kept and fetched" size="sm">
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
        <label className="block text-subhead">
          Token
          <input name="token" type="password" autoComplete="off" spellCheck={false} required className={field} />
        </label>
        <label className="block text-subhead">
          Query id
          <input name="queryId" inputMode="numeric" autoComplete="off" required className={`${field} data`} />
        </label>
      </div>
      <p className="mt-1 mb-3 text-footnote text-text-tertiary">From IBKR&apos;s Flex Web Service. It can fetch reports and nothing else. Part 2 of the guide below says where each is.</p>
    </ActionForm>
  );
}

/** The person's own SnapTrade Personal key. */
export function SnapTradeForm({ replacing }: { replacing: boolean }) {
  return (
    <ActionForm action={saveSnapTradeAction} label={replacing ? "Replace and fetch" : "Keep and fetch"} pendingLabel="Fetching from SnapTrade" doneLabel="Kept and fetched" size="sm">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-subhead">
          Client id
          <input name="clientId" autoComplete="off" spellCheck={false} required className={`${field} data`} />
        </label>
        <label className="block text-subhead">
          Consumer key
          <input name="consumerKey" type="password" autoComplete="off" spellCheck={false} required className={field} />
        </label>
      </div>
      <p className="mt-1 mb-3 text-footnote text-text-tertiary">Schwab, Wealthsimple, Questrade, Fidelity, Robinhood and others, from SnapTrade&apos;s free Personal plan.</p>
    </ActionForm>
  );
}

/** The person's own eToro keys, made with Read permission. */
export function EtoroForm({ replacing }: { replacing: boolean }) {
  return (
    <ActionForm action={saveEtoroAction} label={replacing ? "Replace and fetch" : "Keep and fetch"} pendingLabel="Fetching from eToro" doneLabel="Kept and fetched" size="sm">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-subhead">
          Public API Key
          <input name="apiKey" type="password" autoComplete="off" spellCheck={false} required className={field} />
        </label>
        <label className="block text-subhead">
          User Key
          <input name="userKey" type="password" autoComplete="off" spellCheck={false} required className={field} />
        </label>
      </div>
      <p className="mt-1 mb-3 text-footnote text-text-tertiary">Made in eToro with Read permission for the Real environment.</p>
    </ActionForm>
  );
}

/** A bucket of the person's own, tested with a small file before it is kept. */
export function BucketForm() {
  return (
    <>
      <p className="mb-3 text-footnote text-text-secondary">
        Any S3-compatible bucket in an account you control: AWS S3, Cloudflare R2, Backblaze B2, Google Cloud Storage. Paste a key that reaches this bucket alone. The bucket is tested with a small file before it is kept. Your files are not moved; Setup starts again in the bucket.
      </p>
      <ActionForm action={chooseBucketAction} label="Test and use this bucket" pendingLabel="Testing" doneLabel="Bucket in use" size="sm">
        <label className="block text-subhead">
          Endpoint
          <input name="endpoint" className={field} placeholder="https://s3.eu-central-1.amazonaws.com" required autoComplete="off" />
        </label>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block text-subhead">
            Bucket
            <input name="bucket" className={field} placeholder="my-portfolio" required autoComplete="off" />
          </label>
          <label className="block text-subhead">
            Region
            <input name="region" className={field} placeholder="eu-central-1 or auto" autoComplete="off" />
          </label>
        </div>
        <label className="mt-3 block text-subhead">
          Folder in the bucket
          <input name="prefix" className={field} defaultValue="portfolio-os" autoComplete="off" />
        </label>
        <label className="mt-3 block text-subhead">
          Access key id
          <input name="accessKeyId" className={field} required autoComplete="off" />
        </label>
        <label className="mt-3 mb-4 block text-subhead">
          Secret access key
          <input name="secretAccessKey" type="password" className={field} required autoComplete="off" />
        </label>
      </ActionForm>
    </>
  );
}
