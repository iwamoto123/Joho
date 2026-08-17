/* =========================================================================
   problems.js — 組み込みの問題セット
   教材:「共通テスト情報 プログラミング講座① 基礎まとめ」に対応
   code は共通テスト用プログラム表記。{{n}} が穴埋め欄。
   ========================================================================= */
(function (global) {
  'use strict';

  const SEISEKI = 'Seiseki = [50, 30, 60, 45, 85]';
  const NAMAE = 'Namae = ["Aさん", "Bさん", "Cさん", "Dさん", "Eさん"]';

  const SET_SEISEKI = {
    id: 'seiseki-basic',
    title: '配列と繰り返しの基本（テストの成績データ）',
    intro:
      '5人のテストの点数が配列 Seiseki に入っています。この配列を使って、合計・入れ替え・条件分岐・最小値の求め方を順に練習します。<br>' +
      '<b>配列の添字は 0 から数えます。</b>5人なら添字は 0, 1, 2, 3, 4 です。',
    dataTable: {
      head: ['', 'Aさん', 'Bさん', 'Cさん', 'Dさん', 'Eさん'],
      rows: [['添字', '0', '1', '2', '3', '4'], ['点数', '50', '30', '60', '45', '85']]
    },
    problems: [
      /* ---------------------------------------------------------------- 1 */
      {
        id: 'q1',
        title: '(1) 合計点と平均点',
        question:
          '5人の合計点を <code>total</code>、平均点を <code>average</code> として求め、表示するプログラムです。空欄を埋めて完成させましょう。',
        hint: '5人ぶんの点数を1つずつ total に足していきます。添字は 0 から 4 まで。平均は「合計 ÷ 人数」です。',
        indexBase: 0,
        code: [
          SEISEKI,
          'total = 0',
          'i を 0 から {{1}} まで 1 ずつ増やしながら繰り返す:',
          '└  {{2}}',
          'average = {{3}}',
          '表示する("合計点は", total, "点")',
          '表示する("平均点は", average, "点")'
        ],
        blanks: [
          { id: 1, answer: '4', explain: '要素は5個ですが添字は0から始まるので、最後の添字は 4 です。5 にすると Seiseki[5] を読もうとしてエラーになります。' },
          { id: 2, answer: 'total = total + Seiseki[i]', explain: '「いまの total に、i番目の点数を足して、また total に入れ直す」。これが累計の型です。' },
          { id: 3, answer: 'total / 5', explain: '平均は合計 ÷ 人数。人数は5人なので total / 5 です。' }
        ],
        choices: [
          '4', '5',
          'total = total + Seiseki[i]', 'total = Seiseki[i]', 'total = total + i',
          'total / 5', 'total / 4', 'total * 5'
        ]
      },

      /* ---------------------------------------------------------------- 2 */
      {
        id: 'q2',
        title: '(2) 2番目と3番目を入れ替える',
        question:
          '左から2番目（Bさん）と3番目（Cさん）の点数を入れ替えて、全員の点数を表示するプログラムです。空欄を埋めましょう。',
        hint: 'いきなり Seiseki[1] = Seiseki[2] とすると、もとの Seiseki[1] の値が消えてしまいます。先に別の変数へ「一時保存」しておきます。',
        indexBase: 0,
        code: [
          SEISEKI,
          'temp = {{1}}',
          'Seiseki[1] = {{2}}',
          'Seiseki[2] = {{3}}',
          'i を 0 から 4 まで 1 ずつ増やしながら繰り返す:',
          '└  表示する(Seiseki[i])'
        ],
        blanks: [
          { id: 1, answer: 'Seiseki[1]', explain: '左から2番目は添字 1。あとで上書きされて消えるので、先に temp へ避難させます。' },
          { id: 2, answer: 'Seiseki[2]', explain: '2番目の場所に、3番目の値を入れます。' },
          { id: 3, answer: 'temp', explain: '3番目の場所には、避難させておいた「もとの2番目の値」を入れます。' }
        ],
        choices: ['Seiseki[0]', 'Seiseki[1]', 'Seiseki[2]', 'Seiseki[3]', 'temp', '0']
      },

      /* ---------------------------------------------------------------- 3 */
      {
        id: 'q3',
        title: '(3) 10 で割った商の整数値の合計',
        question:
          'それぞれの点数を 10 で割った「商の整数値」を求め、その合計を <code>goukei</code> に入れて表示します。空欄に入る演算子を選びましょう。',
        hint: '商の整数値を求める演算子は ÷ です（/ は 5.0 のような小数になります。% は余りです）。',
        indexBase: 0,
        code: [
          SEISEKI,
          'goukei = 0',
          'i を 0 から 4 まで 1 ずつ増やしながら繰り返す:',
          '└  goukei = goukei {{1}} (Seiseki[i] {{2}} 10)',
          '表示する("商の整数値の合計は", goukei)'
        ],
        blanks: [
          { id: 1, answer: '+', explain: '合計なので、いまの goukei に足していきます。' },
          { id: 2, answer: '÷', explain: '÷ は商の整数部分（50 ÷ 10 は 5、45 ÷ 10 は 4）。/ だと 4.5 になり、% だと余りの 5 になってしまいます。' }
        ],
        choices: ['+', '-', '*', '/', '÷', '%', '**']
      },

      /* ---------------------------------------------------------------- 4 */
      {
        id: 'q4',
        title: '(4) 全員 +5 点、ただし 60 点はそのまま',
        question:
          '全員の点数に 5 点を加えた配列 <code>Seiseki2</code> を作ります。ただし、もとの点数が 60 点の人だけは加点せず、もとの値のままにします。',
        hint: 'まず全員に +5 してしまってから、60 点だった人だけ元に戻す、という順で考えます。「もとが60点かどうか」は Seiseki のほうを見て判定します。',
        indexBase: 0,
        code: [
          SEISEKI,
          NAMAE,
          'Seiseki2 = [0, 0, 0, 0, 0]',
          'i を 0 から 4 まで 1 ずつ増やしながら繰り返す:',
          '│  Seiseki2[i] = {{1}}',
          '│  もし {{2}} ならば:',
          '└  └  Seiseki2[i] = {{3}}',
          'i を 0 から 4 まで 1 ずつ増やしながら繰り返す:',
          '└  表示する(Namae[i], "は", Seiseki2[i], "点")'
        ],
        blanks: [
          { id: 1, answer: 'Seiseki[i] + 5', explain: 'まず全員ぶん +5 して Seiseki2 に入れます。もとの Seiseki は変えません。' },
          { id: 2, answer: 'Seiseki[i] == 60', explain: '「もとの点数が 60 点」なので、見るのは Seiseki のほう。等しいかどうかは == です（= は代入）。' },
          { id: 3, answer: 'Seiseki[i]', explain: '60点だった人は、もとの値に戻します。' }
        ],
        choices: [
          'Seiseki[i] + 5', 'Seiseki[i] - 5', 'Seiseki2[i] + 5',
          'Seiseki[i] == 60', 'Seiseki[i] != 60', 'Seiseki2[i] == 60',
          'Seiseki[i]', 'Seiseki2[i]'
        ]
      },

      /* ---------------------------------------------------------------- 5 */
      {
        id: 'q5',
        title: '(5) 35 点以上の人数（3人に達したら終了）',
        question:
          '35 点以上の人数を <code>akaten_kaihi</code> に数えます。ただし、配列の左から数えて <b>akaten_kaihi が 3 人に達した時点で処理を終了</b>します。',
        hint: '途中で止めたいので、順次繰り返しではなく「〜の間繰り返す」を使います。続ける条件は「まだ配列の中で、かつ、まだ3人に達していない」の2つを and でつなぎます。',
        indexBase: 0,
        code: [
          SEISEKI,
          'akaten_kaihi = 0',
          'i = 0',
          '{{1}} の間繰り返す:',
          '│  もし {{2}} ならば:',
          '│  └  akaten_kaihi = akaten_kaihi + 1',
          '└  i = i + 1',
          '表示する("35点以上は", akaten_kaihi, "人")',
          '表示する("調べたのは左から", i, "人目まで")'
        ],
        blanks: [
          { id: 1, answer: 'i <= 4 and akaten_kaihi < 3', explain: '「配列の範囲内(i <= 4)」かつ「まだ3人未満」の両方が成り立つ間だけ続けます。or にすると片方だけで続いてしまい、範囲外を読んでエラーになります。' },
          { id: 2, answer: 'Seiseki[i] >= 35', explain: '「35点以上」なので 35 を含みます。> だと 35 点ちょうどの人が数えられません。' }
        ],
        choices: [
          'i <= 4 and akaten_kaihi < 3', 'i <= 4 or akaten_kaihi < 3', 'i <= 4 and akaten_kaihi <= 3', 'akaten_kaihi < 3',
          'Seiseki[i] >= 35', 'Seiseki[i] > 35', 'Seiseki[i] <= 35'
        ]
      },

      /* ---------------------------------------------------------------- 6 */
      {
        id: 'q6',
        title: '(6) 最小の点数とその添字',
        question:
          '最小の点数を <code>min_tensuu</code>、そのときの添字を <code>min_i</code> に記録し、名前といっしょに表示します。空欄を埋めましょう。',
        hint: '「暫定1位」を1つずつ更新していく型です。最小を探すときは、最初の暫定値をわざと大きな値にしておきます。',
        indexBase: 0,
        code: [
          SEISEKI,
          NAMAE,
          'min_tensuu = {{1}}',
          'min_i = 0',
          'i を 0 から 4 まで 1 ずつ増やしながら繰り返す:',
          '│  もし {{2}} ならば:',
          '│  │  {{3}}',
          '└  └  min_i = i',
          '表示する("最低点は", Namae[min_i], "の", min_tensuu, "点")'
        ],
        blanks: [
          { id: 1, answer: '1000', explain: '最小を探すので、初期値は必ず出てくる点数より大きくしておきます。0 にすると 1回も更新されません。' },
          { id: 2, answer: 'min_tensuu > Seiseki[i]', explain: '「いまの暫定最小より小さい点数が出たら」更新します。' },
          { id: 3, answer: 'min_tensuu = Seiseki[i]', explain: '新しい暫定最小の「値」を入れます。min_tensuu + 1 のような書き方では最小値になりません。' }
        ],
        choices: [
          '0', '1000',
          'min_tensuu > Seiseki[i]', 'min_tensuu < Seiseki[i]',
          'min_tensuu = Seiseki[i]', 'min_tensuu = min_tensuu + 1', 'Seiseki[i] = min_tensuu'
        ]
      }
    ]
  };

  global.PROBLEM_SETS = { 'seiseki-basic': SET_SEISEKI };
})(window);
