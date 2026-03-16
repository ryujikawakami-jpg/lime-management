# PRD: IP回線 請求額管理システム（Lime Management）

> version 0.3 — 2026-03-16

---

## 1. 背景・目的

### 1.1 背景

IP回線の再販事業において、以下をスプレッドシートで管理している。

- 回線会社から調達したIP回線契約（回線・番号・ch割り当て）
- 各テナント（顧客企業）へのパック適用と月次通話使用量
- パックのクレジット消化 → 超過分をSalesforce(SF)経由で請求

現状の課題:
- 超過料金の計算が属人的・手作業でミスが発生しやすい
- 原価（通話コスト）vs 売上の把握がリアルタイムにできない
- SF商談商品への転記作業が二重入力になっている
- 将来的な携帯回線への拡張が困難

### 1.2 目的

月次のIP通話使用量（2社のキャリアからのCSV）から **パックのクレジット消化 → 超過料金の自動計算** を行い、
**SF APIで商談商品に超過費用をショット追加**する。
テナントごとの原価・売上・利益の可視化も行う。

---

## 2. ビジネスロジック概要

### 2.1 パック料金体系（現行）

SFに登録済みのパック商品4種。

| SF商品コード | パック名 | 支払金額 | クレジット（使用可能額） | ボーナス率 |
|-------------|---------|---------|----------------------|-----------|
| IP_Pack20000 | IP 20,000 | ¥20,000 | ¥20,500 | 2.5% |
| IP_Pack50000 | IP 50,000 | ¥50,000 | ¥55,000 | 10% |
| IP_Pack100000 | IP 100,000 | ¥100,000 | ¥115,000 | 15% |
| IP_Pack500000 | IP 500,000 | ¥500,000 | ¥600,000 | 20% |

> パック料金・チャンネル利用料・番号利用料・IP回線基本料はすべてSFの商談商品として登録済み。
> 本システムでは **超過料金のみ** API経由でショット追加する。

### 2.2 通話タリフ

| 宛先 | 売価（/秒） | 原価（/秒） | 利益率 |
|------|-----------|-----------|-------|
| 固定宛 | ¥0.0600 | ¥0.0400 | 33.3% |
| 携帯宛 | ¥0.2500 | ¥0.1700 | 32.0% |

> 通話料自体にはマージンを乗せていない（売価 = キャリア請求レートと同等扱い）。
> 利益はチャンネル利用料・パックボーナスで確保する構造。

### 2.3 月次請求計算フロー

```
【INPUT】テナントごとの月次通話データ（2社のキャリアCSVを統合）
  固定宛通話秒数合計 + 携帯宛通話秒数合計

【IP通話料（売価）の算出】
  IP通話料 = 固定秒数 × ¥0.06 + 携帯秒数 × ¥0.25

【パック適用テナントの場合】
  総クレジット額 = Σ（各パックのクレジット × 口数）
  使用クレジット = min(IP通話料, 総クレジット額)
  超過料金 = max(0, IP通話料 - 総クレジット額)  ← SFへ追加送信

【パック未加入テナントの場合（完全従量課金）】
  超過料金 = IP通話料（全額）

【原価の算出】
  原価 = キャリアCSVの料金列の合計（AdjustOneは通話料金列 / ProDelightは金額列）

【利益】
  粗利 = (総パック料金 + 超過料金) - 原価
  粗利率 = 粗利 / (総パック料金 + 超過料金) × 100
```

### 2.4 SF連携方針

| 項目 | SF商品コード | 管理 | 本システムの役割 |
|------|------------|------|----------------|
| チャンネル利用料 | IP_Channel (¥1,500/ch) | SF固定 | 参照のみ |
| 番号利用料0ABJ | IP_0ABJ (¥500) | SF固定 | 参照のみ |
| 番号利用料フリーダイヤル | IP_FD (¥2,000) | SF固定 | 参照のみ |
| IP回線基本料 | IP_01 (¥4,500) | SF固定 | 参照のみ |
| パック料金 | IP_Pack20000〜500000 | SF固定 | 参照のみ |
| **超過通話料_固定宛** | **CC_01** | **月次追加** | **APIでショット追加** |
| **超過通話料_携帯宛** | **CC_02** | **月次追加** | **APIでショット追加** |

> CC_01/CC_02のSF価格は¥0（amount: 変動）。月次の実超過額をUnitPriceとして設定する。

---

## 3. データソース（キャリアCSV）

### 3.1 AdjustOne（月次メール受信）

**列構成:**

| 列名 | 内容 |
|------|------|
| 請求アカウント | K202000016 等 |
| 請求アカウント名称 | 株式会社Widsley／再販顧客用 |
| 請求月 | 2026/2/1 |
| 利用月 | 2026/1/1 |
| ご利用番号 | 発信に使った電話番号 |
| 関連契約番号 | d461330015 等（回線契約コード） |
| 通話種別名称 | 国内通話料(携帯宛) / 国内通話料(固定宛) |
| 通話先電話番号 | 着信番号 |
| 通話時間 | 秒数（整数） |
| 通話料金 | 原価金額（円）※¥0.17/sec携帯, ¥0.04/sec固定 |
| 利用番号 | ご利用番号と同値 |
| **利用顧客** | **テナント企業名（既に紐付け済み）** |

**インポート処理:**
- 利用顧客名でテナントを照合
- 通話種別名称で固定/携帯を判別
- テナント × 月でグループ集計: 固定秒数合計、携帯秒数合計、原価合計

### 3.2 ProDelight（月次メール受信）

**列構成:**

| 列名 | 内容 |
|------|------|
| 請求月 | 2022/8/1 等 |
| 発着信 | 発信 |
| 請求名 | Widsley |
| 発信番号 | テナントの発信番号（ハイフンなし） |
| 着信番号 | 通話先 |
| 通話種類 | 携帯電話 / 固定電話 |
| 発信日時 | 日時 |
| 通話時間 | 秒数（整数） |
| 金額 | 原価金額（円） |

**インポート処理:**
- 発信番号 → PhoneNumber.number でテナントを逆引き（発信番号のハイフン除去して照合）
- 通話種類で固定/携帯を判別
- テナント × 月でグループ集計

---

## 4. スコープ

### Phase 1（本PRD対象）: IP回線管理

- 回線契約・電話番号・テナント割り当ての台帳管理
- テナントごとのパック設定管理
- AdjustOne / ProDelight の月次CSVインポート
- テナント別の超過料金自動計算
- SF APIによる超過料金（CC_01: 固定宛 / CMP_OP_09: 携帯宛）の商談商品へのショット追加
- テナントごとの原価・売上・利益の可視化
- ユニットch対応ワークフロー管理

### Phase 2（将来拡張）: 携帯回線管理

- 同構造でモバイル回線を管理
- 統合ダッシュボード

---

## 5. ユーザー管理

### 5.1 ロール

| ロール | 権限 |
|--------|------|
| Admin | 全機能。ユーザー追加・削除・ロール変更・システム設定 |
| Leader | マスタ管理・CSVインポート・SF連携実行 |
| Member | 担当テナントの閲覧・アクション更新 |
| Viewer | 読み取り専用（全テナント） |

### 5.2 初期アカウント

| ロール | メールアドレス | 氏名 |
|--------|--------------|------|
| Admin | ryuji.kawakami@widsley.com | 川上 隆司 |
| Admin | hirotaka.takahashi@widsley.com | 髙橋 弘孝 |
| Leader | hitomi.nishimura@widsley.com | 西村 仁美 |
| Leader | kazuya.yamaguchi@widsley.com | 山口 和也 |
| Member | paruko.asai@widsley.com | 浅井 巴留子 |
| Member | ryota.mori@widsley.com | 森 諒太 |
| Member | haruka.kagoshima@widsley.com | 駕籠島 晴香 |

### 5.3 担当者コード移行マッピング（初期データ移行時）

旧スプシの担当者コードは初期インポート時にアカウントへ紐付け変換する。
マッピング表はデータ移行時にBizサイドへ確認。

---

## 6. 機能要件

### 6.1 マスタ管理

#### 6.1.1 回線契約管理（CircuitContract）

IP回線の親契約（回線会社からの調達単位）。

| フィールド | 型 | 説明 | 例 |
|-----------|----|----|-----|
| id | UUID | | |
| code | string | d-numberで一意識別 | d309447913 |
| provider | string | 調達先 | E-circuit |
| plan | string | 容量ティア | 05 |
| number_type | enum | 03 / 050 | 03 |
| total_ch | int | 契約上の最大ch | 50 |
| monthly_cost | int | 回線会社への月額固定費(円) | 50000 |
| next_application_date | date | 増設申請解禁日 | 2024-08-01 |
| status | enum | active / archived | active |
| notes | text | 備考 | |

表示: 使用ch / 総ch（自動集計）、使用率バーグラフ、残ch<10%で警告

#### 6.1.2 電話番号管理（PhoneNumber）

| フィールド | 型 | 説明 |
|-----------|----|----|
| id | UUID | |
| circuit_id | FK | CircuitContract |
| number | string | ハイフンなし（例: 0344138121） |
| category | enum | 基本番号 / 追加番号 |
| number_type | enum | 0ABJ / FD |
| status | enum | 割り当て済み / 未割り当て / 申請中 |

#### 6.1.3 テナント管理（Tenant）

| フィールド | 型 | 説明 |
|-----------|----|----|
| id | UUID | |
| slug | string | 内部識別コード（例: agent-network） |
| company_name | string | 企業名 |
| sf_opportunity_id | string | SF商談ID（API連携用） |
| mf_partner_id | string | MoneyForward参照用 |
| assignee_id | FK | User |
| status | enum | active / churned |
| retention_until | date | 解約後のデータ保持期限（デフォルト: 解約日+7年） |
| notes | text | |

#### 6.1.4 テナント割り当て（TenantAssignment）

| フィールド | 型 | 説明 |
|-----------|----|----|
| id | UUID | |
| tenant_id | FK | Tenant |
| phone_number_id | FK | PhoneNumber |
| allocated_ch | int | 割り当てch数 |
| fd_number | string | 紐付けフリーダイヤル番号（任意） |
| start_month | string | YYYY-MM |
| end_month | string | YYYY-MM（任意） |
| unit_ch_status | enum | 不要 / 検討中 / 対応中 / 完了 |
| unit_ch_notes | text | パターン①②③の詳細 |

#### 6.1.5 パックマスタ（Pack）

| フィールド | 型 | 説明 |
|-----------|----|----|
| id | UUID | |
| name | string | IP 20,000 等 |
| sf_product_code | string | IP_Pack20000 等 |
| price | int | 支払金額（円） |
| credit | int | 使用可能クレジット（円） |
| bonus_rate | decimal | 0.025 等 |
| is_active | bool | 現行提案中かどうか |

現行アクティブパック: IP_Pack20000 / IP_Pack50000 / IP_Pack100000 / IP_Pack500000
非アクティブ（旧パック・裏プラン）: PACK50/100/500/1000等、IP_Pack1000000 → データ上は保持するがUIでは非表示

#### 6.1.6 テナントパック設定（TenantPack）

テナントごとのパック契約。複数パックの組み合わせ可。

| フィールド | 型 | 説明 | 例 |
|-----------|----|----|-----|
| id | UUID | | |
| tenant_id | FK | | |
| pack_id | FK | Pack | |
| quantity | int | 同パックの口数 | 2（IP100k×2等） |
| start_month | string | YYYY-MM | 2024-04 |
| end_month | string | YYYY-MM（任意） | |

---

### 6.2 月次使用量インポート（MonthlyUsage）

#### 6.2.1 CSVインポート機能

2社のCSVを月次でアップロード。

| 機能 | 内容 |
|------|------|
| フォーマット自動判定 | ヘッダー行を見てAdjustOne / ProDelightを自動判別 |
| テナント照合（AdjustOne） | 利用顧客列のテナント名でDB照合 |
| テナント照合（ProDelight） | 発信番号をPhoneNumber.numberで逆引き |
| 未照合レコードの警告 | テナントが見つからない番号はアラート表示 |
| 重複チェック | 同テナント × 同月のインポート済みデータがある場合は上書き確認 |

#### 6.2.2 集計・保存（MonthlyUsage）

| フィールド | 型 | 説明 |
|-----------|----|----|
| id | UUID | |
| tenant_id | FK | |
| year_month | string | YYYY-MM |
| fixed_seconds | int | 固定宛通話秒数合計 |
| mobile_seconds | int | 携帯宛通話秒数合計 |
| raw_cost | decimal | キャリアCSVの料金合計（原価） |
| ip_call_charge | decimal | 固定秒×0.06 + 携帯秒×0.25（売価） |
| total_credit | int | テナントのパッククレジット合計 |
| used_credit | decimal | min(ip_call_charge, total_credit) |
| overage_charge | decimal | max(0, ip_call_charge - total_credit) |
| overage_fixed | decimal | 固定宛分の超過（CC_01用） |
| overage_mobile | decimal | 携帯宛分の超過（CC_02用） |
| gross_profit | decimal | (パック料金合計 + 超過料金) - raw_cost |
| sf_status | enum | 未送信 / 送信済 / エラー / 超過なし / 対応不要 |
| sf_sent_at | datetime | |
| sf_error_message | text | API失敗時のエラー詳細 |
| data_source | string | AdjustOne / ProDelight / 両社 / 手入力 |
| imported_at | datetime | |

> **超過料金の固定/携帯分割について**: CC_01（固定宛）とCC_02（携帯宛）が別商品のため、
> 超過が発生した場合は固定/携帯の比率で按分して記録する（要Biz確認）。
> 確認前はовerage_chargeの合計をCC_02（携帯宛）に一本化する暫定対応とする。

---

### 6.3 SF API連携

#### 6.3.1 SF商品情報（確定）

**Phase 1（IP回線）で使用するSF商品:**

| 用途 | 商品名 | 商品コード | Product2 ID | 数量単位 | 請求月 |
|------|--------|-----------|------------|---------|-------|
| 固定番号宛超過 | IP回線通話料_国内固定番号宛 | CC_01 | `01t2t000000Bj66AAC` | 秒 | 翌々月 |
| 携帯番号宛超過 | IP回線通話料_国内携帯番号宛 | CC_02 | `01t2t000000Bj67AAC` | 秒 | 翌々月 |

> CMP_OP_09（携帯_利用料超過代金, `01t2t000000Bj6KAAS`）はPhase 2（携帯回線）で使用。Phase 1では不使用。

#### 6.3.2 連携フロー

```
1. CSVインポート → 月次使用量集計 → 固定/携帯の超過料金を別途算出
2. 担当者が「請求管理」画面でテナント別超過料金を確認
3. 問題なければ「SF送信」ボタン（Leader以上）
4. SF REST APIで OpportunityLineItem を最大2件追加（超過がある宛先のみ）

   【固定番号宛の超過がある場合】
   - Product2Id: 01t2t000000Bj66AAC  (CC_01)
   - UnitPrice: 固定宛超過金額（円）
   - Quantity: 1
   - ServiceDate: YYYY-MM-01
   - Description: "IP通話超過料金（固定宛）YYYY年MM月分"

   【携帯番号宛の超過がある場合】
   - Product2Id: 01t2t000000Bj67AAC  (CC_02)
   - UnitPrice: 携帯宛超過金額（円）
   - Quantity: 1
   - ServiceDate: YYYY-MM-01
   - Description: "IP通話超過料金（携帯宛）YYYY年MM月分"

5. 送信結果（成功/失敗）を sf_status に記録
6. エラー時はエラーメッセージ表示・再送可能
```

> **超過の按分ロジック:** パックのクレジットは固定/携帯を区別せずIP通話料の総額から消化する。
> 超過発生時は「固定IP通話料 : 携帯IP通話料」の比率で超過額を按分してCC_01/CC_02に振り分ける。
> 例) IP通話料¥120,000（固定¥20k + 携帯¥100k）、クレジット¥115,000 → 超過¥5,000
>   固定按分: ¥5,000 × (20/120) ≒ ¥833 → CC_01
>   携帯按分: ¥5,000 × (100/120) ≒ ¥4,167 → CC_02

#### 6.3.3 SF接続設定

- 外部クライアントアプリ（Connected App）を新規作成
- IPアドレス制限を緩和（詳細は `/docs/sf-connected-app-setup.md` 参照）
- 認証情報を `.env` で管理

```env
SF_LOGIN_URL=https://login.salesforce.com
SF_CLIENT_ID=           # Connected App の Consumer Key
SF_CLIENT_SECRET=       # Connected App の Consumer Secret
SF_USERNAME=            # API実行用SFユーザーのメールアドレス
SF_PASSWORD=            # 同パスワード
SF_SECURITY_TOKEN=      # 同ユーザーのセキュリティトークン

# Phase 1: IP回線超過料金
SF_PRODUCT2_ID_CC01=01t2t000000Bj66AAC   # IP回線通話料_国内固定番号宛
SF_PRODUCT2_ID_CC02=01t2t000000Bj67AAC   # IP回線通話料_国内携帯番号宛

# Phase 2: 携帯回線超過料金（将来用）
# SF_PRODUCT2_ID_CMP09=01t2t000000Bj6KAAS
```

---

### 6.4 ダッシュボード

#### 6.4.1 月次サマリー（当月デフォルト・月切り替え可）

| カード | 内容 |
|-------|------|
| 有効テナント数 | |
| 使用量入力済み | 当月分インポート完了テナント数 / 全テナント数 |
| 超過発生テナント | 超過料金 > ¥0 のテナント数 |
| SF送信待ち | sf_status = 未送信 かつ 超過あり |
| 当月推定売上 | Σ(パック料金 + 超過料金) |
| 当月推定原価 | Σ(raw_cost) |
| 当月推定粗利 | 売上 - 原価 |
| 当月粗利率 | % |

#### 6.4.2 テナント別請求一覧（月次）

| 列 | 説明 |
|----|------|
| テナント名 | |
| パック構成 | IP100k×1, IP20k×2 等 |
| クレジット合計 | ¥XXX,XXX |
| IP通話料 | ¥XXX,XXX |
| 超過料金 | ¥XXX,XXX（なしは「-」） |
| 原価 | ¥XXX,XXX |
| 粗利率 | XX.X% |
| SF送信状態 | バッジ（未送信/送信済/エラー/超過なし） |
| 担当者 | |
| アクション | 詳細・SF送信ボタン |

#### 6.4.3 回線キャパシティ一覧

| 列 | 説明 |
|----|------|
| 契約コード・プロバイダー・プラン | |
| 番号種別 | 03 / 050 |
| ch使用率 | XX/XX ch（プログレスバー）、<10%残で警告 |
| 次回申請可能日 | 直近日をハイライト |
| 紐づくテナント数 | |

#### 6.4.4 ユニットch対応一覧

| 列 | 説明 |
|----|------|
| テナント名 | |
| 電話番号 | |
| 割り当てch数 | |
| 対応ステータス | 不要 / 検討中 / 対応中 / 完了 |
| 対応パターン備考 | ①②③の詳細 |
| 担当者 | |

---

### 6.5 アクション管理

| フィールド | 型 | 説明 |
|-----------|----|----|
| id | UUID | |
| tenant_id | FK | Tenant |
| type | enum | SF送信待ち / 請求差分確認 / ユニットch対応 / その他 |
| description | text | Slackリンク等も貼れる |
| assignee_id | FK | User |
| status | enum | 未着手 / 対応中 / 完了 |
| due_date | date | |
| resolved_at | datetime | |

---

## 7. 非機能要件

| 項目 | 要件 |
|------|------|
| 認証 | メール + パスワード（NextAuth.js Credentials Provider） |
| 認可 | ロールベース（Admin / Leader / Member / Viewer） |
| データ保持 | 解約済みテナントの請求履歴は7年（設定画面で変更可） |
| DB バックアップ | SQLiteファイルの定期S3バックアップ |
| レスポンス | 一覧ページ2秒以内 |
| 対応ブラウザ | Chrome最新版（社内PC利用前提） |
| モバイル対応 | 不要 |
| 監査ログ | SF送信・マスタ変更操作はログ記録 |
| SF API 失敗時 | エラーメッセージ表示・再送ボタン提供 |

---

## 8. 技術スタック

| 項目 | 技術 |
|------|------|
| フロントエンド | Next.js (App Router) + TypeScript |
| UI | Tailwind CSS + shadcn/ui |
| DB | SQLite (better-sqlite3) |
| ORM | Drizzle ORM |
| 認証 | NextAuth.js (Credentials Provider) |
| SF連携 | Salesforce REST API（jsforce or fetch） |
| デプロイ | AWS (EC2 or ECS) |
| CI/CD | GitHub Actions |

---

## 9. DBスキーマ（ER概要）

```sql
users
  id, email, password_hash, name, role(admin/leader/member/viewer), created_at

circuits
  id, code, provider, plan, number_type(03/050),
  total_ch, monthly_cost, next_application_date, status, notes

phone_numbers
  id, circuit_id→circuits, number, category(基本/追加), number_type(0ABJ/FD), status

tenants
  id, slug, company_name, sf_opportunity_id, mf_partner_id,
  assignee_id→users, status, retention_until, notes

tenant_assignments
  id, tenant_id→tenants, phone_number_id→phone_numbers,
  allocated_ch, fd_number, start_month, end_month,
  unit_ch_status, unit_ch_notes

packs
  id, name, sf_product_code, price, credit, bonus_rate, is_active

tenant_packs
  id, tenant_id→tenants, pack_id→packs, quantity, start_month, end_month

monthly_usages
  id, tenant_id→tenants, year_month,
  fixed_seconds, mobile_seconds, raw_cost,
  ip_call_charge, total_credit, used_credit,
  overage_charge, overage_fixed, overage_mobile,
  gross_profit, sf_status, sf_sent_at, sf_error_message,
  data_source, imported_at

actions
  id, tenant_id→tenants, type, description,
  assignee_id→users, status, due_date, resolved_at

audit_logs
  id, user_id→users, action_type, target_table, target_id,
  before_json, after_json, created_at
```

---

## 10. 画面一覧

| 画面 | パス | 権限 |
|------|------|------|
| ダッシュボード | `/` | 全員 |
| 回線契約一覧 | `/circuits` | 全員 |
| 回線契約詳細 | `/circuits/[id]` | 全員 |
| テナント一覧 | `/tenants` | 全員 |
| テナント詳細 | `/tenants/[id]` | 全員 |
| 請求管理（月次） | `/billing/[yearMonth]` | 全員 |
| 請求詳細・SF送信 | `/billing/[yearMonth]/[tenantId]` | 全員（送信はLeader以上） |
| ユニットch管理 | `/unit-ch` | 全員 |
| アクション管理 | `/actions` | 全員 |
| データインポート | `/import` | Leader以上 |
| 設定 | `/settings` | Admin |

---

## 11. フェーズ計画

### Phase 1a: 基盤（約2週間）
- プロジェクトセットアップ（Next.js + Drizzle + SQLite + NextAuth）
- DBスキーマ定義・マイグレーション
- 認証・ロール実装、初期ユーザー作成
- 回線契約・電話番号・テナントのCRUD
- 現行linelist.csvからの初期データインポートツール

### Phase 1b: コア請求ロジック（約2週間）
- テナント割り当て・パック設定管理
- AdjustOne / ProDelight CSVインポート
- 超過料金の自動計算ロジック
- ダッシュボード・テナント別請求一覧

### Phase 1c: SF連携・運用（約1週間）
- Salesforce REST API 連携実装
- SF送信プレビュー・実行・ステータス管理
- ユニットch対応ワークフロー
- アクション管理
- 監査ログ
- AWS デプロイ・GitHub Actions CI/CD

### Phase 2: 携帯回線（別PRD）
- モバイル回線の同構造管理
- 統合ダッシュボード

---

## 12. 未決事項

| # | 項目 | 状態 | 備考 |
|---|------|------|------|
| 1 | SF Connected App の作成・認証情報取得 | **対応中** | 設定手順は `/docs/sf-connected-app-setup.md` 参照 |
| 2 | CC_01 / CC_02 の Product2 ID | **✅確定** | CC_01: `01t2t000000Bj66AAC`, CC_02: `01t2t000000Bj67AAC` |
| 3 | 超過料金の固定/携帯按分方法 | **✅確定** | 固定→CC_01 / 携帯→CC_02。按分比率は固定IP通話料:携帯IP通話料の比率で算出 |
| 4 | ProDelight最新CSVフォーマット確認 | **Biz確認待ち** | 手元のDRAFTは2022年版 |
| 5 | 旧パック残存テナントの特定 | **Biz確認待ち** | 一部IP_Pack1000000が残存とのこと |
| 6 | 担当者コード（ota, ayui等）→メールアドレスのマッピング | **Biz確認待ち** | 初期データ移行時に必要 |
| 7 | テナントごとのSF商談ID一覧 | **Biz確認待ち** | SF-Invoice-Product-Listにはない場合、SFレポートで取得 |
