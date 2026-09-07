import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadEnvFile } from './loadEnv.js';
import apiRouter from './routes/api.js';
import { getDb } from './db.js';
import { getLocalIp, getShareUrl } from './utils/network.js';

loadEnvFile();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '0.0.0.0';
const DIST_PATH = path.join(__dirname, '../dist');
const SERVE_STATIC = process.env.SERVE_STATIC !== 'false' && fs.existsSync(DIST_PATH);

function getShareInfo() {
  const localIp = getLocalIp();
  return { localIp, shareUrl: getShareUrl(PORT, localIp) };
}

const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  try {
    const count = getDb().prepare('SELECT COUNT(*) AS c FROM employees').get().c;
    const { localIp, shareUrl } = getShareInfo();
    res.json({
      status: 'ok',
      employees: count,
      localIp,
      port: Number(PORT),
      shareUrl,
    });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

app.use('/api', apiRouter);

if (SERVE_STATIC) {
  app.use(express.static(DIST_PATH));

  app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(DIST_PATH, 'index.html'));
  });
}

app.use((err, req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ message: err.message || '서버 오류' });
});

const server = app.listen(PORT, HOST, () => {
  const { localIp, shareUrl } = getShareInfo();
  const mode = SERVE_STATIC ? 'app (API + frontend)' : 'API only';
  console.log(`Holiday ${mode} running on http://localhost:${PORT}`);
  console.log(`Share URL: ${shareUrl}`);
  if (HOST === '0.0.0.0') {
    console.log(`LAN IP: ${localIp}`);
  }
  if (SERVE_STATIC) {
    console.log(`Static: ${DIST_PATH}`);
  } else {
    console.log('Static files not found. Run "npm run build" then "npm start" for single-port serving.');
  }
  console.log(`DB: ${process.env.DB_PATH || path.join(__dirname, '../database/holiday.db')}`);
  console.log('종료: Ctrl+C');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n[오류] 포트 ${PORT}이(가) 이미 사용 중입니다.`);
    console.error('해결: npm run restart  또는 기존 서버 창을 닫은 뒤 다시 실행하세요.\n');
  } else {
    console.error('\n[오류] 서버 시작 실패:', err.message, '\n');
  }
  process.exit(1);
});
