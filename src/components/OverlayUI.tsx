import { useEffect, useRef, useState } from 'react';
import { useStore, GAME_DURATION_MS } from '../store/useStore';
import { submitScore, getLeaderboard, LeaderboardEntry } from '../lib/firebase';
import { xrStore } from '../store/xr';
import { asset } from '../lib/asset';

const CATCH_COOLDOWN_MS  = 750;
const PLAY_AGAIN_COOLDOWN = 5;

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

async function buildShareBlob(score: number): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width  = 1080;
  canvas.height = 1920;
  const ctx = canvas.getContext('2d')!;

  try {
    const [bg, logo, frame, footer] = await Promise.all([
      loadImg(asset('assets/ui/bg_share_result.png')),
      loadImg(asset('assets/ui/logo_share_result.png')),
      loadImg(asset('assets/ui/frame_durasi_share.png')),
      loadImg(asset('assets/ui/footer_share.png')),
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
    ctx.font         = '900 148px Saira, Arial, Helvetica, sans-serif';
    ctx.fillText(`${score}`, 540, 1080);
    ctx.font         = '900 58px Saira, Arial, Helvetica, sans-serif';
    ctx.fillText('CABE!', 540, 1170);
    ctx.fillStyle    = '#ffffff';
    ctx.font         = 'italic 900 34px Saira, Arial, Helvetica, sans-serif';
    ctx.fillText('BISA LEBIH BANYAK?', 540, 1432);
  } catch {
    ctx.fillStyle = '#041006';
    ctx.fillRect(0, 0, 1080, 1920);
    ctx.fillStyle = '#70ff70';
    ctx.font      = '900 96px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${score} CABE`, 540, 960);
  }

  return new Promise(resolve => canvas.toBlob(b => resolve(b!), 'image/png'));
}

export function OverlayUI() {
  const { gameState, elapsedTime, score, startGame, playerName, setPlayerName, resetGame } = useStore();

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
  const [showPlusOne,    setShowPlusOne]    = useState(false);
  const [scoreBumping,   setScoreBumping]   = useState(false);
  const [catchFlash,     setCatchFlash]     = useState(false);

  const aimRef       = useRef<HTMLDivElement>(null);
  const lastCatchRef = useRef(0);
  const prevScoreRef = useRef(score);

  const remainMs  = Math.max(0, GAME_DURATION_MS - elapsedTime);
  const remainSec = Math.ceil(remainMs / 1000);
  const isUrgent  = remainSec <= 10 && remainSec > 0;

  // ── catch success effects ────────────────────────────────────────────────
  useEffect(() => {
    if (score > prevScoreRef.current) {
      setShowPlusOne(true);
      setScoreBumping(true);
      setCatchFlash(true);
      const t1 = setTimeout(() => setShowPlusOne(false), 900);
      const t2 = setTimeout(() => setScoreBumping(false), 420);
      const t3 = setTimeout(() => setCatchFlash(false), 280);
      prevScoreRef.current = score;
      return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
    }
    prevScoreRef.current = score;
  }, [score]);

  function triggerCatch() {
    const now = Date.now();
    if (now - lastCatchRef.current < CATCH_COOLDOWN_MS) return;
    lastCatchRef.current = now;
    window.dispatchEvent(new CustomEvent('try-catch'));
  }

  // ── miss animation ───────────────────────────────────────────────────────
  useEffect(() => {
    const onMiss = () => {
      setMissEffect(true);
      setTimeout(() => setMissEffect(false), 320);
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


  // ── result screen setup ──────────────────────────────────────────────────
  useEffect(() => {
    if (gameState !== 'gameover') return;
    setScoreSaved(false);
    setShowSaveModal(false);
    setSaveMsg('');
    setPlayerEmail('');

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
    try { await document.documentElement.requestFullscreen?.(); } catch {}

    if (navigator.xr) {
      try {
        if (await navigator.xr.isSessionSupported('immersive-ar')) {
          await xrStore.enterAR();
          startGame();
          return;
        }
      } catch {}
    }

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
      await submitScore(name, score, email);
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
      const blob = await buildShareBlob(score);
      const file = new File([blob], 'cari-cabe-ijo.png', { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title: 'Cari Cabe Ijo', files: [file] });
      } else if (navigator.share) {
        await navigator.share({ title: 'Cari Cabe Ijo', text: `Berhasil tangkap ${score} cabe dalam 30 detik! Bisa lebih banyak?` });
      } else {
        const url  = URL.createObjectURL(blob);
        const link = Object.assign(document.createElement('a'), { href: url, download: 'cari-cabe-ijo.png' });
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
          {/* Countdown */}
          <div className="timer-card">
            <div className="timer-label">WAKTU</div>
            <span className={`timer-value${isUrgent ? ' urgent' : ''}`}>{remainSec}</span>
          </div>
          {/* Score */}
          <div className="score-card">
            <div className="score-label">CABE</div>
            <span className={`score-value${scoreBumping ? ' bump' : ''}`} key={`sc-${score}`}>
              {score}
            </span>
          </div>
        </div>

        {/* Floating +1 */}
        {showPlusOne && (
          <div className="plus-one" key={`p1-${score}`}>+1</div>
        )}

        <div
          ref={aimRef}
          className={`aim-area${missEffect ? ' miss' : ''}${catchFlash ? ' catch-flash' : ''}`}
          style={{ pointerEvents: 'auto', cursor: 'crosshair' }}
          onClick={triggerCatch}
        >
          <div className="target-brackets" aria-hidden="true" />
          <div className="aim-dot" />
        </div>

        <div className="bottom-hud">
          <div className="bottom-hud-inner">
            <button
              className="catch-btn"
              onPointerDown={triggerCatch}
              aria-label="Tangkap cabe"
            >
              <img src={asset('assets/ui/chili_hud_active.png')} alt="" className="catch-btn-icon" aria-hidden="true" />
              TANGKAP!
            </button>
            <div className="hint-box">
              Tangkap cabe sebanyak-banyaknya dalam 30 detik!
            </div>
          </div>
        </div>
      </div>

      {/* ── INTRO SCREEN ─────────────────────────────────────────────── */}
      <section id="introScreen" className={`screen${isIntro ? ' active' : ''}`}>
        <img src={asset('assets/ui/bg_home.png')} alt="" className="home-bg-image" aria-hidden="true" />
        <div className="intro-card home-card">
          <img src={asset('assets/ui/logo_brand.png')}          alt="Indomie"       className="home-brand-image" />
          <img src={asset('assets/ui/title_cari_cabe_ijo.png')} alt="Cari Cabe Ijo" className="home-title-image" />
          <img src={asset('assets/ui/ribbon_the_game.png')}     alt="The Game"      className="home-ribbon-image" />

          <div className="how-to-box home-panel">
            <p className="intro-desc">
              Tangkap cabe ijo sebanyak-banyaknya dalam <b>30 detik</b>!
              Gerakkan HP-mu untuk mencari, arahkan aim ke cabe, lalu tekan tombol <b>TANGKAP!</b>
            </p>
            <img
              src={asset('assets/ui/line_header_panel_petunjuk.png')}
              alt=""
              className="home-panel-line"
              aria-hidden="true"
            />
            <ul className="home-steps">
              <li>Izinkan akses kamera dan AR</li>
              <li>Gerakkan kamera untuk menemukan Cabe Ijo</li>
              <li>Arahkan lingkaran aim tepat ke cabe</li>
              <li>Tekan tombol TANGKAP! untuk menangkap</li>
              <li>Kumpulkan sebanyak mungkin dalam 30 detik!</li>
            </ul>
            <button
              id="startBtn"
              className="primary-btn home-start-btn"
              aria-label="Mulai Main"
              onClick={handleStart}
            >
              <img
                src={asset('assets/ui/btn_mulai_main.png')}
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
          <img src={asset('assets/ui/logo_brand.png')}          alt="Indomie"       className="result-brand-image" />
          <img src={asset('assets/ui/title_cari_cabe_ijo.png')} alt="Cari Cabe Ijo" className="result-title-image" />

          <div className="result-panel">
            <div className="result-score-box">
              <div className="result-label">CABE TERTANGKAP</div>
              <div id="finalScoreText" className="final-score">{score}</div>
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
                      <span className="leaderboard-score">{entry != null ? `${entry.score}` : '--'}</span>
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
          <img src={asset('assets/ui/logo_brand.png')}          alt="Indomie"       className="save-brand-image" />
          <img src={asset('assets/ui/title_cari_cabe_ijo.png')} alt="Cari Cabe Ijo" className="save-title-image" />

          <div className="save-panel">
            <div className="result-score-box save-score-box">
              <div className="modal-score-label">CABE TERTANGKAP</div>
              <div id="modalScoreText" className="modal-score-value">{score}</div>
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
