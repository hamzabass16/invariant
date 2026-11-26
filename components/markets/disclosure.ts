/**
 * The row a folded section opens from, and its chevron. A plain module, not
 * the client newsletter cards: a string a server component imports from a
 * "use client" file arrives as a client reference, never the classes, so
 * the row lost its layout and the browser's own marker showed at the card's
 * edge (Hamza, 19 Oct 2026).
 */
export const summaryRow = "flex cursor-pointer list-none items-center gap-3 px-4 py-3 marker:hidden [&::-webkit-details-marker]:hidden";
export const chevron = "size-4 shrink-0 text-text-tertiary transition-transform duration-200 group-open:rotate-180";
