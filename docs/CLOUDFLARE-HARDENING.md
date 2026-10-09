# GRID//NODE Cloudflare hardening, copy-paste configs
# Domain: gridnode.network | Dashboard: dash.cloudflare.com
# All of this is FREE tier. Estimated time: 5 minutes.

## 1. Bot Fight Mode (Security > Bots)
Bot Fight Mode -> ON
Blocks known bad bots and scripted scrapers automatically.

## 2. Managed ruleset (Security > WAF > Managed rulesets)
Cloudflare Managed Ruleset -> ON
Free tier includes a reduced set. Leave sensitivity at default.

## 3. Rate limiting rule (Security > WAF > Rate limiting rules)
You get 1 rule on free. Spend it guarding the API:

- Rule name: guard-functions-api
- Expression (edit expression):
  (http.request.uri.path starts_with "/functions/v1/")
- Characteristics: IP address
- Requests: 20
- Period: 1 minute
- Action: Block
- Mitigation timeout: 10 minutes

Why: /functions/v1/* is where the key gate, webauthn, and (soon) the
server-side math live. 20/min/IP is generous for humans, painful for bots.

## 4. Custom rules (Security > WAF > Custom rules, 5 slots on free)

### 4a. block-scanner-probes (Block)
Expression:
  (http.request.uri.path contains "/.env") or
  (http.request.uri.path contains "/.git/") or
  (http.request.uri.path contains "/wp-") or
  (http.request.uri.path eq "/xmlrpc.php")

### 4b. block-empty-ua-on-api (Block)
Expression:
  (http.request.uri.path starts_with "/functions/v1/") and
  (http.user_agent eq "")
Bots with no user agent hitting the API get dropped.

### 4c. challenge-datacenter-api (Managed Challenge)
Expression:
  (http.request.uri.path starts_with "/functions/v1/") and
  (cf.bot_management.ja3_hash ne "") and
  (ip.geoip.asnum in {14061 16509 16276 24940 20473 14618})
ASNs: DigitalOcean, AWS, OVH, Hetzner, Constant, Amazon. Datacenter IPs
hitting the API get a challenge instead of a block, so legit dev boxes
still work.

Leave 2 custom-rule slots free for later.

## 5. Security level (Security > Settings)
Security level -> Medium (default is fine; do not enable "I'm Under Attack"
unless there is an active incident).

## Verify after
- Visit https://gridnode.network and confirm the app loads normally.
- Security > Events should start showing bot/rule activity within the hour.
- Test one API call path (log in with a NODE KEY) to confirm no false positives.
