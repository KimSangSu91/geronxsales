// 월 비용 합계 = 현재 계약의 월 비용 + 월 옵션상품 (무상 제외, 공급가) — 저장하지 않고 계산 (데이터모델 3-2)
// 월 비용 항목이 하나도 없으면 null ("-" 또는 "월 비용 없음" 표시)
export function monthlyTotal(
  contractMonthlyCharges: { amount: number }[],
  monthlyOptions: { amount: number }[],
): number | null {
  const items = [...contractMonthlyCharges, ...monthlyOptions];
  return items.length ? items.reduce((sum, x) => sum + x.amount, 0) : null;
}
