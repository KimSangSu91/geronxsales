import "server-only";
import ExcelJS from "exceljs";

export type Column = { header: string; key: string; width?: number; money?: boolean };

// 표 1장짜리 엑셀 파일 → 다운로드 응답 (머리글 굵게·고정, 금액은 천 단위 쉼표)
export async function excelResponse(fileName: string, sheetName: string, columns: Column[], rows: Record<string, unknown>[]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 14, style: c.money ? { numFmt: "#,##0" } : {} }));
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };
  for (const r of rows) ws.addRow(r);
  ws.eachRow((row, i) => {
    if (i > 1) row.alignment = { vertical: "top", wrapText: true };
  });
  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="export.xlsx"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "no-store",
    },
  });
}
