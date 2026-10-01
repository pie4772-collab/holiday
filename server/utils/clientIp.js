/** IPv4 주소와 CIDR 대역 처리, 프록시 뒤에서의 접속 IP 판별 */

export function normalizeIp(value) {
  let ip = String(value || '').trim();
  if (!ip) return '';
  if (ip.startsWith('[')) ip = ip.slice(1, ip.indexOf(']') > 0 ? ip.indexOf(']') : undefined);
  if (/^::ffff:/i.test(ip)) ip = ip.slice(7);
  // "1.2.3.4:5678" 처럼 포트가 붙은 IPv4
  const portMatch = ip.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/);
  if (portMatch) ip = portMatch[1];
  if (ip === '::1') return '127.0.0.1';
  return ip;
}

export function ipv4ToInt(ip) {
  const parts = String(ip).split('.');
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    value = value * 256 + n;
  }
  return value;
}

/** "1.2.3.0/24" 또는 단일 IP. 잘못된 형식이면 null */
export function parseCidr(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const [address, bitsText] = raw.split('/');
  const base = ipv4ToInt(address);
  if (base == null) return null;
  const bits = bitsText == null ? 32 : Number(bitsText);
  if (!Number.isInteger(bits) || bits < 0 || bits > 32 || (bitsText != null && !/^\d+$/.test(bitsText))) return null;
  const size = 2 ** (32 - bits);
  const network = Math.floor(base / size) * size;
  return { cidr: `${intToIpv4(network)}/${bits}`, network, size };
}

function intToIpv4(value) {
  return [24, 16, 8, 0].map((shift) => Math.floor(value / 2 ** shift) % 256).join('.');
}

/** 줄바꿈·쉼표로 구분된 대역 목록 → { ranges, invalid } */
export function parseIpRanges(text) {
  const ranges = [];
  const invalid = [];
  for (const token of String(text || '').split(/[\s,;]+/)) {
    if (!token) continue;
    const parsed = parseCidr(token);
    if (parsed) ranges.push(parsed);
    else invalid.push(token);
  }
  return { ranges, invalid };
}

export function ipInRanges(ip, ranges) {
  const value = ipv4ToInt(normalizeIp(ip));
  if (value == null) return false;
  return ranges.some((range) => value >= range.network && value < range.network + range.size);
}

function forwardedChain(req) {
  const header = req.headers['x-forwarded-for'];
  const text = Array.isArray(header) ? header.join(',') : String(header || '');
  return text
    .split(',')
    .map((part) => normalizeIp(part))
    .filter(Boolean);
}

/**
 * 신뢰할 프록시 수(hops)만큼 오른쪽에서 거슬러 올라간 주소를 접속 IP로 봅니다.
 * hops=0 이면 소켓 주소만 사용합니다. 왼쪽 값은 사용자가 위조할 수 있어 쓰지 않습니다.
 */
export function getClientIp(req, hops = 0) {
  const socketIp = normalizeIp(req.socket?.remoteAddress);
  const chain = [...forwardedChain(req), socketIp].filter(Boolean);
  const index = chain.length - 1 - Math.max(0, Number(hops) || 0);
  return chain[Math.max(0, index)] || socketIp;
}

export function describeClientIp(req, hops = 0) {
  return {
    socketIp: normalizeIp(req.socket?.remoteAddress),
    forwardedFor: req.headers['x-forwarded-for'] || null,
    realIp: req.headers['x-real-ip'] || null,
    forwarded: req.headers.forwarded || null,
    hops,
    clientIp: getClientIp(req, hops),
  };
}
