import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import * as React from "react";

import { REVIEW_FONT } from "@/components/reports/review-pdf";
import type { JournalEntry } from "@/lib/receipts";

/**
 * The decision journal as a PDF (Hamza, 9 Nov 2026, the twenty more ways):
 * every Decision Log entry, oldest first, each amount masked, and on the
 * first page the journal's fingerprint and the day the deployment first saw
 * it, checkable at /receipt/<fingerprint>. Pure: it draws what the route
 * gathered.
 */

export type JournalPdfData = { title: string; methodology: string | null; exportedOn: string; entries: JournalEntry[]; fingerprint: string; sealedAt: string | null; checkUrl: string | null };

const INK = "#0b0b0b";
const MUTED = "#52514e";
const FAINT = "#8a8a88";
const RULE = "#e7e6e2";
const BLUE = "#2a78d6";

const s = StyleSheet.create({
  page: { backgroundColor: "#ffffff", color: INK, fontFamily: REVIEW_FONT, fontSize: 8.8, lineHeight: 1.45, paddingTop: 48, paddingBottom: 52, paddingHorizontal: 40 },
  kicker: { fontSize: 6.8, fontWeight: 700, letterSpacing: 1.1, color: BLUE, textTransform: "uppercase", marginBottom: 4 },
  h1: { fontSize: 22, fontWeight: 700, lineHeight: 1.15, marginBottom: 4 },
  sub: { fontSize: 10, color: MUTED, marginBottom: 10 },
  seal: { borderWidth: 1, borderColor: RULE, borderStyle: "solid", borderRadius: 6, paddingVertical: 8, paddingHorizontal: 10, marginBottom: 14 },
  mono: { fontSize: 7.2, color: INK },
  muted: { fontSize: 7.4, color: MUTED },
  entry: { borderBottomWidth: 0.6, borderBottomColor: RULE, borderBottomStyle: "solid", paddingVertical: 7 },
  meta: { fontSize: 7, color: MUTED, marginBottom: 2 },
  title: { fontSize: 9.6, fontWeight: 700, marginBottom: 2 },
  footer: { position: "absolute", bottom: 20, left: 40, right: 40, fontSize: 6.6, color: FAINT, textAlign: "center" },
});

const day = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export function JournalPdf({ d }: { d: JournalPdfData }) {
  return (
    <Document title={d.title} author="Invariant" creator="Invariant">
      <Page size="A4" style={s.page}>
        <Text style={s.kicker}>Invariant</Text>
        <Text style={s.h1}>{d.title}</Text>
        <Text style={s.sub}>{`${d.entries.length} ${d.entries.length === 1 ? "entry" : "entries"}, exported ${day(d.exportedOn)}${d.methodology ? `, under ${d.methodology}` : ""}. Every amount is masked.`}</Text>
        <View style={s.seal}>
          <Text style={{ fontSize: 8, fontWeight: 700, marginBottom: 3 }}>{d.sealedAt ? `Sealed ${day(d.sealedAt)}` : "Not sealed"}</Text>
          <Text style={s.mono}>{d.fingerprint}</Text>
          <Text style={s.muted}>{d.sealedAt ? `The fingerprint of these entries as written below, first seen by the deployment on that day${d.checkUrl ? `; check it at ${d.checkUrl}` : ""}. Change one word and the fingerprint changes, so the journal cannot be backdated.` : "The fingerprint of these entries as written below; this copy was made where nothing seals it."}</Text>
        </View>
        {d.entries.map((e, i) => (
          <View key={i} style={s.entry} wrap={false}>
            <Text style={s.meta}>{`${day(e.date)} · ${e.kind}${e.symbol ? ` · ${e.symbol}` : ""}${e.outcome ? ` · ${e.outcome}` : ""}`}</Text>
            <Text style={s.title}>{e.title}</Text>
            {e.text.trim() ? <Text>{e.text.trim()}</Text> : null}
          </View>
        ))}
        {!d.entries.length ? <Text style={s.muted}>The Decision Log has no entry yet.</Text> : null}
        <Text style={s.footer} fixed render={({ pageNumber, totalPages }) => `Made with Invariant  ·  the person's own Decision Log  ·  Not investment advice  ·  ${pageNumber} / ${totalPages}`} />
      </Page>
    </Document>
  );
}
