/**
 * Is a Directive In force on `today`? (ADR 0001: computed from the dates, the
 * site's `isvalid` flag is never used.)
 *
 * All three arguments are ISO dates ("2026-12-31"). ISO dates sort the same
 * way as text, so plain string comparison is enough: "2026-01-02" > "2026-01-01".
 * Both ends are inclusive, and a null valid-to means the Directive has no end.
 */
export function isInForce(
  validFrom: string | null,
  validTo: string | null,
  today: string,
): boolean {
  const started = validFrom === null || validFrom <= today;
  const notEnded = validTo === null || today <= validTo;
  return started && notEnded;
}

/**
 * Today's date in Israel as an ISO date ("2026-11-23"). The site's dates are
 * Israeli calendar days, so "today" must be too, whatever the server's time zone.
 * The "en-CA" locale is used only because it formats dates as YYYY-MM-DD.
 */
export function todayInIsrael(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
  }).format(new Date());
}
