// One to two decimals: 15.04 must never read as the 15.0 limit.
const decimals = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 2,
  useGrouping: false,
});

export const mm = (value: number) => `${decimals.format(value)} mm`;
export const hz = (value: number) => `${decimals.format(value)} Hz`;
/** A change in mm with an explicit sign (a real minus, U+2212), so direction never depends on colour. */
export const signedMm = (value: number) =>
  `${value > 0 ? "+" : value < 0 ? "−" : ""}${mm(Math.abs(value))}`;
