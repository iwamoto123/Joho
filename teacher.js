/* =========================================================================
   teacher.js — 先生用 問題作成ツール
   ========================================================================= */
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const KEY = 'joho-teacher-draft';

  let data = load() || {
    id: 'custom-' + Math.random().toString(36).slice(2, 8),
    title: '',
    intro: '',
    problems: [newProblem()]
  };
  let cur = 0;

  function newProblem() {
    return {
      id: 'q' + Math.random().toString(36).slice(2, 6),
      title: '',
      question: '',
      hint: '',
      indexBase: 0,
      code: [],
      blanks: [],
      choices: []
    };
  }

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {}
  }

  /* ---------------- 描画 ---------------- */
  function renderProbList() {
    const sel = $('#probSel');
    sel.innerHTML = data.problems.map((p, i) =>
      `<option value="${i}"${i === cur ? ' selected' : ''}>${esc(p.title || '（無題の問題 ' + (i + 1) + '）')}</option>`).join('');
  }

  function blankIds(codeText) {
    const ids = [];
    String(codeText).replace(/\{\{(\d+)\}\}/g, (m, n) => { if (!ids.includes(n)) ids.push(n); return m; });
    return ids.sort((a, b) => Number(a) - Number(b));
  }

  function renderBlanks() {
    const p = data.problems[cur];
    const ids = blankIds($('#pCode').value);
    const box = $('#blankEditor');
    if (!ids.length) { box.innerHTML = '<span class="muted">プログラム欄に {{1}} のような空欄を書くと、ここに正解の入力欄が出ます。</span>'; return; }
    box.innerHTML = ids.map(id => {
      const b = (p.blanks || []).find(x => String(x.id) === String(id)) || {};
      return `<div style="border:1px solid var(--line);border-radius:4px;padding:10px;margin-bottom:8px">
        <div style="font-weight:600;font-size:13px;margin-bottom:5px">空欄 ${id}</div>
        <input type="text" class="bans" data-id="${id}" placeholder="正解（例: total = total + Seiseki[i]）" value="${esc(b.answer)}">
        <textarea class="bexp" data-id="${id}" rows="2" placeholder="解説（回答後に表示されます）" style="margin-top:6px">${esc(b.explain)}</textarea>
      </div>`;
    }).join('');
    box.querySelectorAll('.bans, .bexp').forEach(el => el.addEventListener('input', pullBlanks));
  }

  function pushForm() {
    const p = data.problems[cur];
    $('#setTitle').value = data.title || '';
    $('#setIntro').value = data.intro || '';
    $('#pTitle').value = p.title || '';
    $('#pQuestion').value = p.question || '';
    $('#pHint').value = p.hint || '';
    $('#pCode').value = (p.code || []).join('\n');
    $('#pBase').value = String(p.indexBase || 0);
    $('#pChoices').value = (p.choices || []).join('\n');
    renderBlanks();
    renderProbList();
  }

  function pullBlanks() {
    const p = data.problems[cur];
    const ids = blankIds($('#pCode').value);
    p.blanks = ids.map(id => {
      const a = document.querySelector(`.bans[data-id="${id}"]`);
      const e = document.querySelector(`.bexp[data-id="${id}"]`);
      return { id: Number(id), answer: a ? a.value : '', explain: e ? e.value : '' };
    });
    save();
  }

  function pullForm() {
    const p = data.problems[cur];
    data.title = $('#setTitle').value;
    data.intro = $('#setIntro').value;
    p.title = $('#pTitle').value;
    p.question = $('#pQuestion').value;
    p.hint = $('#pHint').value;
    p.code = $('#pCode').value.split('\n');
    p.indexBase = Number($('#pBase').value);
    p.choices = $('#pChoices').value.split('\n').map(s => s.trim()).filter(s => s !== '');
    pullBlanks();
    renderProbList();
    save();
  }

  ['setTitle', 'setIntro', 'pTitle', 'pQuestion', 'pHint', 'pBase', 'pChoices'].forEach(id => {
    $('#' + id).addEventListener('input', pullForm);
  });
  $('#pCode').addEventListener('input', () => { pullForm(); renderBlanks(); });

  $('#probSel').addEventListener('change', (e) => { pullForm(); cur = Number(e.target.value); pushForm(); });
  $('#addProb').onclick = () => { pullForm(); data.problems.push(newProblem()); cur = data.problems.length - 1; pushForm(); save(); };
  $('#delProb').onclick = () => {
    if (data.problems.length <= 1) { alert('問題が1つしかありません。'); return; }
    if (!confirm('この問題を削除します。よろしいですか？')) return;
    data.problems.splice(cur, 1); cur = Math.max(0, cur - 1); pushForm(); save();
  };

  /* ---------------- 動作チェック ---------------- */
  $('#runbtn').onclick = () => {
    pullForm();
    const p = data.problems[cur];
    const filled = {};
    (p.blanks || []).forEach(b => { filled[b.id] = b.answer; });
    const code = (p.code || []).map(l => l.replace(/\{\{(\d+)\}\}/g, (m, id) => (filled[id] || '?')));
    const res = window.DNCL.execute(code, { indexBase: p.indexBase || 0 });
    const out = $('#runout');
    const missing = (p.choices || []).length
      ? (p.blanks || []).filter(b => !p.choices.includes(b.answer)).map(b => b.id)
      : [];
    let msg = '';
    if (res.error) {
      msg += '⚠ エラー: ' + res.error.message + (res.error.line ? '（' + res.error.line + '行目）' : '') + '\n\n';
    } else {
      msg += '✅ 最後まで実行できました（' + res.steps.length + 'ステップ）\n\n';
    }
    msg += '--- 出力 ---\n' + (res.output.join('\n') || '（出力なし）');
    if (res.steps.length) {
      const v = res.steps[res.steps.length - 1].vars;
      msg += '\n\n--- 最後の変数 ---\n' + Object.keys(v).map(k => k + ' = ' + window.DNCL.fmt(v[k])).join('\n');
    }
    if (missing.length) msg += '\n\n⚠ 選択肢に正解が入っていない空欄: ' + missing.join(', ');
    out.textContent = msg;
  };

  /* ---------------- URL 発行 ---------------- */
  function baseUrl() {
    return location.href.replace(/teacher\.html.*$/, 'index.html');
  }
  $('#makeurl').onclick = () => {
    pullForm();
    const p = data.problems[cur];
    const one = baseUrl() + '#/d/' + window.Codec.encodeData(p);
    const set = baseUrl() + '#/ds/' + window.Codec.encodeData(data);
    $('#urlOne').textContent = one;
    $('#urlSet').textContent = set;
  };
  const copy = (sel) => () => {
    const t = $(sel).textContent;
    if (!t || t === '—') { alert('先に「URLを発行する」を押してください。'); return; }
    navigator.clipboard.writeText(t).then(() => alert('コピーしました'), () => alert('コピーできませんでした。手動で選択してください。'));
  };
  $('#copyOne').onclick = copy('#urlOne');
  $('#copySet').onclick = copy('#urlSet');
  $('#openOne').onclick = () => { const t = $('#urlOne').textContent; if (t && t !== '—') window.open(t, '_blank'); };
  $('#openSet').onclick = () => { const t = $('#urlSet').textContent; if (t && t !== '—') window.open(t, '_blank'); };

  /* ---------------- 書き出し / 読み込み ---------------- */
  $('#exportBtn').onclick = () => { pullForm(); $('#jsonArea').value = JSON.stringify(data, null, 2); };
  $('#importBtn').onclick = () => {
    try {
      const d = JSON.parse($('#jsonArea').value);
      if (!d.problems || !d.problems.length) throw new Error('problems がありません');
      data = d; cur = 0; pushForm(); save(); alert('読み込みました');
    } catch (e) { alert('読み込めませんでした: ' + e.message); }
  };
  $('#loadSample').onclick = () => {
    const s = window.PROBLEM_SETS['seiseki-basic'];
    data = JSON.parse(JSON.stringify(s));
    data.id = 'custom-' + Math.random().toString(36).slice(2, 8);
    cur = 0; pushForm(); save();
  };

  pushForm();
})();
