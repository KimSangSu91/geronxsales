// 로그인 기록의 기기·브라우저 표시 (예: "Windows · Chrome")
export function deviceLabel(ua: string | null): string {
  if (!ua) return "-";
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "기타";
  const browser = /Edg\//.test(ua) ? "Edge" : /Whale\//.test(ua) ? "Whale" : /SamsungBrowser/.test(ua) ? "삼성 인터넷" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "기타";
  return `${os} · ${browser}`;
}
