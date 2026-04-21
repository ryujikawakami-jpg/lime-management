/** 円表示フォーマット ¥1,234,567 */
export function formatYen(amount: number): string {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(amount);
}

/** 秒数を hh:mm:ss 形式に変換 */
export function formatSeconds(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/** YYYY-MM を YYYY年MM月 に変換 */
export function formatYearMonth(ym: string): string {
  const [y, m] = ym.split("-");
  return `${y}年${m}月`;
}

/** パーセント表示 */
export function formatPercent(value: number, digits = 1): string {
  return `${value.toFixed(digits)}%`;
}
