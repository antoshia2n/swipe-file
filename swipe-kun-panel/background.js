// ツールバーのボタンでサイドパネルを開く設定だけ。画面は https://swipe.shia2n.jp/panel 側、ページを読む処理は panel.js にある
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);
