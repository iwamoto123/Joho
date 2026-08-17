/* =========================================================================
   tools/test-problems.js
   DNCLインタプリタと組み込み問題の検証。ブラウザを開かずに確認できる。

     node tools/test-problems.js

   チェックしている内容:
     1) 組み込み問題を「正解を入れた状態」で実行し、エラーが出ないこと
     2) 各空欄の正解が選択肢に含まれていること（含まれていないと解けない）
     3) 公式リファレンス例（二分探索）が公式の実行結果と一致すること
     4) 代表的な誤答・異常系が、落ちずに適切なエラーメッセージを返すこと
   ========================================================================= */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
global.window = global;
eval(fs.readFileSync(path.join(ROOT, 'dncl.js'), 'utf8'));
eval(fs.readFileSync(path.join(ROOT, 'problems.js'), 'utf8'));

let fail = 0;
const NG = (m) => { console.log('  ✗ ' + m); fail++; };
const OK = (m) => console.log('  ✓ ' + m);

/* ---------- 1) 2) 組み込み問題 ---------- */
for (const setId of Object.keys(global.PROBLEM_SETS)) {
  const set = global.PROBLEM_SETS[setId];
  console.log(`\n=== セット: ${set.title} (${setId}) ===`);
  for (const p of set.problems) {
    console.log(`\n[${p.title}]`);
    const filled = {};
    (p.blanks || []).forEach(b => { filled[b.id] = b.answer; });
    const code = p.code.map(l => l.replace(/\{\{(\d+)\}\}/g, (m, id) => filled[id]));
    const res = DNCL.execute(code, { indexBase: p.indexBase || 0 });

    if (res.error) NG(`実行エラー: ${res.error.message}（${res.error.line}行目）`);
    else OK(`実行OK（${res.steps.length}ステップ）`);

    (p.blanks || []).forEach(b => {
      if (!p.choices.includes(b.answer)) NG(`空欄${b.id}の正解「${b.answer}」が選択肢にない`);
    });
    if ((p.blanks || []).every(b => p.choices.includes(b.answer))) OK('正解がすべて選択肢に含まれている');

    console.log('  出力: ' + JSON.stringify(res.output));
    if (res.steps.length) {
      const v = res.steps[res.steps.length - 1].vars;
      console.log('  最終変数: ' + Object.keys(v).map(k => `${k}=${DNCL.fmt(v[k])}`).join(', '));
    }
  }
}

/* ---------- 3) 公式リファレンス例（試作問題「情報」概要 p.19 の二分探索） ---------- */
console.log('\n=== 公式リファレンス例（二分探索・入力52）===');
const BINSEARCH = [
  'Data=[3,18,29,33,48,52,62,77,89,97]',
  'kazu=要素数(Data)',
  '表示する("0〜99の数字を入力してください")',
  'atai=【外部からの入力】',
  'hidari=0 , migi=kazu-1',
  'owari=0',
  'hidari <= migi and owari==0 の間繰り返す:',
  '│  aida=(hidari+migi)÷2      #演算子÷は商の整数値を返す',
  '│  もし Data[aida]==atai ならば:',
  '│  │  表示する(atai,"は",aida,"番目にあります")',
  '│  │  owari=1',
  '│  そうでなくもし Data[aida]<atai ならば:',
  '│  │  hidari=aida+1',
  '│  そうでなければ:',
  '│  └  migi=aida-1',
  'もし owari==0 ならば:',
  '│  表示する(atai,"は見つかりませんでした")',
  '表示する("添字"," ","要素")',
  'i を 0 から kazu-1 まで 1 ずつ増やしながら繰り返す:',
  '└  表示する(i,"  ",Data[i])'
];
const bs = DNCL.execute(BINSEARCH, { indexBase: 0, inputs: ['52'] });
if (bs.error) NG(`実行エラー: ${bs.error.message}（${bs.error.line}行目）`);
else if (bs.output[1] !== '52は5番目にあります') NG('公式の実行結果と一致しない: ' + bs.output[1]);
else OK('公式の実行結果と一致（52は5番目にあります）');

/* ---------- 4) 誤答・異常系 ---------- */
console.log('\n=== 誤答・異常系 ===');
const cases = [
  ['添字はみ出し', ['A = [1,2,3]', 'i を 0 から 3 まで 1 ずつ増やしながら繰り返す:', '└  表示する(A[i])'], /添字が範囲外/],
  ['未定義変数', ['x = y + 1'], /まだ値が入っていません/],
  ['無限ループ', ['i = 0', 'i < 10 の間繰り返す:', '└  i = i - 1'], /処理が終わりません/],
  ['0除算', ['x = 1 / 0'], /0 で割る/],
  ['空欄未入力', ['x = ?'], /使えない文字/],
  ['半角スペース字下げ', ['t = 0', 'i を 0 から 2 まで 1 ずつ増やしながら繰り返す:', '    t = t + i', '表示する(t)'], null],
  ['複数代入', ['a = 0, b = 46', '表示する(a, ",", b)'], null],
  ['すべての値を0に', ['T = [1,2,3]', 'Tのすべての値を0にする', '表示する(T[0], T[1], T[2])'], null],
  ['全角の混在', ['ｘ ＝ １０', '表示する（ｘ）'], null],
  ['行番号つきコード', ['(01) x = 5', '(02) 表示する(x)'], null],
  ['戻り値が関数の外', ['戻り値(1)'], /関数の中でしか使えません/],
  ['再帰の深さ制限', ['関数定義 f(x):', '└  戻り値(f(x))', 'y = f(1)'], /深くなりすぎました/],
  ['関数のローカル変数は外から見えない', ['関数定義 f(x):', '└  戻り値(x + 1)', 'y = f(1)', '表示する(x)'], /まだ値が入っていません/]
];
for (const [name, code, expectErr] of cases) {
  const r = DNCL.execute(code, { indexBase: 0 });
  if (expectErr) {
    if (r.error && expectErr.test(r.error.message)) OK(`${name}: 想定どおりのエラー「${r.error.message}」`);
    else NG(`${name}: 想定のエラーが出ない（${r.error ? r.error.message : '正常終了 ' + JSON.stringify(r.output)}）`);
  } else {
    if (r.error) NG(`${name}: エラーになった「${r.error.message}」`);
    else OK(`${name}: 正常終了 ${JSON.stringify(r.output)}`);
  }
}

console.log(fail === 0 ? '\n■ すべて OK' : `\n■ ${fail} 件の問題あり`);
process.exit(fail === 0 ? 0 : 1);
