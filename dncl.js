/* =========================================================================
   dncl.js — 共通テスト用プログラム表記（新DNCL）インタプリタ
   ・字句解析 → 構文解析 → ジェネレータによるステップ実行
   ・1ステップごとに「今どの行で何が起きたか」を日本語で説明したイベントを返す
   仕様の根拠は docs/dncl-notation.md
   ========================================================================= */
(function (global) {
  'use strict';

  class DnclError extends Error {
    constructor(message, line) {
      super(message);
      this.line = line;
    }
  }

  /* ---------------------------------------------------------------
     0. 正規化（全角ゆれ・行番号・インデント記号の吸収）
     --------------------------------------------------------------- */
  const ZEN_HAN = {
    '　': ' ', '＝': '=', '（': '(', '）': ')', '［': '[', '］': ']',
    '｛': '{', '｝': '}', '，': ',', '、': ',', '：': ':', '；': ';',
    '＋': '+', '－': '-', '−': '-', '＊': '*', '／': '/', '％': '%',
    '＜': '<', '＞': '>', '！': '!', '＆': '&', '｜': '|',
    '“': '"', '”': '"', '＂': '"', '＃': '#'
  };

  function normalize(text) {
    let s = '';
    for (const ch of text) {
      if (ZEN_HAN[ch] !== undefined) { s += ZEN_HAN[ch]; continue; }
      const c = ch.codePointAt(0);
      // 全角英数字 → 半角
      if (c >= 0xff10 && c <= 0xff19) { s += String.fromCharCode(c - 0xfee0); continue; }
      if (c >= 0xff21 && c <= 0xff3a) { s += String.fromCharCode(c - 0xfee0); continue; }
      if (c >= 0xff41 && c <= 0xff5a) { s += String.fromCharCode(c - 0xfee0); continue; }
      s += ch;
    }
    return s;
  }

  const BOX_CHARS = '│|└├┌┃┗┣';

  /** 1行を { boxes, spaces, body } に分解する（深さの決定は parseProgram 側） */
  function splitIndent(rawLine) {
    // 行頭の行番号 (1) (01) などを除去
    const line = rawLine.replace(/^\s*\(\s*\d+\s*\)\s?/, '');
    let boxes = 0, spaces = 0, i = 0;
    while (i < line.length) {
      const ch = line[i];
      if (BOX_CHARS.includes(ch)) { boxes++; i++; continue; }
      if (ch === ' ') { spaces++; i++; continue; }
      if (ch === '\t') { spaces += 2; i++; continue; }
      break;
    }
    return { boxes, spaces, body: line.slice(i) };
  }

  /** 行末コメント（#以降）を落とす。文字列内の # は残す */
  function stripComment(s) {
    let inStr = false, q = '';
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (inStr) { if (c === q) inStr = false; continue; }
      if (c === '"' || c === '「') { inStr = true; q = (c === '「') ? '」' : '"'; continue; }
      if (c === '#') return s.slice(0, i);
    }
    return s;
  }

  /* ---------------------------------------------------------------
     1. 字句解析（式のみ。文の骨格は行単位の正規表現で扱う）
     --------------------------------------------------------------- */
  const RE_ID_START = /[A-Za-z_぀-ゟ゠-ヿ一-鿿]/;
  const RE_ID_PART = /[A-Za-z0-9_぀-ゟ゠-ヿ一-鿿]/;
  const LOGIC_WORDS = ['and', 'or', 'not', 'かつ', 'または'];

  function tokenize(src, line) {
    const toks = [];
    let i = 0;
    while (i < src.length) {
      const c = src[i];
      if (/\s/.test(c)) { i++; continue; }

      if (src.startsWith('【外部からの入力】', i)) { toks.push({ t: 'input' }); i += 9; continue; }

      if (/[0-9]/.test(c)) {
        let j = i;
        while (j < src.length && /[0-9.]/.test(src[j])) j++;
        toks.push({ t: 'num', v: parseFloat(src.slice(i, j)) });
        i = j; continue;
      }

      if (c === '"' || c === '「') {
        const close = c === '「' ? '」' : '"';
        let j = i + 1, buf = '';
        while (j < src.length && src[j] !== close) { buf += src[j]; j++; }
        if (j >= src.length) throw new DnclError('文字列の閉じ記号（"）がありません', line);
        toks.push({ t: 'str', v: buf });
        i = j + 1; continue;
      }

      const two = src.substr(i, 2);
      if (['==', '!=', '>=', '<=', '**'].includes(two)) { toks.push({ t: 'op', v: two }); i += 2; continue; }
      if ('+-*/÷%<>(),[]'.includes(c)) { toks.push({ t: 'op', v: c }); i++; continue; }
      if (c === '=') { toks.push({ t: 'op', v: '=' }); i++; continue; }

      if (RE_ID_START.test(c)) {
        let j = i;
        while (j < src.length && RE_ID_PART.test(src[j])) j++;
        const w = src.slice(i, j);
        if (LOGIC_WORDS.includes(w)) toks.push({ t: 'logic', v: w });
        else toks.push({ t: 'id', v: w });
        i = j; continue;
      }

      throw new DnclError(`使えない文字「${c}」があります`, line);
    }
    return toks;
  }

  /* ---------------------------------------------------------------
     2. 式の構文解析（再帰下降）
     --------------------------------------------------------------- */
  function parseExpression(src, line) {
    const toks = tokenize(src, line);
    let p = 0;
    const peek = () => toks[p];
    const next = () => toks[p++];
    const isOp = (v) => peek() && peek().t === 'op' && peek().v === v;
    const isLogic = (v) => peek() && peek().t === 'logic' && peek().v === v;
    const eat = (v) => { if (!isOp(v)) throw new DnclError(`「${v}」が必要です`, line); p++; };

    function parseOr() {
      let l = parseAnd();
      while (isLogic('or') || isLogic('または')) { next(); l = { type: 'logic', op: 'or', l, r: parseAnd() }; }
      return l;
    }
    function parseAnd() {
      let l = parseNot();
      while (isLogic('and') || isLogic('かつ')) { next(); l = { type: 'logic', op: 'and', l, r: parseNot() }; }
      return l;
    }
    function parseNot() {
      if (isLogic('not')) { next(); return { type: 'not', e: parseNot() }; }
      return parseCmp();
    }
    function parseCmp() {
      let l = parseAdd();
      while (peek() && peek().t === 'op' && ['==', '!=', '<', '<=', '>', '>='].includes(peek().v)) {
        const op = next().v;
        l = { type: 'bin', op, l, r: parseAdd() };
      }
      return l;
    }
    function parseAdd() {
      let l = parseMul();
      while (peek() && peek().t === 'op' && ['+', '-'].includes(peek().v)) {
        const op = next().v; l = { type: 'bin', op, l, r: parseMul() };
      }
      return l;
    }
    function parseMul() {
      let l = parsePow();
      while (peek() && peek().t === 'op' && ['*', '/', '÷', '%'].includes(peek().v)) {
        const op = next().v; l = { type: 'bin', op, l, r: parsePow() };
      }
      return l;
    }
    function parsePow() {
      const l = parseUnary();
      if (isOp('**')) { next(); return { type: 'bin', op: '**', l, r: parsePow() }; }
      return l;
    }
    function parseUnary() {
      if (isOp('-')) { next(); return { type: 'neg', e: parseUnary() }; }
      if (isOp('+')) { next(); return parseUnary(); }
      return parsePrimary();
    }
    function parsePrimary() {
      const tk = peek();
      if (!tk) throw new DnclError('式が途中で終わっています', line);
      if (tk.t === 'num') { next(); return { type: 'num', v: tk.v }; }
      if (tk.t === 'str') { next(); return { type: 'str', v: tk.v }; }
      if (tk.t === 'input') { next(); return { type: 'input' }; }
      if (isOp('(')) { next(); const e = parseOr(); eat(')'); return { type: 'group', e }; }
      if (isOp('[')) {
        next();
        const items = [];
        if (!isOp(']')) {
          items.push(parseOr());
          while (isOp(',')) { next(); items.push(parseOr()); }
        }
        eat(']');
        return { type: 'array', items };
      }
      if (tk.t === 'id') {
        next();
        if (isOp('(')) {
          next();
          const args = [];
          if (!isOp(')')) {
            args.push(parseOr());
            while (isOp(',')) { next(); args.push(parseOr()); }
          }
          eat(')');
          return { type: 'call', name: tk.v, args };
        }
        if (isOp('[')) {
          next();
          const idx = [parseOr()];
          while (isOp(',')) { next(); idx.push(parseOr()); }
          eat(']');
          return { type: 'index', name: tk.v, idx };
        }
        return { type: 'var', name: tk.v };
      }
      throw new DnclError('式として読み取れない部分があります', line);
    }

    const ast = parseOr();
    if (p < toks.length) throw new DnclError('式のあとに余分な記述があります', line);
    return ast;
  }

  /* ---------------------------------------------------------------
     3. 文の構文解析
     --------------------------------------------------------------- */
  function splitTopLevel(s, sep) {
    const out = [];
    let depth = 0, inStr = false, q = '', cur = '';
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (inStr) { cur += c; if (c === q) inStr = false; continue; }
      if (c === '"' || c === '「') { inStr = true; q = c === '「' ? '」' : '"'; cur += c; continue; }
      if (c === '(' || c === '[') depth++;
      if (c === ')' || c === ']') depth--;
      if (c === sep && depth === 0) { out.push(cur); cur = ''; continue; }
      cur += c;
    }
    out.push(cur);
    return out;
  }

  /** 代入の「=」の位置（==, !=, <=, >= は除く）。無ければ -1 */
  function findAssignEq(s) {
    let depth = 0, inStr = false, q = '';
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (inStr) { if (c === q) inStr = false; continue; }
      if (c === '"' || c === '「') { inStr = true; q = c === '「' ? '」' : '"'; continue; }
      if (c === '(' || c === '[') depth++;
      if (c === ')' || c === ']') depth--;
      if (c === '=' && depth === 0) {
        if (s[i + 1] === '=') { i++; continue; }
        if (['!', '<', '>'].includes(s[i - 1])) continue;
        return i;
      }
    }
    return -1;
  }

  const RE_IF = /^もし\s*(.+?)\s*ならば\s*:?\s*$/;
  const RE_ELIF = /^そうでなくもし\s*(.+?)\s*ならば\s*:?\s*$/;
  const RE_ELSE = /^そうでなければ\s*:?\s*$/;
  const RE_FOR = /^(.+?)\s*を\s*(.+?)\s*から\s*(.+?)\s*まで\s*(.+?)\s*ずつ\s*(増やし|減らし)ながら\s*繰り返す\s*:?\s*$/;
  const RE_WHILE = /^(.+?)\s*の\s*間\s*繰り返す\s*:?\s*$/;
  const RE_FILLALL = /^(.+?)\s*の\s*すべての\s*(値|要素)を\s*(.+?)\s*(に|を)\s*(する|代入する)\s*$/;
  const RE_FUNCDEF = /^関数定義\s+(.+?)\s*\((.*?)\)\s*:?\s*$/;
  const RE_RETURN = /^戻り値\s*\((.*)\)\s*$/;

  function parseProgram(codeLines) {
    // 行 → { depth, body, lineNo }
    const raws = [];
    codeLines.forEach((raw, idx) => {
      const { boxes, spaces, body } = splitIndent(normalize(raw));
      const clean = stripComment(body).trim();
      if (clean === '') return;
      raws.push({ boxes, spaces, body: clean, lineNo: idx + 1 });
    });

    // 深さの決め方: 罫線（│ └）が1つでもあればその本数。無ければ字下げ幅の順位。
    const useBox = raws.some(r => r.boxes > 0);
    let widths = [];
    if (!useBox) {
      widths = Array.from(new Set(raws.map(r => r.spaces))).sort((a, b) => a - b);
    }
    const rows = raws.map(r => ({
      depth: useBox ? r.boxes : widths.indexOf(r.spaces),
      body: r.body,
      lineNo: r.lineNo
    }));

    function build(start, depth) {
      const stmts = [];
      let i = start;
      while (i < rows.length) {
        const row = rows[i];
        if (row.depth < depth) break;
        if (row.depth > depth) throw new DnclError('字下げ（インデント）が合っていません', row.lineNo);

        let m;
        if ((m = row.body.match(RE_IF))) {
          const stmt = { type: 'if', line: row.lineNo, branches: [], elseBody: null, elseLine: null };
          const cond = parseExpression(m[1], row.lineNo);
          const r1 = build(i + 1, depth + 1);
          stmt.branches.push({ line: row.lineNo, condSrc: m[1], cond, body: r1.stmts });
          i = r1.next;
          // そうでなくもし / そうでなければ
          while (i < rows.length && rows[i].depth === depth) {
            const nm = rows[i].body.match(RE_ELIF);
            if (nm) {
              const c2 = parseExpression(nm[1], rows[i].lineNo);
              const r2 = build(i + 1, depth + 1);
              stmt.branches.push({ line: rows[i].lineNo, condSrc: nm[1], cond: c2, body: r2.stmts });
              i = r2.next;
              continue;
            }
            if (RE_ELSE.test(rows[i].body)) {
              stmt.elseLine = rows[i].lineNo;
              const r3 = build(i + 1, depth + 1);
              stmt.elseBody = r3.stmts;
              i = r3.next;
            }
            break;
          }
          stmts.push(stmt);
          continue;
        }

        if ((m = row.body.match(RE_FOR))) {
          const r = build(i + 1, depth + 1);
          stmts.push({
            type: 'for', line: row.lineNo,
            varName: m[1].trim(),
            from: parseExpression(m[2], row.lineNo),
            to: parseExpression(m[3], row.lineNo),
            step: parseExpression(m[4], row.lineNo),
            dir: m[5] === '増やし' ? 1 : -1,
            body: r.stmts
          });
          i = r.next;
          continue;
        }

        if ((m = row.body.match(RE_WHILE))) {
          const r = build(i + 1, depth + 1);
          stmts.push({
            type: 'while', line: row.lineNo,
            condSrc: m[1], cond: parseExpression(m[1], row.lineNo), body: r.stmts
          });
          i = r.next;
          continue;
        }

        if ((m = row.body.match(RE_FILLALL))) {
          stmts.push({
            type: 'fillall', line: row.lineNo,
            name: m[1].trim(), value: parseExpression(m[3], row.lineNo)
          });
          i++; continue;
        }

        if ((m = row.body.match(RE_FUNCDEF))) {
          const params = m[2].trim() === '' ? [] : splitTopLevel(m[2], ',').map(s => s.trim());
          const r = build(i + 1, depth + 1);
          if (!r.stmts.length) throw new DnclError('関数の中身がありません（字下げして書いてください）', row.lineNo);
          stmts.push({ type: 'funcdef', line: row.lineNo, name: m[1].trim(), params, body: r.stmts });
          i = r.next;
          continue;
        }

        if ((m = row.body.match(RE_RETURN))) {
          stmts.push({ type: 'return', line: row.lineNo, exprSrc: m[1].trim(), expr: parseExpression(m[1], row.lineNo) });
          i++; continue;
        }

        if (RE_ELIF.test(row.body) || RE_ELSE.test(row.body)) {
          throw new DnclError('対応する「もし」が見つかりません', row.lineNo);
        }

        // 代入 or 式文（カンマ区切りで複数可）
        const parts = splitTopLevel(row.body, ',');
        const simple = [];
        let usedParts = parts;
        // 「表示する(a, b)」のようにカンマがあっても代入でない場合は分割しない
        if (parts.length > 1 && findAssignEq(parts[0]) === -1) usedParts = [row.body];
        for (const part of usedParts) {
          const src = part.trim();
          if (src === '') continue;
          const eq = findAssignEq(src);
          if (eq >= 0) {
            const lhs = src.slice(0, eq).trim();
            const rhs = src.slice(eq + 1).trim();
            const target = parseExpression(lhs, row.lineNo);
            if (target.type !== 'var' && target.type !== 'index') {
              throw new DnclError('「=」の左辺は変数または配列の要素にしてください', row.lineNo);
            }
            simple.push({ kind: 'assign', target, targetSrc: lhs, expr: parseExpression(rhs, row.lineNo), exprSrc: rhs });
          } else {
            simple.push({ kind: 'expr', expr: parseExpression(src, row.lineNo), exprSrc: src });
          }
        }
        stmts.push({ type: 'simple', line: row.lineNo, items: simple });
        i++;
      }
      return { stmts, next: i };
    }

    const r = build(0, 0);
    if (r.next < rows.length) throw new DnclError('字下げ（インデント）が合っていません', rows[r.next].lineNo);
    return r.stmts;
  }

  /* ---------------------------------------------------------------
     4. 実行
     --------------------------------------------------------------- */
  function fmt(v) {
    if (v === null || v === undefined) return '—';
    if (typeof v === 'boolean') return v ? '真' : '偽';
    if (typeof v === 'number') {
      if (Number.isInteger(v)) return String(v);
      return String(Math.round(v * 1e6) / 1e6);
    }
    if (Array.isArray(v)) return '[' + v.map(fmt).join(', ') + ']';
    return String(v);
  }
  function fmtQ(v) { return typeof v === 'string' ? '"' + v + '"' : fmt(v); }

  class Env {
    constructor(indexBase) {
      this.vars = new Map();
      this.indexBase = indexBase;
    }
    snapshot() {
      const o = {};
      for (const [k, v] of this.vars) o[k] = Array.isArray(v) ? v.slice() : v;
      return o;
    }
  }

  const BUILTINS = {
    '要素数': (args) => {
      if (!Array.isArray(args[0])) throw new DnclError('要素数() には配列を渡してください');
      return args[0].length;
    },
    '切り捨て': (args) => Math.floor(args[0]),
    '切り上げ': (args) => Math.ceil(args[0]),
    '四捨五入': (args) => Math.round(args[0]),
    '整数': (args) => Math.floor(args[0]),
    '絶対値': (args) => Math.abs(args[0]),
    '乱数': () => Math.random()
  };

  function makeRunner(ast, opts) {
    const env = new Env(opts.indexBase || 0);
    const output = [];
    const inputs = (opts.inputs || []).slice();
    let stepCount = 0;
    const MAX_STEPS = opts.maxSteps || 4000;

    // 実行ステップの記録先。関数の中の処理もこの配列に順番どおり入る
    const steps = [];
    function emit(s) { steps.push(s); }

    // ユーザー定義関数（関数定義 名前(引数...): で登録される）
    const funcs = new Map();
    // 実行中の関数のローカル変数。null ならグローバルを実行中
    let locals = null;
    let callDepth = 0;

    /** 変数名がどのスコープにあるかを返す（関数内はローカル優先） */
    function scopeOf(name) {
      if (locals && locals.has(name)) return locals;
      if (env.vars.has(name)) return env.vars;
      return null;
    }
    /** 書き込み先スコープ（関数の中ではローカルに書く） */
    function writeScope() { return locals || env.vars; }

    function snapshot() {
      const o = {};
      for (const [k, v] of env.vars) o[k] = Array.isArray(v) ? v.slice() : v;
      if (locals) for (const [k, v] of locals) o[k] = Array.isArray(v) ? v.slice() : v;
      return o;
    }

    // 「式がどの変数・配列要素を読んだか」の記録。
    // アニメーション側で参照元を光らせるために使う。記録したい区間だけ配列にする。
    let reads = null;

    function getVar(name, line) {
      const m = scopeOf(name);
      if (!m) throw new DnclError(`変数 ${name} にはまだ値が入っていません`, line);
      return m.get(name);
    }

    function realIndex(name, i, line) {
      const m = scopeOf(name);
      const arr = m && m.get(name);
      if (!Array.isArray(arr)) throw new DnclError(`${name} は配列ではありません`, line);
      const k = i - env.indexBase;
      if (!Number.isInteger(k) || k < 0 || k >= arr.length) {
        const lo = env.indexBase, hi = env.indexBase + arr.length - 1;
        throw new DnclError(`添字が範囲外です（${name} の添字は ${lo}〜${hi}。${fmt(i)} が指定されました）`, line);
      }
      return k;
    }

    function ev(n, line) {
      switch (n.type) {
        case 'num': return n.v;
        case 'str': return n.v;
        case 'group': return ev(n.e, line);
        case 'array': return n.items.map(x => ev(x, line));
        case 'input': {
          if (inputs.length === 0) throw new DnclError('外部からの入力が足りません', line);
          const raw = inputs.shift();
          const num = Number(raw);
          return (raw !== '' && !Number.isNaN(num)) ? num : raw;
        }
        case 'var': {
          const m = scopeOf(n.name);
          if (!m) throw new DnclError(`変数 ${n.name} にはまだ値が入っていません`, line);
          const v = m.get(n.name);
          if (reads && !Array.isArray(v)) reads.push({ name: n.name, index: null });
          return v;
        }
        case 'index': {
          if (!scopeOf(n.name)) throw new DnclError(`配列 ${n.name} はまだ作られていません`, line);
          const i = ev(n.idx[0], line);
          const k = realIndex(n.name, i, line);
          if (reads) reads.push({ name: n.name, index: i });
          return scopeOf(n.name).get(n.name)[k];
        }
        case 'call': {
          const args = n.args.map(a => ev(a, line));
          if (funcs.has(n.name)) return callUserFunc(funcs.get(n.name), args, line);
          const f = BUILTINS[n.name];
          if (!f) throw new DnclError(`関数 ${n.name}() は用意されていません`, line);
          return f(args);
        }
        case 'neg': return -ev(n.e, line);
        case 'not': return !truthy(ev(n.e, line));
        case 'logic': {
          const l = truthy(ev(n.l, line));
          if (n.op === 'and') return l ? truthy(ev(n.r, line)) : false;
          return l ? true : truthy(ev(n.r, line));
        }
        case 'bin': {
          const a = ev(n.l, line), b = ev(n.r, line);
          switch (n.op) {
            case '+': return (typeof a === 'string' || typeof b === 'string') ? String(fmt(a)) + String(fmt(b)) : a + b;
            case '-': return a - b;
            case '*': return a * b;
            case '/':
              if (b === 0) throw new DnclError('0 で割ることはできません', line);
              return a / b;
            case '÷':
              if (b === 0) throw new DnclError('0 で割ることはできません', line);
              return Math.floor(a / b);
            case '%':
              if (b === 0) throw new DnclError('0 で割ることはできません', line);
              return a - Math.floor(a / b) * b;
            case '**': return Math.pow(a, b);
            case '==': return a === b;
            case '!=': return a !== b;
            case '<': return a < b;
            case '<=': return a <= b;
            case '>': return a > b;
            case '>=': return a >= b;
          }
          throw new DnclError(`演算子 ${n.op} は使えません`, line);
        }
      }
      throw new DnclError('実行できない式です', line);
    }

    function truthy(v) { return v === true || (typeof v === 'number' && v !== 0); }

    /** 式を「値を当てはめた形」に描き直す（例: goukei + Seiseki[i] → 0 + 50） */
    function trace(n, line) {
      const saved = reads;
      reads = null;   // 描き直しのための再評価は「読んだ」に数えない
      try {
        return trace_(n, line);
      } finally {
        reads = saved;
      }
    }
    function trace_(n, line) {
      try {
        switch (n.type) {
          case 'num': return fmt(n.v);
          case 'str': return '"' + n.v + '"';
          case 'group': return '(' + trace(n.e, line) + ')';
          case 'array': return '[' + n.items.map(x => trace(x, line)).join(', ') + ']';
          case 'input': return '【入力】';
          case 'var': return fmt(getVar(n.name, line));
          case 'index': return fmt(ev(n, line));
          case 'call': return n.name + '(' + n.args.map(a => trace(a, line)).join(', ') + ')';
          case 'neg': return '-' + trace(n.e, line);
          case 'not': return 'not ' + trace(n.e, line);
          case 'logic': return trace(n.l, line) + ' ' + n.op + ' ' + trace(n.r, line);
          case 'bin': return trace(n.l, line) + ' ' + n.op + ' ' + trace(n.r, line);
        }
      } catch (e) { return '？'; }
      return '？';
    }

    function ev_(n, line) { return ev(n, line); }

    /** fn を実行し、その間に読んだ変数・配列要素を { value, reads } で返す */
    function capture(fn) {
      const saved = reads;
      reads = [];
      try {
        const value = fn();
        return { value, reads };
      } finally {
        reads = saved;
      }
    }

    function step(line, kind, desc, extra) {
      stepCount++;
      if (stepCount > MAX_STEPS) {
        throw new DnclError('処理が終わりません。繰り返しの条件を見直してください（無限ループの可能性）', line);
      }
      return Object.assign({
        line, kind, desc,
        vars: snapshot(),
        output: output.slice()
      }, extra || {});
    }

    /** ユーザー定義関数を呼び出す。中の処理も1ステップずつ記録される */
    function callUserFunc(def, args, callLine) {
      if (args.length !== def.params.length) {
        throw new DnclError(`関数 ${def.name}() の引数は ${def.params.length} 個です（${args.length} 個渡されました）`, callLine);
      }
      if (callDepth >= 30) throw new DnclError('関数の呼び出しが深くなりすぎました', callLine);
      callDepth++;
      const savedLocals = locals;
      const savedReads = reads;
      reads = null;   // 関数の中の読み取りは、呼び出し元の式の reads に混ぜない
      locals = new Map();
      def.params.forEach((p, k) => locals.set(p, args[k]));
      try {
        emit(step(callLine, 'call',
          `関数 ${def.name}(${args.map(fmt).join(', ')}) を呼び出します` +
          (def.params.length ? `（${def.params.map((p, k) => `${p} = ${fmt(args[k])}`).join('、')} として実行）` : ''),
          {}));
        let ret = null;
        try {
          runBlock(def.body);
          emit(step(def.line, 'return', `関数 ${def.name} は 戻り値() が無いまま終わりました`, { value: null }));
        } catch (e) {
          if (e && e.__return) ret = e.value;
          else throw e;
        }
        return ret;
      } finally {
        locals = savedLocals;
        reads = savedReads;
        callDepth--;
      }
    }

    function runBlock(stmts) {
      for (const st of stmts) runStmt(st);
    }

    function runStmt(st) {
      switch (st.type) {
        case 'simple': {
          for (const it of st.items) {
            if (it.kind === 'assign') {
              const shown = trace(it.expr, st.line);
              const cap = capture(() => ev_(it.expr, st.line));
              const val = cap.value;
              let label, target;
              if (it.target.type === 'var') {
                writeScope().set(it.target.name, val);
                label = it.target.name;
                target = { name: it.target.name, index: null };
              } else {
                const name = it.target.name;
                if (!scopeOf(name)) throw new DnclError(`配列 ${name} はまだ作られていません`, st.line);
                const icap = capture(() => ev_(it.target.idx[0], st.line));
                const i = icap.value;
                cap.reads.push(...icap.reads);
                const k = realIndex(name, i, st.line);
                scopeOf(name).get(name)[k] = val;
                label = `${name}[${fmt(i)}]`;
                target = { name, index: i };
              }
              const same = (shown === fmt(val));
              emit(step(st.line, 'assign',
                same ? `${label} に ${fmt(val)} を代入しました`
                     : `${label} = ${shown} を計算して、${label} は ${fmt(val)} になりました`,
                { changed: [it.target.name], value: val, target, reads: cap.reads }));
            } else {
              const e = it.expr;
              if (e.type === 'call' && e.name === '表示する') {
                const cap = capture(() => e.args.map(a => ev_(a, st.line)));
                const text = cap.value.map(v => fmt(v)).join('');
                output.push(text);
                emit(step(st.line, 'output', `「${text}」と表示しました`, { text, reads: cap.reads }));
              } else {
                const v = ev_(e, st.line);
                emit(step(st.line, 'expr', `${it.exprSrc} を実行しました`, { value: v }));
              }
            }
          }
          return;
        }

        case 'fillall': {
          const v = ev_(st.value, st.line);
          const m = scopeOf(st.name);
          const arr = m && m.get(st.name);
          if (!Array.isArray(arr)) throw new DnclError(`${st.name} は配列ではありません`, st.line);
          for (let i = 0; i < arr.length; i++) arr[i] = v;
          emit(step(st.line, 'assign', `${st.name} のすべての要素を ${fmt(v)} にしました`, { changed: [st.name] }));
          return;
        }

        case 'funcdef': {
          funcs.set(st.name, st);
          emit(step(st.line, 'funcdef',
            `関数 ${st.name}(${st.params.join(', ')}) を定義しました。中の処理は呼び出されたときに実行されます`, {}));
          return;
        }

        case 'return': {
          if (!locals) throw new DnclError('戻り値() は関数の中でしか使えません', st.line);
          const shown = trace(st.expr, st.line);
          const cap = capture(() => ev_(st.expr, st.line));
          const same = (shown === fmt(cap.value));
          emit(step(st.line, 'return',
            `戻り値(${st.exprSrc}) ${same ? '' : `= ${shown} `}→ ${fmt(cap.value)} を呼び出し元に返します`,
            { value: cap.value, reads: cap.reads }));
          throw { __return: true, value: cap.value };
        }

        case 'if': {
          for (const br of st.branches) {
            const shown = trace(br.cond, br.line);
            const cap = capture(() => truthy(ev_(br.cond, br.line)));
            const ok = cap.value;
            emit(step(br.line, 'cond',
              `条件「${br.condSrc}」→ ${shown} → ${ok ? '真（成り立つ）。中の処理を実行します' : '偽（成り立たない）。中の処理はとばします'}`,
              { result: ok, reads: cap.reads }));
            if (ok) { runBlock(br.body); return; }
          }
          if (st.elseBody) {
            emit(step(st.elseLine, 'cond', 'どの条件にも当てはまらないので、こちらの処理を実行します', { result: true }));
            runBlock(st.elseBody);
          }
          return;
        }

        case 'for': {
          const from = ev_(st.from, st.line);
          const to = ev_(st.to, st.line);
          const stepV = ev_(st.step, st.line);
          writeScope().set(st.varName, from);
          emit(step(st.line, 'loop',
            `${st.varName} に ${fmt(from)} を入れて繰り返しを始めます（${fmt(from)} から ${fmt(to)} まで ${fmt(stepV)} ずつ${st.dir > 0 ? '増やす' : '減らす'}）`,
            { changed: [st.varName], loopVar: { name: st.varName, value: from } }));
          let guard = 0;
          while (true) {
            const cur = writeScope().get(st.varName);
            const cont = st.dir > 0 ? cur <= to : cur >= to;
            if (!cont) {
              emit(step(st.line, 'loopend',
                `${st.varName} が ${fmt(cur)} になり、${fmt(to)} を${st.dir > 0 ? '超えた' : '下回った'}ので繰り返しを終わります`,
                { loopVar: { name: st.varName, value: cur } }));
              return;
            }
            emit(step(st.line, 'loopiter', `${st.varName} = ${fmt(cur)} の回を実行します`,
              { changed: [st.varName], loopVar: { name: st.varName, value: cur } }));
            runBlock(st.body);
            const nv = writeScope().get(st.varName) + st.dir * stepV;
            writeScope().set(st.varName, nv);
            if (++guard > 100000) throw new DnclError('繰り返しが多すぎます', st.line);
          }
        }

        case 'while': {
          let guard = 0;
          while (true) {
            const shown = trace(st.cond, st.line);
            const cap = capture(() => truthy(ev_(st.cond, st.line)));
            const ok = cap.value;
            emit(step(st.line, ok ? 'loopiter' : 'loopend',
              `条件「${st.condSrc}」→ ${shown} → ${ok ? '真。もう一度くり返します' : '偽。繰り返しを終わります'}`,
              { result: ok, reads: cap.reads }));
            if (!ok) return;
            runBlock(st.body);
            if (++guard > 100000) throw new DnclError('繰り返しが多すぎます', st.line);
          }
        }
      }
    }

    return { env, output, steps, run: () => runBlock(ast) };
  }

  /**
   * コード（文字列配列）を実行し、ステップの配列を返す
   * @returns {{steps:Array, output:string[], error:DnclError|null}}
   */
  function execute(codeLines, opts) {
    opts = opts || {};
    let steps = [];
    let error = null;
    let output = [];
    try {
      const ast = parseProgram(codeLines);
      const runner = makeRunner(ast, opts);
      steps = runner.steps;   // エラーで中断しても、そこまでのステップは残る
      runner.run();
      output = runner.output;
    } catch (e) {
      if (e instanceof DnclError) {
        error = e;
        if (steps.length) output = steps[steps.length - 1].output;
      } else if (e && e.__return) {
        error = new DnclError('戻り値() は関数の中でしか使えません', null);
      } else {
        error = new DnclError('実行中に問題が起きました: ' + e.message, null);
      }
    }
    return { steps, output, error };
  }

  global.DNCL = { execute, parseProgram, normalize, fmt, DnclError };
})(window);
