// 금액은 공급가(원, 정수)로 저장. VAT 포함 금액은 표시할 때만 계산

// VAT 포함 = floor(공급가 × 1.1) — 소수 오차를 피하려고 정수 연산
export function withVat(supply: number): number {
  return Math.floor((supply * 11) / 10);
}

// 1234567 → "1,234,567"
export function formatWon(amount: number): string {
  return amount.toLocaleString("ko-KR");
}
