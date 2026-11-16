/** Money is always stored as integer paise. Format as Indian rupees, e.g. ₹1,25,000. */
export function formatPaise(paise: number): string {
  if (!Number.isInteger(paise)) {
    throw new RangeError("Money must be an integer number of paise");
  }
  const rupees = paise / 100;
  const hasPaise = paise % 100 !== 0;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: hasPaise ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(rupees);
}
