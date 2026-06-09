import { useEffect, useRef, useState } from 'react';
import { useStore, formatHudTime } from '../store/useStore';
import { submitScore, getLeaderboard, LeaderboardEntry } from '../lib/firebase';
import { xrStore } from '../store/xr';

const TARGET_SCORE       = 5;
const SHOUT_RMS          = 0.18;
const CATCH_COOLDOWN_MS  = 850;
const PLAY_AGAIN_COOLDOWN = 5;

const CHILI_ACTIVE   = '/assets/ui/chili_hud_active.png';
const CHILI_INACTIVE = '/assets/ui/chili_hud_inactive.png';

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function drawContain(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const s  = Math.min(w / img.width, h / img.height);
  const dw = img.width  * s;
  const dh = img.height * s;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

async function buildShareBlob(time: string): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width  = 1080;
  canvas.height = 1920;
  const ctx = canvas.getContext('2d')!;

  try {
    const [bg, logo, frame, footer] = await Promise.all([
      loadImg('/assets/ui/bg_share_result.png'),
      loadImg('/assets/ui/logo_share_result.png'),
      loadImg('/assets/ui/frame_durasi_share.png'),
      loadImg('/assets/ui/footer_share.png'),
    ]);
    ctx.fillStyle = '#020803';
    ctx.fillRect(0, 0, 1080, 1920);
    drawContain(ctx, bg,     108, 0,    864, 1920);
    drawContain(ctx, logo,   187, 150,  706,  630);
    drawContain(ctx, frame,  259, 958,  562,  285);
    drawContain(ctx, footer, 295, 1482, 490,  120);
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle    = '#70ff70';
    ctx.font         = '900 142px Saira, Arial, Helvetica, sans-serif';
    ctx.fillText(time, 540, 1128);
    ctx.fillStyle = '#ffffff';
    ctx.font      = 'italic 900 34px Saira, Arial, Helvetica, sans-serif';
    ctx.fillText('YAKIN BISA LEBIH CEPET?', 540, 1432);
  } catch {
    ctx.fillStyle = '#041006';
    ctx.fillRect(0, 0, 1080, 1920);
    ctx.fillStyle = '#70ff70';
    ctx.font      = '900 96px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(time, 540, 960);
  }

  return new Promise(resolve => canvas.toBlob(b => resolve(b!), 'image/png'));
}

export function OverlayUI() {
  const { gameState, elapsedTime, objects, startGame, playerName, setPlayerName, resetGame } = useStore();

  const [leaderboard,    setLeaderboard]    = useState<LeaderboardEntry[]>([]);
  const [showNotice,     setShowNotice]     = useState(false);
  const [noticeTitle,    setNoticeTitle]    = useState('');
  const [noticeText,     setNoticeText]     = useState('');
  const [showSaveModal,  setShowSaveModal]  = useState(false);
  const [playerEmail,    setPlayerEmail]    = useState('');
  const [saveMsg,        setSaveMsg]        = useState('');
  const [saveMsgCls,     setSaveMsgCls]     = useState('');
  const [scoreSaved,     setScoreSaved]     = useState(false);
  const [saving,         setSaving]         = useState(false);
  const [playAgainOff,   setPlayAgainOff]   = useState(false);
  const [playAgainLabel, setPlayAgainLabel] = useState('MAIN LAGI');
  const [missEffect,     setMissEffect]     = useState(false);

  const aimRef           = useRef<HTMLDivElement>(null);
  const speechRef        = useRef<any>(null);
  const lastCatchRef     = useRef(0);
  const meterResetRef    = useRef<ReturnType<typeof setTimeout> | null>(null);

  const foundCount = objects.filter(o => o.isTarget && o.found).length;
  const timeStr    = formatHudTime(elapsedTime);

  // ── voice meter helpers ──────────────────────────────────────────────────
  function setMeter(level: number) {
    const v = Math.min(Math.max(level, 0), 1);
    if (aimRef.current) {
      aimRef.current.style.setProperty('--voice-level', v.toFixed(3));
      aimRef.current.style.setProperty('--voice-sweep', `${(v * 360).toFixed(1)}deg`);
    }
    if (meterResetRef.current) { clearTimeout(meterResetRef.current); meterResetRef.current = null; }
    if (v >= 1 && useStore.getState().gameState === 'playing') {
      meterResetRef.current = setTimeout(() => {
        if (useStore.getState().gameState === 'playing') setMeter(0);
      }, 180);
    }
  }

  function triggerCatch() {
    const now = Date.now();
    if (now - lastCatchRef.current < CATCH_COOLDOWN_MS) return;
    lastCatchRef.current = now;
    setMeter(1);
    window.dispatchEvent(new CustomEvent('try-catch'));
  }

  // ── miss animation ───────────────────────────────────────────────────────
  useEffect(() => {
    const onMiss = () => {
      setMissEffect(true);
      setTimeout(() => setMissEffect(false), 300);
    };
    window.addEventListener('catch-miss', onMiss);
    return () => window.removeEventListener('catch-miss', onMiss);
  }, []);

  // ── timer tick ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (gameState !== 'playing') return;
    const id = setInterval(() => useStore.getState().tickTimer(), 100);
    return () => clearInterval(id);
  }, [gameState]);

  // ── voice / audio detection ──────────────────────────────────────────────
  useEffect(() => {
    if (gameState !== 'playing') {
      if (speechRef.current) { try { speechRef.current.stop(); } catch {} speechRef.current = null; }
      return;
    }

    let alive = true;
    let audioCtx: AudioContext | null = null;
    let rafId:    number | null = null;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        });
        const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (!Ctx || !alive) return;
        audioCtx = new Ctx();
        const src      = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 1024;
        src.connect(analyser);
        const buf = new Uint8Array(analyser.fftSize);

        const check = () => {
          if (!alive) return;
          analyser.getByteTimeDomainData(buf);
          let sum = 0;
          for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
          const rms   = Math.sqrt(sum / buf.length);
          const floor = 0.025;
          setMeter(Math.min(Math.max((rms - floor) / (SHOUT_RMS - floor), 0), 1));
          if (rms >= SHOUT_RMS) triggerCatch();
          rafId = requestAnimationFrame(check);
        };
        check();
      } catch (e) {
        console.warn('Audio unavailable:', e);
      }
    })();

    // Speech recognition (primary on Android, fallback on iOS)
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SR) {
      const rec = new SR();
      rec.continuous       = true;
      rec.interimResults   = true;
      rec.lang             = 'id-ID';
      rec.maxAlternatives  = 3;

      rec.onresult = (e: any) => {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          for (let j = 0; j < Math.min(e.results[i].length, 3); j++) {
            const t = e.results[i][j].transcript.toLowerCase()
              .replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
            const words = t.split(' ');
            if (words.some((w: string) => w === 'ijo' || w === 'hijau') ||
                t.includes('i jo') || t.includes('hi jau') || t.includes('jau')) {
              triggerCatch();
              return;
            }
          }
        }
      };
      rec.onerror = () => {};
      rec.onend   = () => { if (alive && useStore.getState().gameState === 'playing') { try { rec.start(); } catch {} } };
      try { rec.start(); speechRef.current = rec; } catch {}
    }

    return () => {
      alive = false;
      if (rafId !== null) cancelAnimationFrame(rafId);
      if (audioCtx)       audioCtx.close();
      if (speechRef.current) { try { speechRef.current.stop(); } catch {} speechRef.current = null; }
      setMeter(0);
    };
  }, [gameState]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── result screen setup ──────────────────────────────────────────────────
  useEffect(() => {
    if (gameState !== 'gameover') return;
    setScoreSaved(false);
    setShowSaveModal(false);
    setSaveMsg('');
    setPlayerEmail('');

    // 5-second play-again cooldown
    let cd = PLAY_AGAIN_COOLDOWN;
    setPlayAgainOff(true);
    setPlayAgainLabel(`MAIN LAGI (${cd})`);
    const iv = setInterval(() => {
      cd--;
      if (cd <= 0) {
        clearInterval(iv);
        setPlayAgainOff(false);
        setPlayAgainLabel('MAIN LAGI');
      } else {
        setPlayAgainLabel(`MAIN LAGI (${cd})`);
      }
    }, 1000);

    getLeaderboard().then(setLeaderboard).catch(() => setLeaderboard([]));
    return () => clearInterval(iv);
  }, [gameState]);

  // ── start game handler ───────────────────────────────────────────────────
  async function handleStart() {
    // Request fullscreen for better immersion
    try { await document.documentElement.requestFullscreen?.(); } catch {}

    // 1. Try WebXR immersive-ar
    if (navigator.xr) {
      try {
        if (await navigator.xr.isSessionSupported('immersive-ar')) {
          await xrStore.enterAR();
          startGame();
          return;
        }
      } catch {}
    }

    // 2. iOS: request DeviceOrientation permission before starting
    if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
      try {
        const perm = await (DeviceOrientationEvent as any).requestPermission();
        if (perm !== 'granted') {
          setNoticeTitle('Akses Motion Diperlukan');
          setNoticeText('Izinkan akses Motion & Orientation di Safari agar objek 3D mengikuti gerakan HP-mu.');
          setShowNotice(true);
          return;
        }
      } catch {}
    }

    startGame();
  }

  // ── save score handler ───────────────────────────────────────────────────
  async function handleSave() {
    if (scoreSaved || saving) return;
    const name  = playerName.trim();
    const email = playerEmail.trim();

    if (!name) { setSaveMsg('Masukkan nama kamu.'); setSaveMsgCls('error'); return; }
    if (!isValidEmail(email)) { setSaveMsg('Masukkan e-mail yang valid.'); setSaveMsgCls('error'); return; }

    setSaving(true);
    setSaveMsg('Menyimpan skor...');
    setSaveMsgCls('');
    try {
      await submitScore(name, elapsedTime, email);
      setScoreSaved(true);
      setSaveMsg('Skor berhasil disimpan.');
      setSaveMsgCls('success');
      setTimeout(() => setShowSaveModal(false), 700);
      getLeaderboard().then(setLeaderboard).catch(() => {});
    } catch {
      setSaveMsg('Gagal menyimpan skor. Coba lagi.');
      setSaveMsgCls('error');
    }
    setSaving(false);
  }

  // ── share score handler ──────────────────────────────────────────────────
  async function handleShare() {
    try {
      const blob = await buildShareBlob(timeStr);
      const file = new File([blob], 'green-chili-hunt.png', { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title: 'Green Chili Hunt', files: [file] });
      } else if (navigator.share) {
        await navigator.share({ title: 'Green Chili Hunt', text: `Kumpulin 5 cabe ijo dalam ${timeStr}! Bisa lebih cepet?` });
      } else {
        const url  = URL.createObjectURL(blob);
        const link = Object.assign(document.createElement('a'), { href: url, download: 'green-chili-hunt.png' });
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') console.warn('Share error:', e);
    }
  }

  function handleReset() {
    if (speechRef.current) { try { speechRef.current.stop(); } catch {} speechRef.current = null; }
    resetGame();
  }

  const isPlaying  = gameState === 'playing';
  const isGameover = gameState === 'gameover';
  const isIntro    = gameState === 'intro';

  return (
    <>
      {/* ── GAME HUD ─────────────────────────────────────────────────── */}
      <div id="gameHud" className={`game-hud${isPlaying ? '' : ' hidden'}`}>

        <div className="top-hud">
          <div className="timer-card">
            <span className="timer-value">{timeStr}</span>
          </div>
        </div>

        <div
          ref={aimRef}
          className={`aim-area${missEffect ? ' miss' : ''}`}
          style={{ pointerEvents: 'auto', cursor: 'crosshair' }}
          onClick={triggerCatch}
        >
          <div className="target-brackets" aria-hidden="true" />
          <div className="voice-meter" aria-hidden="true">
            <div className="voice-meter-empty" />
            <div className="voice-meter-fill" />
          </div>
          <div className="aim-dot" />
        </div>

        <div className="bottom-hud">
          <div className="score-strip" aria-label="Cabe terkumpul">
            <div className="hud-value">{foundCount}/{TARGET_SCORE}</div>
            <div className="chili-slots" aria-hidden="true">
              {Array.from({ length: TARGET_SCORE }, (_, i) => (
                <img
                  key={i}
                  src={i < foundCount ? CHILI_ACTIVE : CHILI_INACTIVE}
                  alt=""
                  className={`chili-slot${i < foundCount ? ' active' : ''}`}
                />
              ))}
            </div>
          </div>
          <div className="hint-box">
            Gerakkan HP-mu untuk mencari, arahkan targetnya, lalu teriakkan: "IJO!"
          </div>
        </div>
      </div>

      {/* ── INTRO SCREEN ─────────────────────────────────────────────── */}
      <section id="introScreen" className={`screen${isIntro ? ' active' : ''}`}>
        <img src="/assets/ui/bg_home.png" alt="" className="home-bg-image" aria-hidden="true" />
        <div className="intro-card home-card">
          <img src="/assets/ui/logo_brand.png"          alt="Indomie"       className="home-brand-image" />
          <img src="/assets/ui/title_cari_cabe_ijo.png" alt="Cari Cabe Ijo" className="home-title-image" />
          <img src="/assets/ui/ribbon_the_game.png"     alt="The Game"      className="home-ribbon-image" />

          <div className="how-to-box home-panel">
            <p className="intro-desc">
              Temukan cabe ijo yang tersembunyi di antara objek di sekitarmu.
              Gerakkan HP-mu untuk mencari, arahkan targetnya, lalu teriakkan: "IJO!"
            </p>
            <img
              src="/assets/ui/line_header_panel_petunjuk.png"
              alt=""
              className="home-panel-line"
              aria-hidden="true"
            />
            <ul className="home-steps">
              <li>Izinkan akses AR kamera dan mikrofon</li>
              <li>Gerakkan kamera untuk temukan Cabe Ijo</li>
              <li>Arahkan target dan ucapkan "ijo"</li>
              <li>Kumpulkan 5 Cabe Ijo secepat mungkin!</li>
            </ul>
            <button
              id="startBtn"
              className="primary-btn home-start-btn"
              aria-label="Mulai Main"
              onClick={handleStart}
            >
              <img
                src="/assets/ui/btn_mulai_main.png"
                alt=""
                className="home-start-image"
                aria-hidden="true"
              />
            </button>
          </div>
        </div>
      </section>

      {/* ── RESULT SCREEN ────────────────────────────────────────────── */}
      <section id="resultScreen" className={`screen${isGameover ? ' active' : ''}`}>
        <div className="result-card">
          <img src="/assets/ui/logo_brand.png"          alt="Indomie"       className="result-brand-image" />
          <img src="/assets/ui/title_cari_cabe_ijo.png" alt="Cari Cabe Ijo" className="result-title-image" />

          <div className="result-panel">
            <div className="result-score-box">
              <div id="finalScoreText" className="final-score">{timeStr}</div>
            </div>

            <div className={`top-five-info${scoreSaved ? '' : ' hidden'}`}>
              Skor tersimpan di leaderboard
            </div>

            <div className="leaderboard-box">
              <h3>Peringkat 5 Teratas</h3>
              <div id="leaderboardList" className="leaderboard-list">
                {Array.from({ length: 5 }, (_, i) => {
                  const entry = leaderboard[i];
                  return (
                    <div key={i} className="leaderboard-item">
                      <span className="leaderboard-rank">{i + 1}</span>
                      <span className="leaderboard-name">{entry?.playerName ?? '–'}</span>
                      <span className="leaderboard-score">{entry ? formatHudTime(entry.timeMs) : '--:--'}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <button id="shareBtn"    className="secondary-btn result-action-btn" onClick={handleShare}>
              BAGIKAN SKOR
            </button>

            <button
              id="saveScoreBtn"
              className={`secondary-btn result-action-btn${scoreSaved ? ' hidden' : ''}`}
              onClick={() => setShowSaveModal(true)}
            >
              SIMPAN SKOR
            </button>

            <button
              id="playAgainBtn"
              className="primary-btn result-play-btn"
              disabled={playAgainOff}
              onClick={handleReset}
            >
              {playAgainLabel}
            </button>
          </div>
        </div>
      </section>

      {/* ── APP NOTICE ───────────────────────────────────────────────── */}
      <div
        id="appNotice"
        className={`app-notice${showNotice ? '' : ' hidden'}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="appNoticeTitle"
      >
        <div className="app-notice-card">
          <h2 id="appNoticeTitle">{noticeTitle}</h2>
          <p id="appNoticeText">{noticeText}</p>
          <button id="closeAppNoticeBtn" className="primary-btn" onClick={() => setShowNotice(false)}>
            Tutup
          </button>
        </div>
      </div>

      {/* ── SAVE SCORE MODAL ─────────────────────────────────────────── */}
      <div id="saveScoreModal" className={`save-modal${showSaveModal ? '' : ' hidden'}`}>
        <div className="save-modal-card">
          <img src="/assets/ui/logo_brand.png"          alt="Indomie"       className="save-brand-image" />
          <img src="/assets/ui/title_cari_cabe_ijo.png" alt="Cari Cabe Ijo" className="save-title-image" />

          <div className="save-panel">
            <div className="result-score-box save-score-box">
              <div id="modalScoreText" className="modal-score-value">{timeStr}</div>
            </div>

            <label className="name-label" htmlFor="playerNameInput">Nama</label>
            <input
              id="playerNameInput"
              className="name-input"
              type="text"
              maxLength={100}
              placeholder=""
              value={playerName}
              onChange={e => setPlayerName(e.target.value)}
            />

            <label className="name-label email-label" htmlFor="playerEmailInput">E-mail</label>
            <input
              id="playerEmailInput"
              className="name-input"
              type="email"
              maxLength={150}
              placeholder=""
              value={playerEmail}
              onChange={e => setPlayerEmail(e.target.value)}
            />

            <p className="email-note">
              Mohon masukkan e-mail yang benar. E-mail digunakan untuk penukaran hadiah.
            </p>

            <div id="saveMessage" className={`save-message${saveMsgCls ? ` ${saveMsgCls}` : ''}`}>
              {saveMsg}
            </div>

            <button
              id="submitScoreBtn"
              className="primary-btn"
              disabled={saving || scoreSaved}
              onClick={handleSave}
            >
              SIMPAN
            </button>

            <button
              id="closeSaveModalBtn"
              className="secondary-btn"
              onClick={() => setShowSaveModal(false)}
            >
              BATAL
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
