// shortcut: five chart tokens, so series older than the newest five share the lightest; add tokens if compare ever shows more.
export const seriesColor = (index: number, count: number) =>
  `var(--chart-${Math.max(1, 5 - (count - 1 - index))})`;
/** The newest series is solid, older ones dashed: the chart tokens alone are too close to tell lines apart. */
export const seriesDash = (index: number, count: number) =>
  index === count - 1 ? undefined : index === count - 2 ? "7 3" : "2 3";
