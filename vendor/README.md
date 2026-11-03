# vendor

外部ライブラリをそのまま置いてある。CDNから読むと学校のネットワークで
遮断されることがあるため、リポジトリに同梱している。

| ファイル | 中身 | ライセンス |
|---|---|---|
| `jsQR.min.js` | [jsQR](https://github.com/cozmo/jsQR) v1.4.0（QRコードの**読み取り**）を esbuild で最小化したもの | Apache-2.0（`LICENSE-jsQR.txt`） |
| `qrcode-generator.min.js` | [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) v1.4.4（QRコードの**生成**）を esbuild で最小化したもの | MIT（`LICENSE-qrcode-generator.txt`） |

QRカードのページ（`cards.html`）は、設定した商品名・値段をその場で読んでQRを描く。
生成をブラウザ側でやるので、設定を変えたらカードの表示もすぐ変わる。

iOS/iPadOS の Safari にはブラウザ標準の `BarcodeDetector` が無いため、
iPad で QR を読むにはこのライブラリが必要。
`BarcodeDetector` が使える端末（Android Chrome など）ではそちらを優先し、
本物の JAN バーコードも読む。
