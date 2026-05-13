# 詳細設計: 旅行用 為替換算PWA

## localStorageキー

| キー | 値 |
| --- | --- |
| `selectedCurrency` | `EUR`または`VND` |
| `selectedRateMode` | `latest`または`custom` |
| `customRate_EUR` | EUR用の設定レート |
| `customRate_VND` | VND用の設定レート |
| `latestRate_EUR` | 最後に取得したEUR最新レート |
| `latestRate_VND` | 最後に取得したVND最新レート |
| `latestRateUpdatedAt_EUR` | EUR最新レート取得日時 |
| `latestRateUpdatedAt_VND` | VND最新レート取得日時 |
| `customRateUpdatedAt_EUR` | EUR設定レート保存日時 |
| `customRateUpdatedAt_VND` | VND設定レート保存日時 |

## JavaScript状態

| 状態 | 役割 |
| --- | --- |
| `currentCurrency` | 現在選択中の通貨 |
| `currentRateMode` | 現在選択中のレート種別 |
| `currentRate` | 現在換算に使うJPYレート |
| `amountInput` | 電卓で入力・計算された換算対象金額 |
| `calculatorExpression` | 画面に表示する計算過程 |
| `lastCalculatorResult` | 直近の`=`確定結果 |
| `isAfterEquals` | 直前の操作が`=`かどうか |

内部制御用に、保留中の左辺値、演算子、次入力開始フラグも保持する。

## 為替レート取得

### 取得タイミング

- 最新レートモードへ切り替えたとき。
- 最新レートモード中に通貨を切り替えたとき。
- 起動時に`selectedRateMode`が`latest`で、オンライン状態のとき。

### 成功時

1. APIレスポンスの`rate`を検証する。
2. `latestRate_通貨`へ保存する。
3. `latestRateUpdatedAt_通貨`へAPI時刻または現在時刻を保存する。
4. `currentRate`を更新する。
5. 換算結果とレート表示を更新する。

### 失敗時

1. エラーメッセージを表示する。
2. 保存済み最新レートがあれば、それを使用する。
3. 保存済み最新レートがない場合は、設定レートの利用を促す。
4. オフライン起動時は、設定レート、保存済み最新レートの順に使用する。

## 電卓ロジック

### 数字・小数点

- 数字ボタン押下で`amountInput`へ追加する。
- 小数点は1つだけ許可する。
- `=`直後に数字を押した場合は、前回式をクリアして新規入力を開始する。

### 演算子

- 演算子押下で現在値を左辺として保持する。
- `=`直後に演算子を押した場合は、`lastCalculatorResult`から計算を継続する。
- 演算子を連続で押した場合は、最後に押した演算子へ置き換える。

### 確定

- `=`押下で左辺、演算子、右辺から計算する。
- 結果を`amountInput`へ反映する。
- 表示式は`左辺 演算子 右辺 = 結果`とする。
- 0除算は計算せず、エラーを表示する。

### クリア・削除

- `C`は`amountInput`、`calculatorExpression`、`lastCalculatorResult`、保留中の演算を全てクリアする。
- 削除アイコンは現在の`amountInput`から1文字削除する。

## 換算ロジック

- `JPY = amountInput × currentRate`
- 小数点以下は四捨五入する。
- 日本円はカンマ区切りで表示する。
- `currentRate`が未設定の場合は`レート未設定`を表示する。
- VNDは桁数が多いため、換算対象金額表示もカンマ区切りにする。
