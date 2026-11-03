# vendor

外部ライブラリをそのまま置いてある。CDNから読むと学校のネットワークで
遮断されることがあるため、リポジトリに同梱している。

| ファイル | 中身 | ライセンス |
|---|---|---|
| `jsQR.min.js` | [jsQR](https://github.com/cozmo/jsQR) v1.4.0（QRコードの読み取り）を esbuild で最小化したもの | Apache-2.0（`LICENSE-jsQR.txt`） |

iOS/iPadOS の Safari にはブラウザ標準の `BarcodeDetector` が無いため、
iPad で QR を読むにはこのライブラリが必要。
`BarcodeDetector` が使える端末（Android Chrome など）ではそちらを優先し、
本物の JAN バーコードも読む。
