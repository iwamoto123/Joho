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
            <div class="narration" id="narr"><span class="muted">「動きを見る」を押すと、ここに今どの行で何が起きているかが出ます。</span></div>
            <h3>変数と配列のようす</h3>
            <div class="vars" id="vars"><span class="muted">まだ実行していません</span></div>
            <h3>表示（出力）</h3>
            <div class="console" id="console"><span class="ph">（まだ何も表示されていません）</span></div>
          </div>
        </div>
      </div>
    `;

    renderCode(prob);
    renderChips(prob);
    tray.hidden = false;

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
    // 選択肢は何度でも使える（同じものを繰り返し選んでよい）ので、使用済みの表示はしない
  }

  /* ---------------- 選択肢 ---------------- */
  function renderChips(prob) {
    chipsEl.innerHTML = (prob.choices || []).map((c, i) =>
      `<span class="chip" data-text="${esc(c)}">${esc(c)}</span>`).join('');
  }

  /* ---------------- ドラッグ & タップ ---------------- */
  let selected = null;
  let drag = null;

  function clearSelection() {
    selected = null;
    document.querySelectorAll('.chip.selected').forEach(c => c.classList.remove('selected'));
  }

  function startDrag(text, fromSlot, ev) {
    drag = { text, fromSlot, moved: false, startX: ev.clientX, startY: ev.clientY, ghost: null };
    document.addEventListener('pointermove', onMove, { passive: false });
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);
  }

  function onMove(ev) {
    if (!drag) return;
    const dx = ev.clientX - drag.startX, dy = ev.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < 6) return;
    ev.preventDefault();
    if (!drag.moved) {
      drag.moved = true;
      const g = document.createElement('div');
      g.className = 'ghost';
      g.textContent = drag.text;
      document.body.appendChild(g);
      drag.ghost = g;
    }
    drag.ghost.style.left = ev.clientX + 'px';
    drag.ghost.style.top = ev.clientY + 'px';
    document.querySelectorAll('.slot.over').forEach(s => s.classList.remove('over'));
    const t = document.elementFromPoint(ev.clientX, ev.clientY);
    const slot = t && t.closest ? t.closest('.slot') : null;
    if (slot) slot.classList.add('over');
  }

  function onUp(ev) {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.removeEventListener('pointercancel', onUp);
    if (!drag) return;
    const d = drag; drag = null;
    document.querySelectorAll('.slot.over').forEach(s => s.classList.remove('over'));
    if (d.ghost) d.ghost.remove();

    if (!d.moved) {
      // タップ扱い
      if (d.fromSlot) { delete State.filled[d.fromSlot]; refreshSlots(); clearJudge(); }
      else {
        if (selected === d.text) clearSelection();
        else {
          clearSelection(); selected = d.text;
          document.querySelectorAll('.chip').forEach(c => { if (c.dataset.text === d.text) c.classList.add('selected'); });
        }
      }
      return;
    }

    const t = document.elementFromPoint(ev.clientX, ev.clientY);
    const slot = t && t.closest ? t.closest('.slot') : null;
    if (slot) {
      State.filled[slot.dataset.blank] = d.text;
      if (d.fromSlot && d.fromSlot !== slot.dataset.blank) delete State.filled[d.fromSlot];
    } else if (d.fromSlot) {
      delete State.filled[d.fromSlot];
    }
    clearSelection();
    refreshSlots();
    clearJudge();
  }

  document.addEventListener('pointerdown', (ev) => {
    const chip = ev.target.closest ? ev.target.closest('.chip') : null;
    if (chip) { startDrag(chip.dataset.text, null, ev); return; }
    const slot = ev.target.closest ? ev.target.closest('.slot') : null;
    if (slot) {
      if (selected) {
        State.filled[slot.dataset.blank] = selected;
        clearSelection(); refreshSlots(); clearJudge();
        return;
      }
      if (slot.classList.contains('filled')) { startDrag(State.filled[slot.dataset.blank], slot.dataset.blank, ev); }
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

  function goStep(i) {
    const steps = State.anim.steps;
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

    narrate(`<span class="badge">${KIND_LABEL[st.kind] || ''}</span>${esc(st.desc)}`);
    renderVars(st.vars, prev ? prev.vars : null);
    renderConsole(st.output);
    updatePos();
  }

  function sameVal(a, b) {
    if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => v === b[i]);
    return a === b;
  }

  function renderVars(vars, prev) {
    const box = $('#vars');
    const names = Object.keys(vars);
    if (!names.length) { box.innerHTML = '<span class="muted">まだ変数はありません</span>'; return; }

    // カーソル用: i,j,k,m,n のような添字変数
    const cursors = {};
    for (const n of names) if (['i', 'j', 'k', 'm', 'n'].includes(n) && Number.isInteger(vars[n])) cursors[n] = vars[n];
    const cursorVal = Object.values(cursors)[0];

    const hits = [];
    box.innerHTML = names.map(name => {
      const v = vars[name];
      const before = prev ? prev[name] : undefined;
      if (Array.isArray(v)) {
        const base = (State.prob.indexBase || 0);
        const cells = v.map((x, k) => {
          const changed = prev && Array.isArray(before) && before[k] !== x;
          const isCursor = (cursorVal !== undefined) && (base + k === cursorVal);
          if (changed) hits.push(`arr-${name}-${k}`);
          return `<div class="cellwrap"><span class="ix">${base + k}</span>
            <div class="cell${isCursor ? ' cursor' : ''}" data-hit="arr-${name}-${k}">${esc(window.DNCL.fmt(x))}</div></div>`;
        }).join('');
        return `<div class="vrow"><span class="vname">${esc(name)}</span><div class="arr">${cells}</div></div>`;
      }
      const changed = prev && !sameVal(before, v);
      if (changed || (prev && before === undefined)) hits.push('v-' + name);
      return `<div class="vrow"><span class="vname">${esc(name)}</span>
        <span class="vval" data-hit="v-${esc(name)}">${esc(window.DNCL.fmt(v))}</span></div>`;
    }).join('');

    if (hits.length) {
      requestAnimationFrame(() => {
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

  function renderConsole(lines) {
    const c = $('#console');
    if (!lines || !lines.length) { c.innerHTML = '<span class="ph">（まだ何も表示されていません）</span>'; return; }
    c.textContent = lines.join('\n');
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
    tray.hidden = true;
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
    tray.hidden = true;
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
      tray.hidden = true;
      return;
    }
    renderHome();
  }

  window.addEventListener('hashchange', route);
  route();
})();
