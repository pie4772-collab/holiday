import os from 'os';

/** 사설망 IPv4 주소 자동 감지 (Wi-Fi/이더넷) */
export function getLocalIp() {
  const interfaces = os.networkInterfaces();

  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) {
        return entry.address;
      }
    }
  }

  return '127.0.0.1';
}

export function getShareUrl(port, localIp = getLocalIp()) {
  return `http://${localIp}:${port}`;
}
