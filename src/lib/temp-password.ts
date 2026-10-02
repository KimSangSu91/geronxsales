import "server-only";
import { randomInt } from "node:crypto";

// 임시 비밀번호: 헷갈리는 글자(0·O·1·l·I) 제외, 4자리씩 끊어 전달하기 쉽게 (예: K7mp-3xQa-9tWd)
const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
export function tempPassword() {
  const part = () => Array.from({ length: 4 }, () => CHARS[randomInt(CHARS.length)]).join("");
  return `${part()}-${part()}-${part()}`;
}

export const PASSWORD_MIN = 8;
