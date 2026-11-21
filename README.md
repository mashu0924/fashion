# Closet Note

メールアドレスでログインし、洋服の写真・着用回数・コーディネートを記録するクローゼット管理アプリです。

## 起動とSupabase設定

1. Supabaseでプロジェクトを作成します。
2. Supabase Dashboard の **Project Settings → API** から Project URL と anon（公開）キー、または publishable key を用意します。`service_role` キーは絶対に入力しないでください。
3. プロジェクトの **Authentication → URL Configuration** で Site URL と Additional Redirect URLs にアプリのURLを登録します。ローカル開発では、以下のサーバーを起動して `http://localhost:8000/index.html` を登録します。
4. リポジトリのルートで静的サーバーを起動します。

   ```powershell
   python -m http.server 8000
   ```

   または VS Code の Live Server を使います。`file://` で開くとメール確認・パスワード再設定のリンク先が正しく戻らないため、HTTPサーバー経由で起動してください。
5. アプリを開き、Supabase の Project URL と公開キーを入力して接続します。その後、ログインまたはアカウント作成を行います。メール確認が有効な場合は、届いたメールのリンクから登録を完了してください。

アプリのURLを変更した場合は、Supabase の URL Configuration にも新しいURLを追加してください。公開キーはブラウザーで使うためのキーです。`service_role` キーやその他の秘密情報をブラウザーに入力・保存しないでください。

## データの保存

Supabaseは認証に使用し、洋服・写真・コーディネートの記録はアカウントごとに分けてブラウザー内へ保存します。別のブラウザーや端末との同期、サーバーへの記録バックアップは行いません。ログアウト中もブラウザー内の記録自体は削除されず、この認証はローカル記録を暗号化しません。共有端末ではブラウザーのデータを他の利用者から保護できないため注意してください。認証前からこのブラウザーに保存されていた記録がある場合は、初回ログイン時に引き継ぎを確認します。
