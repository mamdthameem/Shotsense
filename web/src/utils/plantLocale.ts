/**
 * How dates and numbers read on this page: the plant's own locale and zone.
 *
 * The gateway dashboard passes `undefined` to every toLocale* call, i.e. whatever the viewer's
 * browser is set to — which is the plant's own machines, so it renders Indian grouping
 * (12,34,567) and plant-local dates. This page is read from anywhere, so the same defaults have
 * to be stated explicitly or an admin abroad would see US grouping (1,234,567) and a day bucket
 * labelled a day early.
 *
 * `hour12: false` is the one departure from en-IN's defaults: that locale prints "03:30 pm",
 * while the rest of this page (and the gateway's own tooltips) use a 24-hour clock.
 */
export const PLANT_LOCALE = 'en-IN';

export const PLANT_TZ = { timeZone: 'Asia/Kolkata' } as const;

export const PLANT_TIME = { hour: '2-digit', minute: '2-digit', hour12: false, ...PLANT_TZ } as const;

/** A number in the plant's locale: 12,34,567 — the grouping the gateway dashboard shows. */
export function plantNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return value.toLocaleString(PLANT_LOCALE, options);
}
