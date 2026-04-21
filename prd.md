# PRD: IP回線 請求額管理システム（LineHub）

## 1. 背景・目的

### 1.1 背景

現在、IP回線の再販事業においてスプレッドシートで以下を管理している。

- アジャストワン社から調達したIP回線契約（原価）
- 各テナント（顧客企業）への回線・チャンネル・電話番号の割り当て
- テナントごとの請求ルールに基づく請求額の確認・差分チェック

スプレッドシート管理では以下の課題がある。

- 請求漏れ・過剰請求の検知が属人的・手作業
- 複数担当者が同時編集するとデータ整合性が壊れやすい
- 請求状況のサマリー・可視化が困難
- 将来的な携帯回線の同構造管理への拡張が難しい

### 1.2 目的

IP回線の**原価（調達コスト）と売上（テナントへの請求）を一元管理**し、請求差分の自動検知・可視化・是正アクション管理ができるシステムを構築する。

---

## 2. スコープ

### Phase 1（本PRD対象）: IP回線管理

- 請求アカウント（アジャストワン側の請求単位）の管理
- チャンネルグループ（企業×サービス単位のch束ね）の管理
- 電話番号・チャンネルのテナントへの割り当て管理
- テナントごとのパック管理・超過料金計算
- 月次通話データインポート（AdjustOne / ProDelight CSV）
- Salesforce連携（超過料金のOpportunityLineItem登録）
- 担当者管理・アサイン

### Phase 2（将来拡張）: 携帯回線管理

- 同構造でモバイル回線の管理
- Phase 1と統合されたダッシュボード

---

## 3. ユーザー・ステークホルダー

| ロール | 主な操作 |
|--------|----------|
| 管理者（Admin） | 全機能。請求アカウント・テナント・パック等のマスタ管理 |
| リーダー（Leader） | 担当テナントの請求確認・アクション管理 |
| メンバー（Member） | 担当テナントの請求確認・データ入力 |
| 閲覧者（Viewer） | 読み取り専用ダッシュボード閲覧 |

---

## 4. ドメインモデル・用語定義

### 4.1 用語

| 用語 | 説明 |
|------|------|
| 請求アカウント（BillingAccount） | アジャストワン側の請求単位。請求ID（K202100009等）で識別。AD1 IPアドレスを持つ |
| チャンネルグループ（ChannelGroup） | 請求アカウント内の企業×サービス単位のまとまり。契約ch数を持つ |
| 電話番号（PhoneNumber） | チャンネルグループに属する個別の番号。基本番号と追加番号がある |
| テナント（Tenant） | 回線を利用している顧客企業 |
| チャンネル（ch） | 同時通話数。1チャンネル = 1同時通話。テナントごとに割り当て |
| ch制御 | 番号ごとの同時通話上限数 |
| パック | IP通話クレジットの定額パッケージ（IP 20,000〜500,000） |
| 超過料金 | 月次通話料がパッククレジットを超えた分の請求 |
| 原価 | キャリアCSVの通話料金（固定: ¥0.04/秒, 携帯: ¥0.17/秒） |
| 売価 | テナントへの通話料金（固定: ¥0.06/秒, 携帯: ¥0.25/秒） |

### 4.2 データ構造

```
請求アカウント（BillingAccount）
  └─ チャンネルグループ（ChannelGroup）1..N
        └─ 電話番号（PhoneNumber）1..N
              └─ テナント割り当て（TenantAssignment）
                    └─ テナント（Tenant）
                          ├─ パック設定（TenantPack）
                          ├─ 月次使用量（MonthlyUsage）
                          └─ 通話ログ（CallLog）
```

### 4.3 データソース

#### アジャストワン「※竹上修正完了」シート（CSVエクスポート）

IP回線の契約ch数・電話番号の管理台帳。セル結合による4階層構造を持ち、前方充填（forward fill）でパースする。

| 列 | 内容 | 対応エンティティ |
|----|------|----------------|
| C | AD1 IPアドレス | BillingAccount |
| D | 請求ID（新管理コード） | BillingAccount |
| E | 請求アカウント名 | BillingAccount |
| F | 企業名 | ChannelGroup |
| G | 契約ステータス | PhoneNumber |
| H | 番号種別 | PhoneNumber |
| I | 電話番号 | PhoneNumber |
| J | フリーコール | PhoneNumber |
| K | 適用日 | PhoneNumber |
| L | 解約日 | PhoneNumber |
| M | 契約ch数 | ChannelGroup |
| N | ch制御 | PhoneNumber |
| O | 備考 | PhoneNumber |

※ A列（契約コード）・B列（AD1回線）は廃止予定のため使用しない。

#### 月次キャリアCSV（2社からメール受信）

- **AdjustOne**: 1行1通話明細。利用顧客列でテナント紐付け済み。通話料金列が原価。
- **ProDelight**: 1行1通話明細。発信番号→PhoneNumber逆引きでテナント特定。金額列が原価。

#### Salesforce商品レポート（CSVエクスポート）

テナント・商談ID・パック設定・ch数の一括インポート用。

---

## 5. 機能要件

### 5.1 マスタ管理

#### 5.1.1 請求アカウント管理（BillingAccount）

| フィールド | 説明 |
|-----------|------|
| 請求ID | 新管理コード（例: K202100009） |
| 請求アカウント名 | 例: 株式会社Widsley／再販顧客用(2) |
| AD1 IPアドレス | 例: 59.139.31.99 |
| ステータス | 有効 / アーカイブ |

機能:
- 一覧表示（グループ数・番号数・契約ch合計）
- 新規登録・編集・アーカイブ
- 配下のチャンネルグループ・電話番号の階層表示

#### 5.1.2 チャンネルグループ管理（ChannelGroup）

| フィールド | 説明 |
|-----------|------|
| ラベル | F列の企業名（チャンネルグループ識別子） |
| 契約ch数 | M列の値 |
| テナントリンク | 対応するテナントへのFK |

#### 5.1.3 電話番号管理（PhoneNumber）

| フィールド | 説明 |
|-----------|------|
| 電話番号 | ハイフンなし（例: 0344138121） |
| フリーコール | 0120/0800番号（任意） |
| 番号種別 | 基本番号 / 追加番号 |
| 契約ステータス | 契約中 / 解約済 |
| 適用日 / 解約日 | 開通・解約の日付 |
| ch制御 | 番号ごとの同時通話上限 |

#### 5.1.4 テナント管理（Tenant）

| フィールド | 説明 |
|-----------|------|
| スラッグ | URL用識別子 |
| 企業名 | 例: 株式会社Wells Partners |
| SF商談ID | Salesforce連携用 |
| MFパートナーID | MoneyForward連携用 |
| 担当者 | ユーザーFK |
| ステータス | 有効 / 解約 |

#### 5.1.5 テナント割り当て管理（TenantAssignment）

| フィールド | 説明 |
|-----------|------|
| テナント | Tenant FK |
| 電話番号 | PhoneNumber FK |
| 割り当てch数 | テナントに提供しているch数 |
| 開始月 / 終了月 | 割り当て期間 |
| ユニットch対応 | 不要 / 検討中 / 対応中 / 完了 |

### 5.2 請求管理

#### 5.2.1 パック管理

テナントにIPパック（IP 20,000〜500,000）を割り当て。パッククレジットが月次通話料の前払いとして機能。

#### 5.2.2 月次通話データインポート

AdjustOne / ProDelight のCSVをインポートし、通話ログを蓄積。テナントごとの月次使用量を自動集計。

#### 5.2.3 超過料金計算

```
IP通話料 = 固定通話秒数 × ¥0.06 + 携帯通話秒数 × ¥0.25
超過料金 = max(0, IP通話料 - パッククレジット合計)
```

超過料金は固定宛/携帯宛に按分し、SalesforceへCC_01/CC_02として送信。

#### 5.2.4 Salesforce連携

超過料金をOpportunityLineItemとしてSF APIに自動登録。

### 5.3 ダッシュボード

- 有効テナント数
- 使用量入力済みテナント数
- SF送信待ち件数
- 当月推定粗利
- 請求アカウントch状況
- 更新履歴

### 5.4 インポート機能

| スクリプト | 用途 |
|-----------|------|
| `npm run db:migrate-ad1` | AD1シートCSV → 請求アカウント・チャンネルグループ・電話番号 |
| `npm run db:migrate-sf-customers` | SF顧客CSV → テナント・パック設定 |
| `npm run db:link-groups` | チャンネルグループ → テナント自動リンク |

---

## 6. 非機能要件

| 項目 | 要件 |
|------|------|
| 認証 | メール + パスワードログイン（NextAuth.js Credentials Provider） |
| 認可 | ロールベース（Admin / Leader / Member / Viewer） |
| データ保護 | SQLiteファイルの定期バックアップ |
| レスポンス | 一覧ページ：2秒以内 |
| 対応ブラウザ | Chrome最新版（社内利用想定） |
| モバイル対応 | 不要（PC利用前提） |

---

## 7. 技術スタック

| 項目 | 技術 |
|------|------|
| フレームワーク | Next.js 16 (App Router) + TypeScript |
| UI | Tailwind CSS v4 + shadcn/ui |
| DB | SQLite (better-sqlite3) |
| ORM | Drizzle ORM |
| 認証 | NextAuth.js v5 (Credentials Provider) |
| SF連携 | jsforce |
| デプロイ | Docker → AWS (EC2/ECS) |
| CI/CD | GitHub Actions |

---

## 8. データモデル（ER図）

```
billing_accounts (請求アカウント)
  id, billing_code, name, ip_address, status, notes

channel_groups (チャンネルグループ)
  id, billing_account_id, label, contract_ch, tenant_id, status, notes

phone_numbers (電話番号)
  id, channel_group_id, number, free_call, category,
  contract_status, apply_date, cancel_date, ch_control, notes

tenants (テナント)
  id, slug, company_name, sf_opportunity_id, mf_partner_id,
  assignee_id, status, retention_until, notes

tenant_assignments (テナント割り当て)
  id, tenant_id, phone_number_id, allocated_ch,
  unit_code, start_month, end_month,
  unit_ch_status, unit_ch_notes

packs (パックマスタ)
  id, name, sf_product_code, price, credit, bonus_rate,
  is_active, sort_order

tenant_packs (テナントパック設定)
  id, tenant_id, pack_id, quantity, start_month, end_month

monthly_usages (月次使用量)
  id, tenant_id, year_month,
  fixed_seconds, mobile_seconds, raw_cost,
  ip_call_charge, fixed_call_charge, mobile_call_charge,
  total_pack_price, total_credit, used_credit,
  overage_charge, overage_fixed, overage_mobile,
  gross_profit, sf_status, data_source

call_logs (通話ログ)
  id, tenant_id, year_month, call_date, phone_number,
  destination_number, destination_type, duration_seconds,
  cost, source

actions (アクション管理)
  id, tenant_id, type, description, assignee_id,
  status, due_date, resolved_at

users (ユーザー)
  id, email, password_hash, name, role

audit_logs (監査ログ)
  id, user_id, action_type, message,
  target_table, target_id, before_json, after_json
```

---

## 9. 画面一覧

| 画面 | パス | 説明 |
|------|------|------|
| ダッシュボード | / | サマリー・KPI・要対応リスト |
| 請求アカウント一覧 | /billing-accounts | 請求ID・ch状況管理 |
| 請求アカウント詳細 | /billing-accounts/[id] | チャンネルグループ・電話番号の階層表示 |
| テナント一覧 | /tenants | テナント管理 |
| テナント詳細 | /tenants/[id] | 割り当て・パック・請求履歴 |
| 請求管理 | /billing | 月次請求一覧 |
| 請求詳細 | /billing/[yearMonth]/[tenantId] | テナント別月次詳細 |
| ユニットch管理 | /unit-ch | ユニットチャネル対応状況 |
| アクション管理 | /actions | 担当者別・期限別タスク一覧 |
| インポート | /import | CSV一括インポート |
| 更新履歴 | /activity | 監査ログ一覧 |
| 設定 | /settings | ユーザー管理 |

---

## 10. フェーズ計画

### Phase 1a: 基盤 ✅
- プロジェクトセットアップ（Next.js + Drizzle + SQLite + NextAuth）
- DBスキーマ定義・マイグレーション
- 認証・ロール実装
- 請求アカウント・電話番号・テナントのCRUD

### Phase 1b: コア機能 ✅
- テナント割り当て管理
- パック管理
- 超過料金の自動計算ロジック
- 月次通話データCSVインポート

### Phase 1c: SF連携・デプロイ ✅
- Salesforce超過料金送信
- ダッシュボード・可視化
- Docker / GitHub Actions CI/CD

### Phase 1d: データモデルリニューアル ✅
- circuits → billingAccounts + channelGroups へ再構築
- AD1シートCSVインポート対応（前方充填）
- SF顧客CSVインポート・テナント自動リンク

### Phase 2: 携帯回線（別PRD）
- モバイル回線契約の管理（同構造で拡張）
- 統合ダッシュボード
