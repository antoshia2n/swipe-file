/**
 * スワイプくんの操作の案内（共通の外枠の「？」→ 操作の案内。2026-10-27 作業 59・開発部）。
 * 形は note攻略くん・X攻略くんの tours.js と同じ。ctx.go(画面) で画面を開いてから光らせる。
 */
export function makeTours(ctx) {
  const q = s => document.querySelector(s);
  return [
    {
      id: "first",
      title: "はじめの 1 件",
      desc: "スワイプを足して、探して、見え方を変える",
      steps: [
        { before: () => ctx.go("app"), el: "#addBtn", title: "スワイプを足す", body: "右上の「＋ 足す」から、リンク・本文・画像か PDF のどれか 1 つで保存できます。画像は足す窓に貼り付けても入ります。" },
        { before: () => ctx.go("app"), el: "#q", title: "探す", body: "本文・分析・投稿者の言葉で探せます。" },
        { before: () => ctx.go("app"), el: ".vtabs", title: "見え方を変える", body: "表・ギャラリー・分析の段などを切り替えます。" },
        { before: () => ctx.go("app"), el: "#saveState", title: "保存", body: "書くと自動で保存され、ここに「保存中…」と出ます。" },
      ],
    },
    {
      id: "analyze",
      title: "分析を進める",
      desc: "未分析のものを開いて、3 段で書く",
      steps: [
        { before: () => ctx.go("app"), el: '[data-loc="todo"]', title: "未分析", body: "左のメニューの「未分析」で、まだ分析していないものだけが並びます。" },
        { before: () => ctx.go("todo"), el: () => q("#main .tw") || q("#main .card") || q("#main"), title: "くわしくを開く", body: "行やカードを押すと、右にくわしくの窓が開きます。開いている間は j と k で前後へ移れます。" },
        { before: () => ctx.go("todo"), el: () => q(".dt-an") || q("#main"), title: "3 段で書く", body: "言語化（なぜ良いか）→ 仮説（ほかでも効きそうな型）→ 用途抽出（どこで・どう使うか）の順に書きます。欄の薄い字が記入例です。" },
      ],
    },
    {
      id: "view",
      title: "見え方を整える",
      desc: "絞り込んで、ビューとして残す",
      steps: [
        { before: () => ctx.go("app"), el: "#fBtn", title: "絞り込み", body: "種類・参考ポイント・評価・ジャンル・分析で絞ります。" },
        { before: () => ctx.go("app"), el: "#addView", title: "ビューとして残す", body: "「＋ ビュー」で、いまの絞り込みをビューとして残せます。次からはタブを押すだけで同じ見え方になります。" },
        { before: () => ctx.go("app"), el: 'nav.hm [data-scr="pack"]', title: "素材パック", body: "上の帯の「素材パック」で、見本を集めて GPT や Claude に渡す文をまとめられます。" },
      ],
    },
  ];
}
