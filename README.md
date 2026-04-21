# LineHub — IP・携帯回線 統合管理システム

IP回線の再販事業における請求管理・ch割り当て・Salesforce連携を一元化する社内ツール。

## 技術スタック

- **Next.js 16** (App Router) + TypeScript
- **Tailwind CSS v4** + shadcn/ui
- **SQLite** (better-sqlite3) + **Drizzle ORM**
- **NextAuth.js v5** (Credentials)
- **jsforce** (Salesforce連携)

## セットアップ

```bash
npm install
cp .env.example .env.local   # 環境変数を設定
npm run db:seed               # DB初期化（ユーザー・パックマスタ）
npm run dev                   # http://localhost:3000
```

初期ログイン: `ryuji.kawakami@widsley.com` / `Widsley2024!`

## データインポート

IP回線データの投入は以下の順序で実行する。

```bash
# 1. AD1シートCSV → 請求アカウント・チャンネルグループ・電話番号
#    (Googleスプレッドシート「※竹上修正完了」シートをCSVエクスポートして docs/ad1-channels.csv に配置)
npm run db:migrate-ad1

# 2. SF顧客CSV → テナント・パック設定
#    (SFから取引先×商品レポートをCSVエクスポートして docs/ip_customer.csv に配置)
npm run db:migrate-sf-customers

# 3. チャンネルグループ → テナント自動リンク
npm run db:link-groups
```

## データモデル

```
billing_accounts (請求アカウント)
  └── channel_groups (チャンネルグループ)
        └── phone_numbers (電話番号)

tenants (テナント)
  ├── tenant_assignments → phone_numbers
  ├── tenant_packs → packs
  ├── monthly_usages
  └── call_logs
```

## 主要画面

| パス | 画面 |
|------|------|
| `/` | ダッシュボード |
| `/billing-accounts` | 請求アカウント一覧・詳細 |
| `/tenants` | テナント一覧・詳細（割り当て・パック・請求履歴） |
| `/billing` | 月次請求管理 |
| `/unit-ch` | ユニットch管理 |
| `/import` | CSVインポート |
| `/activity` | 更新履歴 |
| `/settings` | ユーザー管理 |

## npm scripts

| コマンド | 説明 |
|---------|------|
| `npm run dev` | 開発サーバー起動 |
| `npm run build` | プロダクションビルド |
| `npm run db:seed` | DB初期化 |
| `npm run db:generate` | Drizzleマイグレーション生成 |
| `npm run db:migrate-ad1` | AD1シートCSVインポート |
| `npm run db:migrate-sf-customers` | SF顧客CSVインポート |
| `npm run db:link-groups` | チャンネルグループ自動リンク |

## 環境変数

```
NEXTAUTH_SECRET=your-secret
NEXTAUTH_URL=http://localhost:3000
DATABASE_URL=lime.db
SF_LOGIN_URL=https://login.salesforce.com
SF_USERNAME=...
SF_PASSWORD=...
SF_SECURITY_TOKEN=...
```

## Docker

```bash
docker build -t linehub .
docker run -p 3000:3000 -v linehub-data:/data linehub
```
