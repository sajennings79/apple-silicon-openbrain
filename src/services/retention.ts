// Opt-in retention: a source whose config sets retentionDays > 0 stamps
// expires_at on rows it newly ingests. Everything else never expires.
// Lives in its own module so rss.ts/mail.ts/sourceSync.ts can all import it
// without creating a cycle through sourceSync.
export function expiryFor(config: unknown): Date | undefined {
  const days = (config as { retentionDays?: number } | null)?.retentionDays;
  return typeof days === "number" && days > 0
    ? new Date(Date.now() + days * 86_400_000)
    : undefined;
}
