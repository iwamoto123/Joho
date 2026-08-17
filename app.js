/* =========================================================================
   app.js — 生徒用ビュー（穴埋め・ドラッグ&ドロップ・採点・アニメーション）
   ========================================================================= */
(function () {
  'use strict';

  const $ = (s, r) => (r || document).querySelector(s);
  const app = $('#app');
  const tray = $('#tray');
  const chipsEl = $('#chips');

  /* ---------------- utils ---------------- */
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const norm = (s) => window.DNCL.normalize(String(s == null ? '' : s)).replace(/\s+/g, '');

  function progKey(setId) { return 'joho-prog:' + setId; }
  function getProgress(setId) {
    try { return JSON.parse(localStorage.getItem(progKey(setId)) || '{}'); } catch (e) { return {}; }
  }
  function setProgress(setId, probId, ok) {
    const p = getProgress(setId); p[probId] = ok;
    try { localStorage.setItem(progKey(setId), JSON.stringify(p)); } catch (e) {}
  }

  /* ---------------- syntax highlight ---------------- */
  const KEYWORDS = [
    'そうでなくもし', 'そうでなければ', 'ずつ増やしながら繰り返す', 'ずつ減らしながら繰り返す',
    'ながら繰り返す', 'の間繰り返す', '繰り返す', 'ならば', 'もし', 'から', 'まで', 'ずつ',
    'のすべての値を', 'にする', 'の間'
  ];
  const FUNCS = ['表示する', '要素数', '切り捨て', '切り上げ', '四捨五入', '絶対値', '乱数', '整数'];

  function hlPlain(raw) {
    let e = esc(raw);
    e = e.replace(/(\d+(?:\.\d+)?)/g, '<span class="tok-num">$1</span>');
    for (const f of FUNCS) e = e.split(f).join('<span class="tok-fn">' + f + '</span>');
    for (const k of KEYWORDS) e = e.split(k).join('<span class="tok-kw">' + k + '</span>');
    return e;
  }
  function hl(raw) {
    const parts = String(raw).split(/("[^"]*")/g);
    return parts.map((p, i) => (i % 2 ? '<span class="tok-str">' + esc(p) + '</span>' : hlPlain(p))).join('');
  }

  /* =========================================================================
     問題ビュー
     ========================================================================= */
  const State = {
    prob: null, set: null, filled: {}, graded: false,
    anim: { steps: [], i: -1, timer: null, playing: false, speed: 850, error: null }
  };

  function renderProblem(set, prob, navHref) {
    State.set = set; State.prob = prob; State.filled = {}; State.graded = false;
    stopAnim();

    const blanks = prob.blanks || [];
    const idxOf = {}; blanks.forEach(b => { idxOf[b.id] = b; });

    let dataHtml = '';
    if (set && set.dataTable) {
      const dt = set.dataTable;
      dataHtml = '<div class="tablewrap"><table class="data"><tr>' +
        dt.head.map(h => '<th>' + esc(h) + '</th>').join('') + '</tr>' +
        dt.rows.map(r => '<tr>' + r.map(c => '<td>' + esc(c) + '</td>').join('') + '</tr>').join('') +
        '</table></div>';
    }

    app.innerHTML = `
      ${navHref || ''}
      <div class="cols">
        <div>
          <div class="card">
            <h2>${esc(prob.title)}</h2>
            <p class="q-text">${prob.question}</p>
            ${dataHtml}
            <div class="btns">
              <button id="hintbtn">ヒントを見る</button>
            </div>
            <div class="hintbox" id="hintbox">${esc(prob.hint || '')}</div>
          </div>

          <div class="card">
            <h2>プログラム（空欄を埋めよう）</h2>
            <div class="codebox" id="code"></div>
            <div class="btns">
              <button class="primary" id="answerbtn">回答する</button>
              <button class="accent only-sp" id="openanim">▶ 動きを見る</button>
              <button id="clearbtn">全部消す</button>
              <button id="fillbtn" style="display:none">正解を入れて動きを見る</button>
            </div>
            <div class="result" id="result"></div>
          </div>

          <div class="pager" id="pager"></div>
        </div>

        <div id="animpanel">
          <div class="card">
            <div class="anim-head">
              <h2>動きを見る（アニメーション）</h2>
              <button class="only-sp closeanim" id="closeanim">✕ 閉じる</button>
            </div>
            <p class="muted hide-sp" style="margin:0 0 8px">空欄を埋めてから再生すると、1行ずつ何が起きているかを追えます。</p>
            <div class="anim-ctrl">
              <button class="accent" id="playbtn">▶ アニメーション開始</button>
              <button class="icon" id="stepbtn" title="1ステップ進む">⏭</button>
              <button class="icon" id="resetbtn" title="最初から">⏮</button>
              <label class="muted hide-sp" style="font-size:12px">速さ</label>
              <input type="range" id="speed" min="500" max="3200" step="100" value="1500">
              <span class="pos" id="pos">- / -</span>
            </div>
            <div class="pbar"><i id="pfill"></i></div>
            <div class="narration" id="narr"><span class="muted">「動きを見る」を押すと、ここに今どの行で何が起きているかが出ます。</span></div>
            <h3>変数と配列のようす
              <span class="legend"><i class="lg src"></i>読んだ場所 <i class="lg dst"></i>変わった場所</span></h3>
            <div class="vars" id="vars"><span class="muted">まだ実行していません</span></div>
            <h3>表示（出力）</h3>
            <div class="console" id="console"><span class="ph">（まだ何も表示されていません）</span></div>
          </div>
        </div>
      </div>
    `;

    renderCode(prob);
    tray.hidden = false;
    tray.classList.remove('collapsed');
    $('#traytoggle').textContent = '▼';
    renderChips(prob);
    setTimeout(syncTrayHeight, 0);

    $('#hintbtn').onclick = () => {
      const b = $('#hintbox');
      b.classList.toggle('show');
      $('#hintbtn').textContent = b.classList.contains('show') ? 'ヒントを閉じる' : 'ヒントを見る';
    };
    $('#answerbtn').onclick = grade;
    $('#clearbtn').onclick = () => { State.filled = {}; refreshSlots(); clearJudge(); };
    $('#fillbtn').onclick = () => {
      blanks.forEach(b => { State.filled[b.id] = b.answer; });
      refreshSlots(); buildAnim(); play();
    };
    $('#playbtn').onclick = () => (State.anim.playing ? pause() : (State.anim.steps.length ? play() : (buildAnim(), play())));
    $('#stepbtn').onclick = () => { openDock(); if (!State.anim.steps.length) buildAnim(); pause(); goStep(State.anim.i + 1); };
    $('#resetbtn').onclick = () => { pause(); if (!State.anim.steps.length) buildAnim(); goStep(-1); };
    $('#openanim').onclick = () => { openDock(); if (buildAnim()) play(); };
    $('#closeanim').onclick = () => { pause(); closeDock(); };
    // スライダーを右に動かすほど速くなる（左いっぱいで1ステップ3.2秒、右いっぱいで0.5秒）
    const toDelay = (v) => 3700 - Number(v);
    $('#speed').oninput = (e) => { State.anim.speed = toDelay(e.target.value); };
    State.anim.speed = toDelay($('#speed').value);

    if (set) $('#pager').innerHTML = pagerHtml(set, prob.id);
  }

  /* ---------------- コード描画 ---------------- */
  function renderCode(prob) {
    const box = $('#code');
    box.innerHTML = prob.code.map((line, i) => {
      const n = i + 1;
      const segs = String(line).split(/\{\{(\d+)\}\}/g);
      let html = '';
      segs.forEach((s, k) => {
        if (k % 2 === 1) {
          html += `<span class="slot" data-blank="${s}"><span class="ph">空欄${s}</span></span>`;
        } else if (k === 0) {
          // 行頭の字下げ記号（│ └）は薄く表示する
          const m = String(s).match(/^([│|└├\s]*)([\s\S]*)$/);
          html += '<span class="tok-cmt">' + esc(m[1]) + '</span>' + hl(m[2]);
        } else {
          html += hl(s);
        }
      });
      return `<div class="cl" data-line="${n}"><span class="ln">(${String(n).padStart(2, '0')})</span><span class="ct">${html}</span></div>`;
    }).join('');
  }

  function refreshSlots() {
    document.querySelectorAll('.slot').forEach(sl => {
      const id = sl.dataset.blank;
      const v = State.filled[id];
      sl.classList.remove('correct', 'wrong');
      if (v == null || v === '') {
        sl.classList.remove('filled');
        sl.innerHTML = `<span class="ph">空欄${id}</span>`;
      } else {
        sl.classList.add('filled');
        sl.textContent = v;
      }
    });
    markAwaiting();
    // 選択肢は何度でも使える（同じものを繰り返し選んでよい）ので、使用済みの表示はしない
  }

  /* ---------------- 選択肢 ---------------- */
  function renderChips(prob) {
    chipsEl.innerHTML = (prob.choices || []).map((c, i) =>
      `<span class="chip" data-text="${esc(c)}"><span class="cnum">${i + 1}</span><span class="ctxt">${esc(c)}</span></span>`
    ).join('');
    syncTrayHeight();
  }

  /** 選択肢トレイの高さを本文の下余白に反映する（選択肢が画面外に隠れないように） */
  function syncTrayHeight() {
    const h = tray.hidden ? 0 : Math.ceil(tray.getBoundingClientRect().height);
    document.documentElement.style.setProperty('--trayh', h + 'px');
    syncTrayScroll();
  }
  window.addEventListener('resize', syncTrayHeight);

  /**
   * 選択肢が全部見えていてスクロールの必要がないときは「触ってすぐドラッグ」、
   * はみ出してスクロールが要るときだけ「上下スワイプ＝スクロール／長押し＝ドラッグ」に切り替える。
   */
  let trayScrolls = false;
  function syncTrayScroll() {
    trayScrolls = chipsEl.scrollHeight > chipsEl.clientHeight + 2;
    chipsEl.classList.toggle('scrollable', trayScrolls);
    const tip = $('#traytip');
    if (tip) {
      tip.textContent = trayScrolls
        ? 'タップして選ぶ → 空欄をタップ（長押しでドラッグ）'
        : 'ドラッグして空欄へ／タップして選んでもOK';
    }
  }

  $('#traytoggle').onclick = () => {
    tray.classList.toggle('collapsed');
    $('#traytoggle').textContent = tray.classList.contains('collapsed') ? '▲' : '▼';
    setTimeout(syncTrayHeight, 0);
  };

  /* ---------------- 選ぶ / ドラッグする ----------------
     スマホでは
       ・上下スワイプ  → 選択肢リストのスクロール（触らない）
       ・タップ        → その選択肢を「選択中」にする → 空欄をタップで入る
       ・長押し(0.26秒) → つかんでドラッグできる
     という3通りにする。以前は chip に touch-action:none を当てていたため
     スワイプがすべてドラッグ扱いになり、リストをスクロールできなかった。
     ------------------------------------------------------------------ */
  let selected = null;
  let drag = null;
  let dragArmed = false;

  // ドラッグ中だけブラウザのスクロールを止める
  document.addEventListener('touchmove', (e) => { if (dragArmed) e.preventDefault(); }, { passive: false });

  // 長押ししたときに、iPhone の文字選択（虫めがね）やコピーメニューが出ないようにする
  document.addEventListener('selectstart', (e) => { if (drag) e.preventDefault(); });
  document.addEventListener('contextmenu', (e) => {
    const t = e.target.closest ? e.target.closest('.chip, .slot') : null;
    if (t || drag) e.preventDefault();
  });

  function markAwaiting() {
    document.querySelectorAll('.slot').forEach(s => {
      s.classList.toggle('awaiting', !!selected);
    });
  }
  function clearSelection() {
    selected = null;
    document.querySelectorAll('.chip.selected').forEach(c => c.classList.remove('selected'));
    markAwaiting();
  }
  function selectChoice(text) {
    selected = text;
    document.querySelectorAll('.chip').forEach(c => c.classList.toggle('selected', c.dataset.text === text));
    markAwaiting();
  }

  function startPress(text, fromSlot, ev, srcEl) {
    // 選択肢がスクロールしないなら（＝全部見えているなら）どの向きでもすぐドラッグできる。
    // 空欄からつまみ出すときも同じ。
    const instant = !!fromSlot || !trayScrolls;
    drag = {
      text, fromSlot, srcEl, instant,
      armed: false, cancelled: false,
      startX: ev.clientX, startY: ev.clientY,
      pointerType: ev.pointerType || 'mouse',
      ghost: null, timer: null
    };
    if (srcEl) srcEl.classList.add('pressing');
    if (drag.pointerType !== 'mouse' && !instant) {
      drag.timer = setTimeout(() => armDrag(drag.startX, drag.startY), 200);
    }
    document.addEventListener('pointermove', onMove, { passive: false });
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onCancel);
  }

  function armDrag(x, y) {
    if (!drag || drag.cancelled || drag.armed) return;
    drag.armed = true;
    dragArmed = true;
    document.body.classList.add('dragging');
    // 押している間にうっかり始まった文字選択を消す
    try { const s = window.getSelection(); if (s && s.removeAllRanges) s.removeAllRanges(); } catch (e) {}
    if (drag.srcEl) { drag.srcEl.classList.remove('pressing'); drag.srcEl.classList.add('lifting'); }
    const g = document.createElement('div');
    g.className = 'ghost';
    g.textContent = drag.text;
    g.style.left = x + 'px';
    g.style.top = y + 'px';
    document.body.appendChild(g);
    drag.ghost = g;
    if (navigator.vibrate) { try { navigator.vibrate(12); } catch (e) {} }
  }

  function onMove(ev) {
    if (!drag || drag.cancelled) return;
    const dx = ev.clientX - drag.startX, dy = ev.clientY - drag.startY;
    const dist = Math.hypot(dx, dy);

    if (!drag.armed) {
      if (dist < 6) return;
      // すぐドラッグしてよい場面（マウス／スクロール不要な選択肢／空欄からつまみ出す）
      if (drag.instant || drag.pointerType === 'mouse' || Math.abs(dx) > Math.abs(dy) * 1.2) {
        clearTimeout(drag.timer);
        armDrag(ev.clientX, ev.clientY);
      } else {
        // スクロールが要るリストで縦に動かしたときは、スクロールに譲る
        clearTimeout(drag.timer);
        drag.cancelled = true;
        return;
      }
    }

    ev.preventDefault();
    drag.ghost.style.left = ev.clientX + 'px';
    drag.ghost.style.top = ev.clientY + 'px';
    document.querySelectorAll('.slot.over').forEach(s => s.classList.remove('over'));
    const t = document.elementFromPoint(ev.clientX, ev.clientY);
    const slot = t && t.closest ? t.closest('.slot') : null;
    if (slot) slot.classList.add('over');
  }

  function teardown() {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.removeEventListener('pointercancel', onCancel);
    dragArmed = false;
    document.body.classList.remove('dragging');
    document.querySelectorAll('.chip.lifting, .chip.pressing').forEach(c => c.classList.remove('lifting', 'pressing'));
    document.querySelectorAll('.slot.over').forEach(s => s.classList.remove('over'));
    if (drag && drag.timer) clearTimeout(drag.timer);
    if (drag && drag.ghost) drag.ghost.remove();
  }

  function onCancel() { teardown(); drag = null; }

  function onUp(ev) {
    if (!drag) { teardown(); return; }
    const d = drag;
    teardown();
    drag = null;
    if (d.cancelled) return;

    if (!d.armed) {
      // タップ扱い
      if (d.fromSlot) {
        if (selected) { State.filled[d.fromSlot] = selected; clearSelection(); }
        else delete State.filled[d.fromSlot];
        refreshSlots(); clearJudge();
      } else {
        if (selected === d.text) clearSelection();
        else selectChoice(d.text);
      }
      return;
    }

    const t = document.elementFromPoint(ev.clientX, ev.clientY);
    const slot = t && t.closest ? t.closest('.slot') : null;
    if (slot) {
      State.filled[slot.dataset.blank] = d.text;
      if (d.fromSlot && d.fromSlot !== slot.dataset.blank) delete State.filled[d.fromSlot];
    }
    // 空欄の外で指を離しても中身は消さない（消したいときは空欄をタップする）
    clearSelection();
    refreshSlots();
    clearJudge();
  }

  document.addEventListener('pointerdown', (ev) => {
    const chip = ev.target.closest ? ev.target.closest('.chip') : null;
    if (chip) { startPress(chip.dataset.text, null, ev, chip); return; }
    const slot = ev.target.closest ? ev.target.closest('.slot') : null;
    if (slot) {
      if (selected) {
        State.filled[slot.dataset.blank] = selected;
        clearSelection(); refreshSlots(); clearJudge();
        return;
      }
      if (slot.classList.contains('filled')) startPress(State.filled[slot.dataset.blank], slot.dataset.blank, ev, slot);
      return;
    }
  });

  /* ---------------- 採点 ---------------- */
  function clearJudge() {
    const r = $('#result');
    if (r) { r.classList.remove('show', 'ok', 'ng'); r.innerHTML = ''; }
    State.graded = false;
  }

  function grade() {
    const prob = State.prob;
    const blanks = prob.blanks || [];
    const missing = blanks.filter(b => !State.filled[b.id]);
    const r = $('#result');
    if (missing.length) {
      r.className = 'result ng show';
      r.innerHTML = `<h4>まだ空欄が残っています</h4><div>空欄 ${missing.map(b => b.id).join('・')} を埋めてから「回答する」を押してください。</div>`;
      return;
    }
    let allOk = true;
    const rows = blanks.map(b => {
      const ok = norm(State.filled[b.id]) === norm(b.answer);
      if (!ok) allOk = false;
      const sl = document.querySelector(`.slot[data-blank="${b.id}"]`);
      if (sl) { sl.classList.remove('correct', 'wrong'); sl.classList.add(ok ? 'correct' : 'wrong'); }
      return `<li><span class="bno">空欄${b.id}</span> ${ok ? '✅ 正解' : '❌ 不正解（正しくは <code>' + esc(b.answer) + '</code>）'}<br>
              <span class="muted">${esc(b.explain || '')}</span></li>`;
    }).join('');

    r.className = 'result ' + (allOk ? 'ok' : 'ng') + ' show';
    r.innerHTML = `<h4>${allOk ? '全問正解です' : 'おしい！間違いがあります'}</h4><ul>${rows}</ul>
      <div class="muted" style="margin-top:8px">右のアニメーションで、1行ずつ何が起きるか確かめてみましょう。</div>`;
    State.graded = true;
    $('#fillbtn').style.display = '';
    if (State.set) setProgress(State.set.id, prob.id, allOk);
    buildAnim();
    updateNavDots();
    r.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  /* =========================================================================
     アニメーション
     ========================================================================= */
  function filledCode() {
    return State.prob.code.map(line =>
      String(line).replace(/\{\{(\d+)\}\}/g, (m, id) => (State.filled[id] != null ? State.filled[id] : '?')));
  }

  function buildAnim() {
    stopAnim();
    const prob = State.prob;
    const unfilled = (prob.blanks || []).some(b => !State.filled[b.id]);
    if (unfilled) {
      State.anim.steps = []; State.anim.error = null;
      narrate('先に空欄をすべて埋めてください。（埋めてからもう一度「アニメーション開始」を押してください）', 'err');
      return false;
    }
    const res = window.DNCL.execute(filledCode(), { indexBase: prob.indexBase || 0, maxSteps: 3000 });
    State.anim.steps = res.steps;
    State.anim.error = res.error;
    State.anim.i = -1;
    updatePos();
    return true;
  }

  function narrate(text, cls) {
    const n = $('#narr');
    if (!n) return;
    n.className = 'narration' + (cls ? ' ' + cls : '');
    n.innerHTML = text;
  }

  function updatePos() {
    const p = $('#pos');
    if (p) p.textContent = `${Math.max(0, State.anim.i + 1)} / ${State.anim.steps.length}`;
    const f = $('#pfill');
    if (f) {
      const n = State.anim.steps.length;
      f.style.width = n ? (Math.max(0, State.anim.i + 1) / n * 100) + '%' : '0%';
    }
  }

  const isPhone = () => window.matchMedia('(max-width: 980px)').matches;
  function openDock() { if (isPhone()) document.body.classList.add('anim-open'); }
  function closeDock() { document.body.classList.remove('anim-open'); }

  function play() {
    if (!State.anim.steps.length && !buildAnim()) return;
    if (!State.anim.steps.length) return;
    openDock();
    State.anim.playing = true;
    $('#playbtn').textContent = '⏸ 一時停止';
    if (State.anim.i >= State.anim.steps.length - 1) goStep(-1);
    tick();
  }
  function tick() {
    if (!State.anim.playing) return;
    if (State.anim.i >= State.anim.steps.length - 1) { finish(); return; }
    goStep(State.anim.i + 1);
    State.anim.timer = setTimeout(tick, State.anim.speed);
  }
  function pause() {
    State.anim.playing = false;
    clearTimeout(State.anim.timer);
    const b = $('#playbtn'); if (b) b.textContent = '▶ アニメーション開始';
  }
  function stopAnim() {
    State.anim.playing = false;
    clearTimeout(State.anim.timer);
    State.anim.steps = []; State.anim.i = -1; State.anim.error = null;
    clearFx();
  }
  function finish() {
    pause();
    if (State.anim.error) {
      const e = State.anim.error;
      narrate(`<span class="badge">エラー</span>${esc(e.message)}${e.line ? '（' + e.line + '行目）' : ''}`, 'err');
      const el = e.line ? document.querySelector(`.cl[data-line="${e.line}"]`) : null;
      if (el) { document.querySelectorAll('.cl.active').forEach(x => x.classList.remove('active')); el.classList.add('active'); }
    } else {
      narrate('<span class="badge">終了</span>プログラムが最後まで実行されました。');
    }
  }

  const KIND_LABEL = {
    assign: '代入', cond: '条件', loop: '繰り返し', loopiter: '繰り返し',
    loopend: '繰り返し終了', output: '表示', expr: '実行'
  };
  const KIND_CLS = {
    assign: 'k-assign', cond: 'k-cond', loop: 'k-loop', loopiter: 'k-loop',
    loopend: 'k-loop', output: 'k-out', expr: 'k-assign'
  };

  const fmtV = (v) => window.DNCL.fmt(v);
  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** 行内バッジと飛んでいる値トークンを消す（ステップ切り替え時） */
  function clearFx() {
    document.querySelectorAll('.lbadge').forEach(x => x.remove());
    document.querySelectorAll('.fly').forEach(x => x.remove());
  }

  function targetLabel(t) {
    return t.index != null ? `${t.name}[${fmtV(t.index)}]` : t.name;
  }

  /** 代入先の「直前の値」を前のステップのスナップショットから引く */
  function prevValOf(st, prev) {
    if (!prev || !st.target) return undefined;
    const v = prev.vars[st.target.name];
    if (st.target.index != null) {
      if (!Array.isArray(v)) return undefined;
      return v[st.target.index - (State.prob.indexBase || 0)];
    }
    return v;
  }

  function goStep(i) {
    const steps = State.anim.steps;
    clearFx();
    if (i < 0) {
      State.anim.i = -1;
      document.querySelectorAll('.cl.active').forEach(x => x.classList.remove('active'));
      $('#vars').innerHTML = '<span class="muted">まだ実行していません</span>';
      $('#console').innerHTML = '<span class="ph">（まだ何も表示されていません）</span>';
      narrate('<span class="muted">最初の状態です。▶ を押すと1行ずつ動きます。</span>');
      updatePos();
      return;
    }
    if (i >= steps.length) { finish(); return; }
    const st = steps[i], prev = i > 0 ? steps[i - 1] : null;
    State.anim.i = i;

    document.querySelectorAll('.cl.active').forEach(x => x.classList.remove('active'));
    const el = document.querySelector(`.cl[data-line="${st.line}"]`);
    if (el) {
      el.classList.add('active');
      // スマホでは下部の実行パネルに隠れないよう scroll-margin を効かせる
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    narrateStep(st, prev);
    renderVars(st.vars, prev ? prev.vars : null, st);
    renderConsole(st.output, st.kind === 'output');
    const badge = addLineBadge(st, el);
    runFx(st, badge);
    updatePos();
  }

  /** ナレーション（種別バッジ＋説明＋「変数: 前 → 後」の変化チップ） */
  function narrateStep(st, prev) {
    let extra = '';
    if (st.kind === 'assign' && st.target) {
      const pv = prevValOf(st, prev);
      const showOld = pv !== undefined && !sameVal(pv, st.value);
      extra = `<div class="ndiff"><span class="dn">${esc(targetLabel(st.target))}</span>` +
        (showOld ? `<span class="old">${esc(fmtV(pv))}</span><span class="ar">→</span>` : '') +
        `<span class="new">${esc(fmtV(st.value))}</span></div>`;
    } else if (typeof st.result === 'boolean') {
      extra = `<div class="ndiff"><span class="verdict ${st.result ? 'v-ok' : 'v-ng'}">` +
        `${st.result ? '○ 成り立つ（真）' : '× 成り立たない（偽）'}</span></div>`;
    }
    narrate(`<span class="badge ${KIND_CLS[st.kind] || ''}">${KIND_LABEL[st.kind] || ''}</span>${esc(st.desc)}${extra}`);
  }

  /** 実行中の行の右端に「結果」を直接出す（total ← 50 ／ ○真 ／ i = 2 など） */
  function addLineBadge(st, lineEl) {
    if (!lineEl) return null;
    const ct = lineEl.querySelector('.ct');
    if (!ct) return null;
    let cls = null, txt = '';
    if (st.kind === 'assign') {
      cls = 'b-assign';
      txt = st.target ? `${targetLabel(st.target)} ← ${fmtV(st.value)}` : '代入';
    } else if (typeof st.result === 'boolean') {
      cls = st.result ? 'b-true' : 'b-false';
      txt = st.result ? '○ 真' : '× 偽';
    } else if ((st.kind === 'loop' || st.kind === 'loopiter') && st.loopVar) {
      cls = 'b-loop';
      txt = `${st.loopVar.name} = ${fmtV(st.loopVar.value)}`;
    } else if (st.kind === 'loopend') {
      cls = 'b-false';
      txt = 'おわり';
    } else if (st.kind === 'output') {
      cls = 'b-out';
      txt = '表示 ▶';
    }
    if (!cls) return null;
    const b = document.createElement('span');
    b.className = 'lbadge ' + cls;
    b.textContent = txt;
    ct.appendChild(b);
    return b;
  }

  /** 値トークンを実行行から代入先（変数・配列セル・出力欄）へ飛ばす */
  function runFx(st, badgeEl) {
    if (reducedMotion() || !badgeEl) return;
    if (st.kind === 'assign' && st.target) {
      const base = State.prob.indexBase || 0;
      const key = st.target.index != null
        ? `arr-${st.target.name}-${st.target.index - base}`
        : `v-${st.target.name}`;
      flyToken(fmtV(st.value), badgeEl, document.querySelector(`#vars [data-hit="${key}"]`));
    } else if (st.kind === 'output') {
      const t = String(st.text == null ? '' : st.text);
      flyToken(t.length > 14 ? t.slice(0, 14) + '…' : t, badgeEl, $('#console'));
    }
  }

  function inViewport(r) {
    return r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth;
  }

  function flyToken(text, fromEl, toEl) {
    if (!fromEl || !toEl || !toEl.animate) return;
    const a = fromEl.getBoundingClientRect();
    const b = toEl.getBoundingClientRect();
    if (!inViewport(a) || !inViewport(b)) return;
    const t = document.createElement('div');
    t.className = 'fly';
    t.textContent = text;
    const x0 = a.left + a.width / 2, y0 = a.top + a.height / 2;
    t.style.left = x0 + 'px';
    t.style.top = y0 + 'px';
    document.body.appendChild(t);
    const dx = (b.left + b.width / 2) - x0;
    const dy = (b.top + b.height / 2) - y0;
    const dur = Math.max(260, Math.min(650, State.anim.speed * 0.38));
    const anim = t.animate([
      { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.85)`, opacity: .9 }
    ], { duration: dur, easing: 'cubic-bezier(.3,.7,.35,1)' });
    anim.onfinish = () => t.remove();
    anim.oncancel = () => t.remove();
  }

  function sameVal(a, b) {
    if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => v === b[i]);
    return a === b;
  }

  function renderVars(vars, prev, st) {
    const box = $('#vars');
    const names = Object.keys(vars);
    if (!names.length) { box.innerHTML = '<span class="muted">まだ変数はありません</span>'; return; }

    const base = (State.prob.indexBase || 0);

    // このステップで「読んだ場所」（青く塗る）
    const srcKeys = new Set();
    if (st && st.reads) {
      for (const r of st.reads) {
        srcKeys.add(r.index != null ? `arr-${r.name}-${r.index - base}` : `v-${r.name}`);
      }
    }

    // 配列のカーソル: 実行中のループ変数を優先。無ければ i,j,k,m,n の類推
    let cursorName = (st && st.loopVar) ? st.loopVar.name : null;
    if (!cursorName) {
      for (const n of names) {
        if (['i', 'j', 'k', 'm', 'n'].includes(n) && Number.isInteger(vars[n])) { cursorName = n; break; }
      }
    }
    const cursorVal = (cursorName && Number.isInteger(vars[cursorName])) ? vars[cursorName] : undefined;

    const hits = [];
    box.innerHTML = names.map(name => {
      const v = vars[name];
      const before = prev ? prev[name] : undefined;
      if (Array.isArray(v)) {
        const cells = v.map((x, k) => {
          const key = `arr-${name}-${k}`;
          const changed = prev && Array.isArray(before) && before[k] !== x;
          const isCursor = (cursorVal !== undefined) && (base + k === cursorVal);
          if (changed) hits.push(key);
          const cls = ['cell'];
          if (isCursor) cls.push('cursor');
          if (srcKeys.has(key)) cls.push('src');
          return `<div class="cellwrap"><span class="ix">${base + k}</span>
            <div class="${cls.join(' ')}" data-hit="${key}">${esc(window.DNCL.fmt(x))}</div>
            ${isCursor ? `<span class="curlabel">▲ ${esc(cursorName)}</span>` : ''}</div>`;
        }).join('');
        return `<div class="vrow"><span class="vname">${esc(name)}</span><div class="arr">${cells}</div></div>`;
      }
      const changed = prev && !sameVal(before, v);
      if (changed || (prev && before === undefined)) hits.push('v-' + name);
      const cls = 'vval' + (srcKeys.has('v-' + name) ? ' src' : '');
      return `<div class="vrow"><span class="vname">${esc(name)}</span>
        <span class="${cls}" data-hit="v-${esc(name)}">${esc(window.DNCL.fmt(v))}</span></div>`;
    }).join('');

    // ステップを速く進めたとき、前のステップのハイライト予約が
    // 今の表示に重ならないよう、古い予約は取り消す
    cancelAnimationFrame(renderVars._raf || 0);
    if (hits.length) {
      renderVars._raf = requestAnimationFrame(() => {
        hits.forEach(h => {
          const el = box.querySelector(`[data-hit="${h}"]`);
          if (el) {
            el.classList.add('hit');
            setTimeout(() => el.classList.remove('hit'), 520);
          }
        });
      });
    }
  }

  function renderConsole(lines, flashLast) {
    const c = $('#console');
    if (!lines || !lines.length) { c.innerHTML = '<span class="ph">（まだ何も表示されていません）</span>'; return; }
    c.innerHTML = lines.map((l, i) =>
      `<div class="cline${flashLast && i === lines.length - 1 ? ' new' : ''}">${esc(l)}</div>`
    ).join('');
    c.scrollTop = c.scrollHeight;
  }

  /* =========================================================================
     ナビゲーション
     ========================================================================= */
  function navHtml(set, curId) {
    const prog = getProgress(set.id);
    return '<div class="qnav">' + set.problems.map((p, i) => {
      const m = String(p.title).match(/^\s*[(（]?\s*(\d+)/);
      const short = m ? m[1] : String(i + 1);
      return `<a href="#/p/${encodeURIComponent(set.id)}/${encodeURIComponent(p.id)}"
          class="${p.id === curId ? 'cur' : ''} ${prog[p.id] ? 'done' : ''}"><span class="dot"></span
          ><span class="nav-full">${esc(p.title)}</span><span class="nav-short">${esc(short)}</span></a>`;
    }).join('') + '</div>';
  }
  function updateNavDots() {
    if (!State.set) return;
    const prog = getProgress(State.set.id);
    document.querySelectorAll('.qnav a').forEach(a => {
      const id = decodeURIComponent(a.getAttribute('href').split('/').pop());
      a.classList.toggle('done', !!prog[id]);
    });
  }
  function pagerHtml(set, curId) {
    const idx = set.problems.findIndex(p => p.id === curId);
    const prev = idx > 0 ? set.problems[idx - 1] : null;
    const next = idx >= 0 && idx < set.problems.length - 1 ? set.problems[idx + 1] : null;
    return `<div>${prev ? `<button onclick="location.hash='#/p/${set.id}/${prev.id}'">← ${esc(prev.title)}</button>` : ''}</div>
            <div>${next ? `<button class="primary" onclick="location.hash='#/p/${set.id}/${next.id}'">${esc(next.title)} →</button>` : ''}</div>`;
  }

  /* ---------------- ルーティング ---------------- */
  function renderHome() {
    tray.hidden = true; syncTrayHeight();
    $('#setname').textContent = '';
    const sets = window.PROBLEM_SETS || {};
    app.innerHTML = `
      <div class="card">
        <h2>問題セット</h2>
        <p class="muted">取り組みたいセットを選んでください。ログインは不要です。</p>
        <div class="list">
          ${Object.values(sets).map(s => `<a href="#/s/${s.id}"><b>${esc(s.title)}</b><span class="muted">${s.problems.length}問</span></a>`).join('')}
        </div>
      </div>
      <div class="card">
        <h2>先生の方へ</h2>
        <p class="muted">問題を自分で作って、生徒に配るURLを発行できます。</p>
        <div class="btns"><button class="primary" onclick="location.href='teacher.html'">問題を作る</button></div>
      </div>`;
  }

  function renderSetIndex(set) {
    tray.hidden = true; syncTrayHeight();
    $('#setname').textContent = set.title;
    const prog = getProgress(set.id);
    app.innerHTML = `
      <div class="card">
        <h2>${esc(set.title)}</h2>
        <p>${set.intro || ''}</p>
      </div>
      <div class="card">
        <h2>問題</h2>
        <div class="list">
          ${set.problems.map(p => `<a href="#/p/${set.id}/${p.id}"><b>${prog[p.id] ? '✅ ' : ''}${esc(p.title)}</b>
             <span class="muted">${String(p.question).replace(/<[^>]+>/g, '').slice(0, 60)}…</span></a>`).join('')}
        </div>
      </div>`;
  }

  function route() {
    const h = location.hash.replace(/^#/, '');
    const parts = h.split('/').filter(x => x !== '');
    window.scrollTo(0, 0);
    clearSelection();
    closeDock();

    try {
      if (parts.length === 0) return renderHome();

      if (parts[0] === 's') {
        const set = (window.PROBLEM_SETS || {})[decodeURIComponent(parts[1])];
        if (!set) return renderHome();
        return renderSetIndex(set);
      }

      if (parts[0] === 'p') {
        const set = (window.PROBLEM_SETS || {})[decodeURIComponent(parts[1])];
        if (!set) return renderHome();
        const prob = set.problems.find(p => p.id === decodeURIComponent(parts[2]));
        if (!prob) return renderSetIndex(set);
        $('#setname').textContent = set.title;
        return renderProblem(set, prob, navHtml(set, prob.id));
      }

      if (parts[0] === 'd') {          // 先生が作った単問
        const prob = window.Codec.decodeData(parts.slice(1).join('/'));
        $('#setname').textContent = '先生の作成した問題';
        renderProblem(null, prob, '');
        return;
      }

      if (parts[0] === 'ds') {         // 先生が作ったセット
        const set = window.Codec.decodeData(parts.slice(1).join('/'));
        window.PROBLEM_SETS = window.PROBLEM_SETS || {};
        window.PROBLEM_SETS[set.id] = set;
        $('#setname').textContent = set.title;
        return renderSetIndex(set);
      }
    } catch (e) {
      app.innerHTML = `<div class="card"><h2>問題を読み込めませんでした</h2>
        <p class="muted">URLが途中で切れている可能性があります。先生にもう一度URLを送ってもらってください。</p>
        <p class="muted">${esc(e.message)}</p></div>`;
      tray.hidden = true; syncTrayHeight();
      return;
    }
    renderHome();
  }

  window.addEventListener('hashchange', route);
  route();
})();
