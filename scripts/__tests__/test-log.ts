export function verbose(...values: unknown[]) {
  if (process.env.RIN_VERBOSE_TESTS === "true") console.log(...values);
}
