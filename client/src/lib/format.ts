export function cr(val: number) {
  return `₹${(val / 1e7).toFixed(2)} Cr`
}
export function lakh(val: number) {
  return `₹${(val / 1e5).toFixed(2)} L`
}
export function fmt(val: number) {
  if (Math.abs(val) >= 1e7) return cr(val)
  if (Math.abs(val) >= 1e5) return lakh(val)
  return `₹${val.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}
export function pct(val: number, decimals = 1) {
  return `${(val * 100).toFixed(decimals)}%`
}