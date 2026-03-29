export const yen = (n) =>
  `¥${Number(n ?? 0).toLocaleString('ja-JP', { maximumFractionDigits: 1 })}`

export const pnlYen = (n) => {
  const v = Number(n ?? 0)
  return `${v >= 0 ? '+' : ''}¥${Math.abs(v).toLocaleString('ja-JP', { maximumFractionDigits: 0 })}`
}

export const pct = (n) => {
  const v = Number(n ?? 0)
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`
}

export const diff = (n) => {
  const v = Number(n ?? 0)
  return `${v >= 0 ? '▲' : '▼'} ${Math.abs(v).toLocaleString('ja-JP', { maximumFractionDigits: 1 })}`
}
