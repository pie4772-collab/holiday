import { useEffect, useRef, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { HEARTBEAT_SECONDS } from '../../constants/training';

let apiPromise = null;

function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!apiPromise) {
    apiPromise = new Promise((resolve, reject) => {
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        previous?.();
        resolve(window.YT);
      };
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.onerror = () => {
        apiPromise = null;
        reject(new Error('YouTube 플레이어를 불러오지 못했습니다.'));
      };
      document.head.appendChild(script);
    });
  }
  return apiPromise;
}

const ERROR_TEXT = {
  2: '영상 주소가 올바르지 않습니다.',
  5: '이 브라우저에서 재생할 수 없는 영상입니다.',
  100: '삭제되었거나 비공개로 바뀐 영상입니다.',
  101: '영상 소유자가 다른 사이트에서의 재생을 막아 두었습니다.',
  150: '영상 소유자가 다른 사이트에서의 재생을 막아 두었습니다.',
};

/**
 * 페이지 안에서 YouTube 영상을 재생하고, 1초마다 재생 위치를 확인해 정상 재생한 시간만 모아 report 로 보냅니다.
 * 앞으로 건너뛰거나 빠르게 재생한 구간은 실제로 흐른 시간만큼만 셉니다.
 * report({ seconds, duration }) 는 시작할 때 한 번(seconds 0), 이후 HEARTBEAT_SECONDS 마다, 멈추거나 끝날 때 불립니다.
 */
export function YouTubePlayer({ videoId, report, disabled = false }) {
  const holderRef = useRef(null);
  const reportRef = useRef(report);
  const [error, setError] = useState('');

  useEffect(() => {
    reportRef.current = report;
  }, [report]);

  useEffect(() => {
    if (disabled) return undefined;
    let player = null;
    let cancelled = false;
    let timer = null;
    let pending = 0;
    let sinceFlush = 0;
    let lastPos = null;
    let lastTick = 0;
    let started = false;

    const duration = () => {
      const value = Number(player?.getDuration?.()) || 0;
      return value > 0 ? Math.round(value) : null;
    };
    const flush = () => {
      const whole = Math.floor(pending);
      if (whole < 1) return;
      pending -= whole;
      sinceFlush = 0;
      reportRef.current?.({ seconds: whole, duration: duration() });
    };
    const tick = () => {
      if (!player?.getPlayerState) return;
      const now = performance.now();
      const pos = Number(player.getCurrentTime()) || 0;
      const realDt = lastTick ? (now - lastTick) / 1000 : 0;
      if (player.getPlayerState() === window.YT.PlayerState.PLAYING && lastPos != null && realDt > 0) {
        const advanced = pos - lastPos;
        if (advanced > 0 && advanced <= realDt * 2.1 + 0.5) pending += Math.min(advanced, realDt);
      }
      lastPos = pos;
      lastTick = now;
      sinceFlush += realDt;
      if (sinceFlush >= HEARTBEAT_SECONDS) flush();
    };

    loadYouTubeApi()
      .then((YT) => {
        if (cancelled || !holderRef.current) return;
        // YouTube 가 이 요소를 iframe 으로 바꾸므로 React 가 그리지 않는 요소를 따로 만들어 넘깁니다.
        const mount = document.createElement('div');
        holderRef.current.replaceChildren(mount);
        player = new YT.Player(mount, {
          videoId,
          width: '100%',
          height: '100%',
          playerVars: { rel: 0, playsinline: 1, modestbranding: 1 },
          events: {
            onStateChange: (event) => {
              if (event.data === YT.PlayerState.PLAYING) {
                lastPos = Number(player.getCurrentTime()) || 0;
                lastTick = performance.now();
                if (!started) {
                  started = true;
                  reportRef.current?.({ seconds: 0, duration: duration() });
                }
              } else if (event.data === YT.PlayerState.PAUSED || event.data === YT.PlayerState.ENDED) {
                tick();
                flush();
              }
            },
            onError: (event) => setError(ERROR_TEXT[event.data] || '영상을 재생하지 못했습니다.'),
          },
        });
        timer = window.setInterval(tick, 1000);
      })
      .catch((err) => !cancelled && setError(err.message));

    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
      flush();
      player?.destroy?.();
    };
  }, [videoId, disabled]);

  return (
    <div>
      <div className="relative w-full overflow-hidden rounded-md bg-black" style={{ aspectRatio: '16 / 9' }}>
        {disabled ? (
          <iframe
            title="교육 영상"
            className="absolute inset-0 h-full w-full"
            src={`https://www.youtube-nocookie.com/embed/${videoId}?rel=0`}
            allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
          />
        ) : (
          <div ref={holderRef} className="absolute inset-0 [&>iframe]:h-full [&>iframe]:w-full" />
        )}
      </div>
      {error && (
        <div className="mt-2 rounded-md border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-sm text-[#b91c1c]">
          {error}{' '}
          <a
            href={`https://www.youtube.com/watch?v=${videoId}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 underline"
          >
            YouTube에서 보기 <ExternalLink className="h-3.5 w-3.5" />
          </a>
          <div className="mt-1 text-[12px]">이 영상은 시청 시간이 기록되지 않습니다. 인사담당에게 알려주세요.</div>
        </div>
      )}
    </div>
  );
}
