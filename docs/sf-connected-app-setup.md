# Salesforce Connected App 設定手順

> Lime Management → Salesforce API連携用

---

## 1. Connected App の作成

### 1.1 基本情報

SFにAdmin権限でログイン後、
**設定 > アプリケーション > App Manager > 新規接続アプリケーション**

| 項目 | 設定値 |
|------|--------|
| 接続アプリケーション名 | Lime Management |
| API 参照名 | Lime_Management |
| 取引先責任者メールアドレス | ryuji.kawakami@widsley.com |
| 説明 | IP回線請求管理システムからのAPI連携 |

---

## 2. OAuth 設定

「OAuth 設定の有効化」にチェックを入れる。

| 項目 | 設定値 |
|------|--------|
| コールバック URL | `https://localhost/callback`（ダミー、実際には未使用） |
| OAuth 範囲（選択するもの） | ・データへのアクセスと管理 (`api`) |
| | ・いつでも要求を実行 (`refresh_token, offline_access`) |
| クライアント証明書を必須とする | OFF |
| Proof Key for Code Exchange (PKCE) の要求 | OFF |
| シークレットを必須とする（Webサーバーフロー） | ON |
| シークレットを必須とする（デバイスフロー） | ON |

---

## 3. IP アドレス設定

**設定 > 接続アプリケーション > 作成したアプリを選択 > OAuth ポリシーの編集**

| 項目 | 設定値 |
|------|--------|
| IP 緩和 | **IP 制限を緩和する** |
| 許可ユーザー | すべてのユーザーが自己承認可能 |

---

## 4. Consumer Key / Secret の取得

**設定 > アプリケーション > App Manager > Lime Management > 参照 > Consumer の詳細を管理**

- **Consumer Key** → `SF_CLIENT_ID` に設定
- **Consumer Secret** → `SF_CLIENT_SECRET` に設定

---

## 5. API実行ユーザーのセキュリティトークン取得

API呼び出しに使うSFユーザー（例: ryuji.kawakami@widsley.com）で：

**画面右上のユーザーアイコン > 設定 > セキュリティトークンのリセット**

メールで届いたトークン → `SF_SECURITY_TOKEN` に設定

---

## 6. .env への設定

プロジェクトルートの `.env.local` に以下を追記：

```env
# Salesforce API
SF_LOGIN_URL=https://login.salesforce.com
SF_CLIENT_ID=<Consumer Key>
SF_CLIENT_SECRET=<Consumer Secret>
SF_USERNAME=ryuji.kawakami@widsley.com
SF_PASSWORD=<パスワード>
SF_SECURITY_TOKEN=<セキュリティトークン>

# SF Product2 IDs（確定済み）
# Phase 1: IP回線超過料金
SF_PRODUCT2_ID_CC01=01t2t000000Bj66AAC   # IP回線通話料_国内固定番号宛
SF_PRODUCT2_ID_CC02=01t2t000000Bj67AAC   # IP回線通話料_国内携帯番号宛

# Phase 2: 携帯回線超過料金（将来用・現在は未使用）
# SF_PRODUCT2_ID_CMP09=01t2t000000Bj6KAAS  # 携帯_利用料超過代金
```

> ⚠️ `.env.local` は `.gitignore` に追加済みであること。コードにハードコードしないこと。

---

## 7. 接続テスト

設定後、以下のcurlで疎通確認できる：

```bash
curl -X POST https://login.salesforce.com/services/oauth2/token \
  -d "grant_type=password" \
  -d "client_id=<SF_CLIENT_ID>" \
  -d "client_secret=<SF_CLIENT_SECRET>" \
  -d "username=<SF_USERNAME>" \
  -d "password=<SF_PASSWORD><SF_SECURITY_TOKEN>"
```

`access_token` が返ってきたら接続成功。

---

## 8. 認証フロー（実装方針）

**Username-Password OAuth フロー**を使用する。
サーバーサイドのバッチ処理（超過料金のSF送信）に適している。

```
POST /services/oauth2/token
  grant_type=password
  → access_token を取得

POST /services/data/v59.0/sobjects/OpportunityLineItem/
  Authorization: Bearer <access_token>
  Body: {
    OpportunityId: "...",
    Product2Id: "01t2t000000Bj66AAC",
    UnitPrice: 12345,
    Quantity: 1,
    ServiceDate: "2026-01-01"
  }
```

---

## 備考

- 本番環境（AWS）からは `https://login.salesforce.com` に接続
- Sandbox環境でテストする場合は `https://test.salesforce.com` を使用
- access_tokenの有効期限は通常数時間。失敗時は再取得してリトライする実装を入れること
