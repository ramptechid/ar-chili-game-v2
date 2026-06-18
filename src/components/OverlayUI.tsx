import { useEffect, useRef, useState } from 'react';
import { useStore, GAME_DURATION_MS, formatHudTime } from '../store/useStore';
import { submitScore, getLeaderboard, LeaderboardEntry } from '../lib/api';
import { xrStore } from '../store/xr';
import { asset } from '../lib/asset';

const CATCH_COOLDOWN_MS  = 750;
const PLAY_AGAIN_COOLDOWN = 5;

function isValidInstagram(ig: string) {
  return /^[a-zA-Z0-9._]{1,30}$/.test(ig);
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

function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const s  = Math.max(w / img.width, h / img.height);
  const sw = w / s;
  const sh = h / s;
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
}

async function loadOptionalImg(src: string): Promise<HTMLImageElement | null> {
  try {
    return await loadImg(src);
  } catch {
    return null;
  }
}

async function buildShareBlob(score: number): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width  = 1080;
  canvas.height = 1920;
  const ctx = canvas.getContext('2d')!;

  try {
    await document.fonts?.ready;

    const [bg, logo, panel, footer] = await Promise.all([
      loadImg(asset('assets/ui/bg_home_new.png')),
      loadImg(asset('assets/ui/logo_result_new.png')),
      loadImg(asset('assets/ui/pane_total.png')),
      loadOptionalImg(asset('assets/ui/footer_text_share.png')),
    ]);

    drawCover(ctx, bg, 0, 0, 1080, 1920);
    drawContain(ctx, logo, 180, 210, 720, 600);
    drawContain(ctx, panel, 255, 790, 570, 390);

    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#79ff5a';
    ctx.font      = '900 180px Saira, Arial, Helvetica, sans-serif';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.32)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 8;
    ctx.fillText(`${score}`, 540, 1038);
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    ctx.fillStyle = '#fff';
    ctx.font      = 'italic 900 56px Saira, Arial, Helvetica, sans-serif';
    ctx.fillText('YAKIN BISA NGALAHIN AKU?', 540, 1255);
    ctx.fillText('SINI BUKTIIN.', 540, 1316);

    if (footer) {
      drawContain(ctx, footer, 205, 1375, 670, 250);
    } else {
      ctx.fillStyle = '#fff';
      ctx.font = '900 86px Saira, Arial, Helvetica, sans-serif';
      ctx.fillText('MAIN SEKARANG', 540, 1430);
      ctx.fillStyle = '#073a1a';
      ctx.font = '900 54px Saira, Arial, Helvetica, sans-serif';
      ctx.fillText('cabeijogame.com', 540, 1538);
    }
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
  const { gameState, elapsedTime, score, scoreCabe, scorePack, scoreJumbo, startGame, setGameState, playerName, setPlayerName, resetGame } = useStore();

  const [leaderboard,    setLeaderboard]    = useState<LeaderboardEntry[]>([]);
  const [showNotice,     setShowNotice]     = useState(false);
  const [noticeTitle,    setNoticeTitle]    = useState('');
  const [noticeText,     setNoticeText]     = useState('');
  const [showSaveModal,  setShowSaveModal]  = useState(false);
  const [playerInstagram, setPlayerInstagram] = useState('');
  const [saveMsg,        setSaveMsg]        = useState('');
  const [saveMsgCls,     setSaveMsgCls]     = useState('');
  const [scoreSaved,     setScoreSaved]     = useState(false);
  const [saving,         setSaving]         = useState(false);
  const [playAgainOff,   setPlayAgainOff]   = useState(false);
  const [playAgainLabel, setPlayAgainLabel] = useState('MAIN LAGI');
  const [showPlusOne,    setShowPlusOne]    = useState(false);
  const [plusPoints,     setPlusPoints]     = useState(1);
  const [scoreCabeBump,  setScoreCabeBump]  = useState(false);
  const [scorePackBump,  setScorePackBump]  = useState(false);
  const [scoreJumboBump, setScoreJumboBump] = useState(false);
  const [catchFlash,   setCatchFlash]   = useState(false);
  const [showPauseMenu,    setShowPauseMenu]    = useState(false);
  const [showLeaderboard,  setShowLeaderboard]  = useState(false);
  const [countdownStep,    setCountdownStep]    = useState<3|2|1|'mulai'|null>(null);
  const [introVisible,     setIntroVisible]     = useState(true);

  const aimRef        = useRef<HTMLDivElement>(null);
  const lastCatchRef  = useRef(0);
  const prevScoreRef  = useRef(score);
  const pauseStartRef = useRef(0);
  const countdownTimersRef = useRef<number[]>([]);

  const remainMs  = Math.max(0, GAME_DURATION_MS - elapsedTime);
  const remainSec = Math.ceil(remainMs / 1000);
  const isUrgent  = remainSec <= 10 && remainSec > 0;

  useEffect(() => () => clearCountdownTimers(), []);

  // ── catch success effects ────────────────────────────────────────────────
  useEffect(() => {
    if (score > prevScoreRef.current) {
      const gained = score - prevScoreRef.current;
      setPlusPoints(gained);
      setShowPlusOne(true);
      setCatchFlash(true);
      if (gained === 1) { setScoreCabeBump(true);  setTimeout(() => setScoreCabeBump(false),  420); }
      else if (gained === 3) { setScorePackBump(true);  setTimeout(() => setScorePackBump(false),  420); }
      else if (gained === 5) { setScoreJumboBump(true); setTimeout(() => setScoreJumboBump(false), 420); }
      const t1 = setTimeout(() => setShowPlusOne(false), 900);
      const t3 = setTimeout(() => setCatchFlash(false), 280);
      prevScoreRef.current = score;
      return () => { clearTimeout(t1); clearTimeout(t3); };
    }
    prevScoreRef.current = score;
  }, [score]);

  function triggerCatch() {
    const now = Date.now();
    if (now - lastCatchRef.current < CATCH_COOLDOWN_MS) return;
    lastCatchRef.current = now;
    window.dispatchEvent(new CustomEvent('try-catch'));
  }

  // ── timer tick (stops while pause menu is open) ─────────────────────────
  useEffect(() => {
    if (gameState !== 'playing' || showPauseMenu) return;
    const id = setInterval(() => useStore.getState().tickTimer(), 100);
    return () => clearInterval(id);
  }, [gameState, showPauseMenu]);


  // ── result screen setup ──────────────────────────────────────────────────
  useEffect(() => {
    if (gameState === 'intro') {
      setIntroVisible(true);
      setShowPlusOne(false);
      setPlusPoints(1);
      setScoreCabeBump(false);
      setScorePackBump(false);
      setScoreJumboBump(false);
      setCatchFlash(false);
      setCountdownStep(null);
      prevScoreRef.current = 0;
      return;
    }
    if (gameState !== 'gameover') return;
    setScoreSaved(false);
    setShowSaveModal(true);
    setShowLeaderboard(false);
    setSaveMsg('');
    setPlayerInstagram('');

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

  // ── countdown then start ─────────────────────────────────────────────────
  const COUNTDOWN_IMG: Record<string, string> = {
    '3': asset('assets/ui/angka_3.png'),
    '2': asset('assets/ui/angka_2.png'),
    '1': asset('assets/ui/angka_1.png'),
    mulai: asset('assets/ui/mulai.png'),
  };

  async function requestFullscreenMode() {
    const el = document.documentElement as any;
    try {
      if (!document.fullscreenElement && el.requestFullscreen) {
        await el.requestFullscreen({ navigationUI: 'hide' });
      } else if (!document.fullscreenElement && el.webkitRequestFullscreen) {
        el.webkitRequestFullscreen();
      }
    } catch {}
  }

  function clearCountdownTimers() {
    countdownTimersRef.current.forEach(id => window.clearTimeout(id));
    countdownTimersRef.current = [];
  }

  function runCountdown(options: { fullscreen?: boolean } = {}) {
    clearCountdownTimers();
    if (options.fullscreen) void requestFullscreenMode();
    setGameState('countdown');
    setCountdownStep(3);
    countdownTimersRef.current = [
      window.setTimeout(() => setCountdownStep(2),        900),
      window.setTimeout(() => setCountdownStep(1),       1800),
      window.setTimeout(() => setCountdownStep('mulai'), 2700),
      window.setTimeout(() => {
        setCountdownStep(null);
        startGame();
        countdownTimersRef.current = [];
      }, 3600),
    ];
  }

  // ── start game handler ───────────────────────────────────────────────────
  async function handleStart() {
    setIntroVisible(false);

    // Lock portrait orientation (Android Chrome + some iOS contexts)
    try {
      await (screen.orientation as any)?.lock?.('portrait-primary');
    } catch {}

    // iOS Safari: force hide address bar via scroll (within user-gesture context)
    try {
      document.body.style.height = `${window.screen.height}px`;
      window.scrollTo({ top: 1, behavior: 'instant' as ScrollBehavior });
      setTimeout(() => { window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior }); }, 80);
      setTimeout(() => { document.body.style.height = ''; }, 500);
    } catch {}

    // WebXR path — enterAR() handles camera permission internally
    if (navigator.xr) {
      try {
        if (await navigator.xr.isSessionSupported('immersive-ar')) {
          await xrStore.enterAR();
          runCountdown();
          return;
        }
      } catch {}
    }

    // Non-WebXR: request camera permission first
    if (navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        });
        stream.getTracks().forEach(t => t.stop());
        await requestFullscreenMode();
      } catch {
        setNoticeTitle('Akses Kamera Diperlukan');
        setNoticeText('Izinkan akses kamera agar tampilan AR bisa aktif.');
        setShowNotice(true);
        setIntroVisible(true);
        return;
      }
    }

    // iOS Safari: device orientation permission
    if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
      try {
        const perm = await (DeviceOrientationEvent as any).requestPermission();
        if (perm !== 'granted') {
          setNoticeTitle('Akses Motion Diperlukan');
          setNoticeText('Izinkan akses Motion & Orientation di Safari agar objek 3D mengikuti gerakan HP-mu.');
          setShowNotice(true);
          setIntroVisible(true);
          return;
        }
      } catch {}
    }

    // Semua permission granted → countdown → game timer mulai setelah countdown selesai
    runCountdown({ fullscreen: !navigator.mediaDevices?.getUserMedia });
  }

  // ── save score handler ───────────────────────────────────────────────────
  async function handleSave() {
    if (scoreSaved || saving) return;
    const name = playerName.trim();
    const ig   = playerInstagram.trim().replace(/^@/, '');

    if (!name) { setSaveMsg('Masukkan nama kamu.'); setSaveMsgCls('error'); return; }
    if (!isValidInstagram(ig)) { setSaveMsg('Masukkan username Instagram yang valid (tanpa @, maks 30 karakter).'); setSaveMsgCls('error'); return; }

    setSaving(true);
    setSaveMsg('Menyimpan skor...');
    setSaveMsgCls('');
    try {
      const playerRank = await submitScore(name, score, ig);
      (window as any).__pRank = playerRank;
      setScoreSaved(true);
      setSaveMsg('Skor berhasil disimpan!');
      setSaveMsgCls('success');
      getLeaderboard()
        .then(lb => { setLeaderboard(lb); })
        .catch(() => {})
        .finally(() => setTimeout(() => setShowLeaderboard(true), 600));
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

  function handlePauseClick() {
    pauseStartRef.current = Date.now();
    setShowPauseMenu(true);
  }

  function handlePauseResume() {
    const pausedDuration = Date.now() - pauseStartRef.current;
    useStore.setState((s: any) => ({
      startTime: s.startTime != null ? s.startTime + pausedDuration : null,
    }));
    setShowPauseMenu(false);
  }

  function handlePauseRestart() {
    setShowPauseMenu(false);
    clearCountdownTimers();
    resetGame();
    setShowPlusOne(false);
    setPlusPoints(1);
    setScoreCabeBump(false);
    setScorePackBump(false);
    setScoreJumboBump(false);
    setCatchFlash(false);
    prevScoreRef.current = 0;
  }

  function handleReset() {
    clearCountdownTimers();
    resetGame();
    setShowPlusOne(false);
    setPlusPoints(1);
    setScoreCabeBump(false);
    setScorePackBump(false);
    setScoreJumboBump(false);
    setCatchFlash(false);
    setCountdownStep(null);
    prevScoreRef.current = 0;
  }

  const isPlaying   = gameState === 'playing';
  const isCountdown = gameState === 'countdown';
  const isGameover  = gameState === 'gameover';
  const isIntro     = gameState === 'intro';

  return (
    <>
      {/* ── GAME HUD ─────────────────────────────────────────────────── */}
      <div id="gameHud" className={`game-hud${(isPlaying || isCountdown) ? '' : ' hidden'}`}>

        <div className="top-hud">
          <div className="hud-spacer" aria-hidden="true" />
          <div className="timer-card">
            <span className={`timer-value${isUrgent ? ' urgent' : ''}`}>{formatHudTime(remainMs)}</span>
          </div>
          <button
            className="hud-pause-btn"
            onClick={handlePauseClick}
            aria-label="Jeda game"
            disabled={isCountdown}
            style={isCountdown ? { opacity: 0.4, pointerEvents: 'none' } : undefined}
          >
            <img src={asset('assets/ui/btn_pause.png')} alt="" className="hud-pause-img" aria-hidden="true" />
          </button>
        </div>

        {/* Floating +1 */}
        {showPlusOne && (
          <div className={`plus-one${plusPoints >= 5 ? ' plus-three' : plusPoints >= 3 ? ' plus-two' : ''}`} key={`p1-${score}`}>+{plusPoints}</div>
        )}

        {isPlaying && (
          <div
            ref={aimRef}
            className={`aim-area${catchFlash ? ' catch-flash' : ''}`}
          >
            <img src={asset('assets/ui/target_brackets.png')} alt="" className="aim-brackets" aria-hidden="true" />
            <img
              src={asset('assets/ui/voice_meter_track.png')}
              alt=""
              className="aim-track"
              aria-hidden="true"
              onPointerDown={triggerCatch}
            />
            <div className="aim-dot" />
          </div>
        )}

        {/* Score badges below aim ring */}
        <div className="score-frames-wrap">
          <div className="score-frames-row">
            {/* Cabe — +1 */}
            <div className="score-frame-item score-frame-item--cabe">
              <img src={asset('assets/ui/frame_score_cabe.png')} alt="" className="score-frame-single" aria-hidden="true" />
              <div className="score-frame-anchor score-frame-anchor--cabe">
                <span className={`score-frame-num${scoreCabeBump ? ' bump' : ''}`} key={`sc-cabe-${scoreCabe}`}>{scoreCabe}</span>
              </div>
            </div>
            {/* Pack Reguler — +3 */}
            <div className="score-frame-item score-frame-item--pack">
              <img src={asset('assets/ui/frame_score_pack_reguler.png')} alt="" className="score-frame-single" aria-hidden="true" />
              <div className="score-frame-anchor score-frame-anchor--pack">
                <span className={`score-frame-num${scorePackBump ? ' bump' : ''}`} key={`sc-pack-${scorePack}`}>{scorePack}</span>
              </div>
            </div>
            {/* Pack Jumbo — +5 */}
            <div className="score-frame-item score-frame-item--jumbo">
              <img src={asset('assets/ui/frame_score_pack_jumbo.png')} alt="" className="score-frame-single" aria-hidden="true" />
              <div className="score-frame-anchor score-frame-anchor--jumbo">
                <span className={`score-frame-num${scoreJumboBump ? ' bump' : ''}`} key={`sc-jumbo-${scoreJumbo}`}>{scoreJumbo}</span>
              </div>
            </div>
          </div>
          <img src={asset('assets/ui/footer.svg')} alt="" className="hud-footer-img" aria-hidden="true" />
        </div>
      </div>

      {/* ── PAUSE MENU ───────────────────────────────────────────────── */}
      {showPauseMenu && (
        <div className="pause-overlay" role="dialog" aria-modal="true">
          <img src={asset('assets/ui/BG-Pause-Game.svg')} alt="" className="pause-bg" aria-hidden="true" />
          <div className="pause-panel-wrap">
            <img src={asset('assets/ui/panel-pause-game.svg')} alt="" className="pause-panel-img" aria-hidden="true" />
            <div className="pause-btns">
              <button className="pause-btn" onClick={handlePauseResume} aria-label="Lanjut Main">
                <img src={asset('assets/ui/button-lanjut-main.svg')} alt="Lanjut Main" className="pause-btn-img" />
              </button>
              <button className="pause-btn" onClick={handlePauseRestart} aria-label="Restart">
                <img src={asset('assets/ui/button-restart.svg')} alt="Restart" className="pause-btn-img" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── INTRO SCREEN ─────────────────────────────────────────────── */}
      <section id="introScreen" className={`screen${isIntro && introVisible ? ' active' : ''}`}>
        <img src={asset('assets/ui/bg_home_new.png')} alt="" className="home-bg-image" aria-hidden="true" />
        <div className="intro-card home-card">
          <img src={asset('assets/ui/logo_share_result.png')} alt="Cabe Ijo Game" className="home-logo-image" />
          <div className="home-panel-wrap">
            <img src={asset('assets/ui/panel_petunjuk.svg')} alt="Petunjuk" className="home-panel-image" />
            <button
              id="startBtn"
              className="home-start-btn"
              aria-label="Mulai Main"
              onClick={handleStart}
            >
              <img src={asset('assets/ui/button_petunjuk.png')} alt="Mulai Main" className="home-start-image" />
            </button>
          </div>
        </div>
      </section>

      {/* ── RESULT SCREEN (hidden — save modal handles game over flow) ── */}
      <section id="resultScreen" className="screen">
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
          <img src={asset('assets/ui/logo_result_new.png')} alt="Cabe Ijo Game" className="save-result-logo" />

          {showLeaderboard ? (
            /* ── LEADERBOARD VIEW ── */
            <div className="lb-panel">
              <div className="lb-title">PENCARIAN SELESAI!</div>

              <div className="lb-badge">
                <span className="lb-badge-val">{score}</span>
              </div>

              <div className="lb-subtitle">Peringkat 5 Teratas</div>

              <div className="lb-list">
                {leaderboard.length === 0 ? (
                  <div className="lb-empty">Belum ada data</div>
                ) : leaderboard.slice(0, 5).map((entry, i) => (
                  <div key={entry.id ?? i} className="lb-row">
                    <span className="lb-row-rank">{i + 1}</span>
                    <span className="lb-row-name">{entry.playerName}</span>
                    <span className="lb-row-score">{entry.score}</span>
                  </div>
                ))}
              </div>

              <img className="lb-sep" src={asset('assets/ui/line_score_new.png')} alt="" />

              <div className="lb-row lb-myrow">
                <span className="lb-row-rank">
                  {(window as any).__pRank || (leaderboard.findIndex(e => e.playerName === playerName && e.score === score) + 1) || '—'}
                </span>
                <span className="lb-row-name">{playerName}</span>
                <span className="lb-row-score">{score}</span>
              </div>

              <p className="lb-note">
                Top 100 akan mendapatkan hadiah! tunggu informasinya di instagram @indomie
              </p>

              <button className="lb-btn-share" onClick={handleShare}>
                <img src={asset('assets/ui/button_bagikan_score_new.png')} alt="Bagikan Skor" />
              </button>
              <button
                className="lb-btn-play"
                disabled={playAgainOff}
                onClick={() => { setPlayerName(''); setPlayerInstagram(''); setShowSaveModal(false); setShowLeaderboard(false); handleReset(); }}
              >
                <img src={asset('assets/ui/button_main_lagi_new.png')} alt="Main Lagi" />
              </button>
            </div>
          ) : (
            /* ── FORM VIEW ── */
            <div className="save-panel">
              <div className="save-total-box">
                <div id="modalScoreText" className="modal-score-value">{score}</div>
              </div>

              <label className="sr-only" htmlFor="playerNameInput">Nama</label>
              <input
                id="playerNameInput"
                className="name-input"
                type="text"
                maxLength={100}
                placeholder=""
                value={playerName}
                onChange={e => setPlayerName(e.target.value)}
              />

              <label className="sr-only" htmlFor="playerInstagramInput">
                Username Instagram
              </label>
              <div className="instagram-input-wrap">
                <span className="instagram-at">@</span>
                <input
                  id="playerInstagramInput"
                  className="name-input instagram-input"
                  type="text"
                  maxLength={30}
                  placeholder=""
                  autoCapitalize="none"
                  autoCorrect="off"
                  value={playerInstagram}
                  onChange={e => setPlayerInstagram(e.target.value.replace(/^@/, ''))}
                />
              </div>

              <div id="saveMessage" className={`save-message${saveMsgCls ? ` ${saveMsgCls}` : ''}`}>
                {saveMsg}
              </div>

              <button
                id="submitScoreBtn"
                className="save-image-btn"
                disabled={saving || scoreSaved}
                onClick={handleSave}
                aria-label="Simpan"
              >
                <img src={asset('assets/ui/button_simpan_new.png')} alt="Simpan" />
              </button>

              {isGameover ? (
                <button
                  id="playAgainBtn"
                  className="save-image-btn save-image-btn--secondary"
                  disabled={playAgainOff}
                  onClick={() => { setShowSaveModal(false); handleReset(); }}
                  aria-label="Batal"
                >
                  <img src={asset('assets/ui/button_batal_new.png')} alt="Batal" />
                </button>
              ) : (
                <button
                  id="closeSaveModalBtn"
                  className="save-image-btn save-image-btn--secondary"
                  onClick={() => setShowSaveModal(false)}
                  aria-label="Batal"
                >
                  <img src={asset('assets/ui/button_batal_new.png')} alt="Batal" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      {/* ── COUNTDOWN OVERLAY ───────────────────────────────────────── */}
      {countdownStep !== null && (
        <div className="countdown-overlay">
          <img
            key={String(countdownStep)}
            src={COUNTDOWN_IMG[String(countdownStep)]}
            alt={String(countdownStep)}
            className="countdown-img"
          />
        </div>
      )}
    </>
  );
}
