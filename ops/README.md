# Restaurant OS on srv1800305

The site is https://restaurantos.peculiex.com. Nginx serves this hostname and sends traffic
to the Restaurant OS web process at `127.0.0.1:3200` and its API at `127.0.0.1:4200`.
The two PM2 process names are `restaurant-os-web` and `restaurant-os-api`.

## Publish a change

From the local workspace, review the files before staging. Keep .env files and private
credentials out of Git.

```powershell
npm run typecheck
npm run build
git status --short
git diff
git add -- <changed-files>
git diff --cached --check
git commit -m "Describe the Restaurant OS change"
git push origin main
```

Connect using the existing VPS key from PowerShell.

```powershell
ssh -i "$env:USERPROFILE/.ssh/peculiex_vps" root@187.127.189.130
```

## Deploy a new release

Run on the VPS. Each checkout is pinned to the exact commit on GitHub. The build runs
as the Restaurant OS system user while the previous release continues to serve traffic.

```bash
set -e
BASE=/opt/restaurant-os
REPO=https://github.com/ankit-datatrainer/restaurant-os.git
SHA=$(git ls-remote "$REPO" refs/heads/main | cut -f1)
test -n "$SHA"
REL="$BASE/releases/$SHA"
PREVIOUS=$(readlink -f "$BASE/current")
test -d "$PREVIOUS"
test ! -e "$REL"
install -d -o restaurant-os -g restaurant-os -m 0755 "$REL"
runuser -u restaurant-os -- git clone --quiet "$REPO" "$REL"
runuser -u restaurant-os -- git -C "$REL" checkout --quiet --detach "$SHA"
ln -s "$BASE/shared/api.env" "$REL/apps/api/.env"
ln -s "$BASE/shared/web.env" "$REL/apps/web/.env.local"
cd "$REL"
runuser -u restaurant-os -- nice -n 10 npm ci --include=dev --no-fund
runuser -u restaurant-os -- nice -n 10 npm run build
```

Keep the built release and the previous target. Switch the symlink and restart only
the two Restaurant OS processes. To apply edits to Nginx, review this site's config
separately and run `nginx -t` before a graceful reload.

```bash
ln -sfn "$REL" "$BASE/current.next"
mv -Tf "$BASE/current.next" "$BASE/current"
pm2 restart restaurant-os-api restaurant-os-web
curl -fsS --retry 5 --retry-connrefused --retry-delay 1 http://127.0.0.1:4200/api/health
curl -fsS --retry 5 --retry-delay 1 https://restaurantos.peculiex.com/api/health
curl -fsS https://restaurantos.peculiex.com/api/public/tables/DEMO1 -o /dev/null
curl -fsS https://restaurantos.peculiex.com/admin/login -o /dev/null
pm2 list
```

If the new release fails the checks, restore the previous symlink in the same shell.

```bash
ln -sfn "$PREVIOUS" "$BASE/current.next"
mv -Tf "$BASE/current.next" "$BASE/current"
pm2 restart restaurant-os-api restaurant-os-web
curl -fsS --retry 5 --retry-delay 1 https://restaurantos.peculiex.com/api/health
```

## Server files

- `/opt/restaurant-os/shared/api.env` and `web.env` hold the server configuration.
  Use the Supabase publishable or anon key. The API does not require a service role key.
  Set `APP_URL`, `CORS_ORIGINS`, and `NEXT_PUBLIC_SITE_URL` to the public HTTPS origin.
  Set `API_PROXY_TARGET=http://127.0.0.1:4200` and leave `NEXT_PUBLIC_API_URL` empty.
- `ops/ecosystem.config.cjs` starts both PM2 services. On an initial setup, build the release
  and point `current` to it before running `pm2 start "$BASE/current/ops/ecosystem.config.cjs"`.
- For initial TLS setup, install `ops/nginx-http.conf` as the site config, create
  `/var/lib/restaurant-os/acme`, validate Nginx, then reload it. Issue the certificate with
  `certbot certonly --webroot -w /var/lib/restaurant-os/acme -d restaurantos.peculiex.com`.
  Install `ops/nginx-https.conf` as the site config and validate before reloading again.
- Saffron Lane Café is a shared demo. Keep real restaurant data in a separate tenant.
