# Independent authenticated service

This service is separate from `services/server.js` (the local simulated-development service). It reuses the immutable round replay and existing social rules without turning their client callback observations into trusted rewards.

## Run locally

Requires Node.js **>=22.13** (`node:sqlite`; verified here on Node 24.19). No package installation is required.

```sh
node services/online/server.js
# http://127.0.0.1:8771/health
node --test tests/product-online-server.test.js
```

The executable always binds `127.0.0.1`. Programmatic `server.listen(0)` also defaults to loopback; non-loopback binds are rejected. `ONLINE_PORT` changes the port. `ONLINE_DB_FILE` changes the SQLite file (default: `local-data/online.sqlite`). The executable does not serve repository files or the game HTML.

Login is closed with `WECHAT_AUTH_NOT_CONFIGURED` until the service operator configures `WECHAT_APP_ID` and `WECHAT_APP_SECRET` in the **server's secure environment**. Do not put AppSecret in the game, config files committed to git, a command line, a URL shared with people, or logs. No credentials are included in this repository. The default adapter exchanges the one-time `wx.login` code only at the official `https://api.weixin.qq.com/sns/jscode2session` endpoint, uses a timeout and refuses redirects. It discards `session_key` and `unionid` immediately and returns only the resolved identity internally. Tokens are random 256-bit values; only SHA-256 token digests are persisted.

This code has not been connected to a real WeChat project, real ad callback provider, public domain, or phone. Those are separate acceptance gates. No resources are purchased or publicly deployed by these files.

## Programmatic interface

```js
const {createOnlineServer} = require('./services/online/server');
const server = createOnlineServer({
  dbFile: '/private/data/online.sqlite',
  deals: [/* validated frozen deal snapshots */],
  // Defaults to the server environment + official code2Session adapter.
  // exchangeCode: async code => ({openid: 'TEST-ONLY-IDENTITY'}),
  // verifyReward: independently verified server-to-server evidence adapter,
  // now: Date.now,
});
server.listen(8771, '127.0.0.1');
// server.close() closes the SQLite handle after outstanding requests finish.
```

`exchangeCode(code)` injection exists for deterministic integration tests or a separately audited server adapter. Never use a fake adapter in deployment. Successful results require a nonempty `openid` and no provider error. The external callback is bounded by `providerTimeoutMs` (default 8000, maximum 30000). Error bodies never expose provider messages, AppSecret, session keys, source errors, or SQL.

Optional `sessionTtlMs` defaults to 8 hours. The clock and session TTL must be trusted server configuration. Login codes are reserved transactionally before the asynchronous exchange, so parallel/repeated uses cannot mint additional sessions. Failed exchanges require a fresh `wx.login` code. No raw code is stored. Authentication and call requests are rate limited by the actual loopback peer, with counters persisted across restarts: `rateLimit: {auth:30, call:600, windowMs:60000}` by default. `maxBodyBytes` defaults to 10 MiB, while round logs retain the engine's 8 MiB / 10,000-command limits. The default limits are for a single-instance integration baseline, not an internet-scale load target.

## HTTP contract

All mutation routes require `Content-Type: application/json`. All responses are `Cache-Control: no-store`. No permissive CORS is enabled.

- `POST /api/auth/wechat` with `{code}` -> `{token,userId,expiresAt}` (`expiresAt` is Unix milliseconds)
- `POST /api/call` with `{action,data}` and `Authorization: Bearer <token>` -> `{ok:true,data:result}`
- Failures -> `{ok:false,error:CODE}` with appropriate HTTP status; authentication failures are HTTP 401 (`SESSION_REQUIRED`, `SESSION_EXPIRED`), conflicts 409, rate limits 429, missing providers 503
- `GET /health` -> `{mode:'authenticated_service',production:false}`

User ownership always comes from the session. Extra payload keys are rejected; there is no profile/entitlement editing endpoint.

Existing actions are `bootstrap`, `start({mode})`, `settle({ticketId,log,elapsedMs})`, `equip({skin})`, and `bullet({id})`. Social rules remain the existing research reconstruction, including mode/day deduplication. `bootstrap` additionally reports:

```js
{
  dataMode: 'authenticated_service',
  capabilities: {rewards: /* trusted verifier configured */, cloudProgress: true},
  timingVerification: 'unverified_client_duration'
}
```

There is no independent trustworthy competitive timer. Fastest and no-assist speed honors are disabled (`honors.fast` / `honors.king` are `null`). Accepted results have `timingVerification:'unverified_client_duration'`. Replay verification proves valid commands for an assigned deal; it does not prove human play, the absence of a solver, or truthful timing.

`leaderboard({mode='daily',day=today,limit=20,cursor})` returns `{day,mode,ordering:'accepted_completion_time',timingVerification,entries,total,nextCursor}`. Limit is 1–100. Entries represent unique users with accepted clears for that day/mode, ordered by server acceptance time rather than client duration. No fabricated population is added. Cursor pagination is a live view; a concurrent new settlement can change the view.

## Cloud progress and conflicts

- `progress.get({})` -> `{revision,progress:null|{ticket,log,elapsedMs}}`
- `progress.put({expectedRevision,ticketId,log,elapsedMs})` -> the updated structure
- `progress.clear({expectedRevision,ticketId})` -> `{revision:oldRevision+1,progress:null}`

Each account has **one global active progress**, across modes and devices. Revision starts at zero and only increases. A mismatch is `PROGRESS_CONFLICT`; a different active ticket is `PROGRESS_ACTIVE_TICKET_CONFLICT`; a mismatched clear is `PROGRESS_TICKET_CONFLICT`. None overwrite the winning write. An explicit successful clear means abandoning that ticket: it retires the ticket in the same transaction, so late progress writes, offers, verifier completions and new settlements fail `TICKET_CLOSED`, including after restart. Already accepted settlement retries stay valid. Logs must belong to that account's unexpired, current-day ticket and assigned snapshot, replay exactly, extend any previous saved log, and never reduce accumulated elapsed time. Wrong branches or rewinds are `PROGRESS_LOG_CONFLICT`.

PLAYING and initial LOST/pending-revival states can be saved. OFFERED/WAITING may be saved; they do not authorize rewards. EARNED/COMMIT require the matching server-issued grant. When progress is read on a new day, stale progress is cleared and revision increases. Old tickets cannot be revived by late saves. Settlement atomically clears only its own ticket's active progress and increments revision; subsequent saves to a settled ticket fail `TICKET_SETTLED`. Exact accepted settlement retries return the same result with `replayed:true`, including after the day expires. Different contents are `SETTLEMENT_CONFLICT`. Clients should refresh progress revision after successful settlement.

### Explicit device-versus-cloud resolution

Only after the user deliberately chooses “keep this device,” call:

```js
progress.resolve({expectedRevision, ticketId, log, elapsedMs, choice:'keep_device'})
// -> {revision, progress:{ticket,log,elapsedMs}, backupId}
```

This is a separate CAS action, not a relaxation of `progress.put`. The selected ticket must still belong to the authenticated account, be current-day and open, and contain a valid replay and duration. `expectedRevision` must match the current cloud revision. No active cloud record returns `PROGRESS_NO_CONFLICT`; read again and use ordinary `progress.put` where appropriate. Missing/wrong choice returns `INVALID_RESOLUTION_CHOICE`.

- Different tickets: save a durable audit backup of the complete old cloud record, retire the displaced cloud ticket, validate the chosen device record and replace active progress in one transaction. Already accepted settlements and their exact retries remain unchanged.
- Same ticket: allow replacement only when both logs contain exclusively PICK commands and the ticket has **no issued grant**, including a grant absent from the submitted logs. This preserves the selected original board and device elapsed time without permitting reward history rewrites. Ordinary future saves must extend this newly selected branch.
- A same-ticket reward branch returns HTTP 409 `PROGRESS_REWARD_BRANCH_CONFLICT`. The UI must keep the conflict visible and offer using the cloud copy or explicitly abandoning/restarting; it must never report that the device copy was kept.
- Outstanding offers for the displaced/selected branch are revoked in the same transaction. A verifier that started before resolution is checked again after its asynchronous result and fails `REWARD_OFFER_REVOKED` (or `TICKET_CLOSED` for a displaced ticket). The same revoked offer cannot be registered again. Previously issued legitimate grants on a different selected ticket are still independently validated.

Each `backupId` identifies a retained private SQLite audit record with owner, timestamp, old revision, full previous progress, resolution kind and replacing ticket. Backups survive restarts. They are audit/recovery material, not a public endpoint or an automatic path to revive retired tickets. There is no cross-account backup-access endpoint. A failed backup/replacement write rolls back retirement, revocation, grants and progress together. A concurrent winning change returns `PROGRESS_CONFLICT` rather than overwriting it.

## Trusted rewards are closed by default

Native `onClose({isEnded:true})` is **client observation, not trusted platform proof**. No adapter that simply echoes or trusts that boolean is supplied. Share-return grants are rejected for this service, including from saved replay logs.

1. `reward.offer({ticketId,log})` accepts an owned, valid replay whose pending reward is OFFERED or WAITING, video channel only. It returns `{token,expiresAt}` and binds the account, ticket, exact command prefix through OFFER, assist, board revision, channel and expiration (five minutes or ticket expiry, whichever is earlier).
2. `reward.observe({ticketId,token,observation})` invokes the configured `verifyReward` adapter with `{userId,ticketId,token,assist,channel,boardRevision,expiresAt,observation}`. Observation must be an object of at most 16 KiB.
3. The trusted adapter must independently validate provider/server evidence and its binding to that complete context. It must return `{verified:true,evidenceId:'unique-provider-event-id'}`. A boolean, an `isEnded` field, or a missing verification result fails. The adapter must not manufacture evidence IDs for arbitrary client observations. Shared evidence IDs cannot authorize another token. Provider timeout/errors fail closed.
4. On success the response is `{authorized:true,token}`. Exact retries are idempotent. A different observation for an issued token conflicts. Pending verification rechecks session, ticket, saved progress, cancellation and expiry **after** the provider returns.
5. Logs containing AD_CLOSE-complete/EARNED or COMMIT require that ledger entry and its exact offer prefix. Cross-user, cross-ticket, forged, expired and contradictory grants are rejected before social mutation. Accepted settlement consumes the grant in the same SQLite transaction.

A newly issued grant still has the offer deadline. If its exact EARNED or COMMIT prefix was successfully saved to cloud progress before expiry, that accepted prefix remains recoverable for the lifetime of its same-day ticket. This preserves already acknowledged rewards through offline recovery without allowing a different branch or new expired grant. Local-only unsynced rewards cannot be claimed as cloud-acknowledged rewards.

Without a trusted adapter, `capabilities.rewards` is false and observation returns `TRUSTED_REWARD_VERIFIER_NOT_CONFIGURED`. The packaged executable intentionally does not load a verifier from untrusted configuration or install a made-up ad verifier. Before enabling this capability, the operator must establish a legitimate independently verifiable reward source supported by the platform and review the adapter.

## Persistence and deployment boundary

One SQLite row contains the social model, token digests, used-code digests, progress revisions, reward offers/grants and evidence ledger. Each operation reads a fresh snapshot inside `BEGIN IMMEDIATE`; mutation and persistence commit together under WAL + `synchronous=FULL`. Failure rolls everything back. The tests include a real SQLite abort trigger proving that result, grant consumption and progress cannot partially commit. Back up the database using a SQLite-consistent procedure; copying a live `.sqlite` without its WAL is not a backup. Treat the database and backups as private user data and restrict access at deployment.

This is a single-instance baseline. History and ledger retention/compaction, abuse controls beyond coarse peer limits, metrics, migrations, backup/restore drills, capacity tests and real platform acceptance are deployment work, not claims of this local verification. Keep the assigned deal set stable while current tickets exist.

For a future HTTPS reverse proxy, configure **both** `ONLINE_PUBLIC_ORIGIN=https://your-owned-domain` and `ONLINE_TRUST_PROXY=1` (or factory `publicOrigin` / `trustProxy:true`). The service continues to bind only loopback, requires the configured Host and `X-Forwarded-Proto: https`, and accepts browser Origin only if it exactly matches that HTTPS origin. The trusted proxy must overwrite those headers and terminate valid TLS; do not expose the loopback upstream directly. Without that explicit mode, forwarded headers are rejected. Never treat this header check as TLS by itself. Platform request-domain allowlisting, privacy/consent obligations, real account setup and public deployment still require separate authorization and testing.

References: [official WeChat code2Session](https://developers.weixin.qq.com/minigame/dev/api-backend/open-api/login/auth.code2Session.html), [Node SQLite documentation](https://nodejs.org/api/sqlite.html).
