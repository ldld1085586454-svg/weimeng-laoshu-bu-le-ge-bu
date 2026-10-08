# JS Completion Implementation Plan

执行方式：按下列可独立验收的步骤实施，并在最终交付前完成整体审查。

**Goal:** Complete approved JS local game, same-day resume, backend and WeChat integration code without pretending unconfigured platform services are live.
**Architecture:** Existing pure round and shared Canvas remain. Add independent Node/SQLite service and a WeChat transport client; preserve the current explicitly simulated local path. Use per-user/service storage scope and cloud CAS, retain terminal outbox precedence.
**Tech Stack:** JavaScript CommonJS, Canvas 2D, Node built-ins including SQLite (Node >=22.13), WeChat native SDK.
**Spec:** ../specs/2026-10-03-js-completion-proposal.md, approved scope: backend/account/cloud progress and same-day resume, no purchase or deployment.

## Global Constraints
- Frozen algorithm and user cards remain byte-identical.
- No public deployment, merge, purchase, generated platform credentials, or client AppSecret.
- Production gate remains closed until platform configuration and real device checks pass.
- Share return never earns a native reward. Missing trusted reward verification fails closed.
- Do not label Node tests or native Canvas renderings as browser or WeChat device verification.

## Review Focus
- An obsolete instance cannot clear another instance's outbox or publish after destruction.
- Expired, cross-user, corrupt or conflicting progress must not silently replace current progress.
- Client SDK observations cannot become trusted rewards merely because a server echoes them.
- Session refresh cannot switch user scope and resume another user's save.
- Reduced motion and background transitions do not alter business time or touch geometry.

### Task 1: Existing runtime safety
Files: ui/product/app.js, src/product/controller.js, tests/product-runtime-safety.test.js, tests/product-lifecycle-safety.test.js
- [x] Reproduce and red-test native share award, exit timer, topic copy, destroyed async work and midnight input.
- [x] Fix source boundaries and verify focused regression suites.
- [x] Independent review before final aggregate verification.

### Task 2: Approved visuals
Files: ui/product/mascot.js, ui/product/icons.js, assets/theme/mascot, assets/theme/phosphor, art-assets.js, app.js, build-full.js
Interfaces: createMascot({artAssets,reducedMotion,createCanvas}) and drawIcon(ctx,name,x,y,size,color).
- [x] Preserve original PNG and MIT SVG sources; red-test animation, no business mutation and fallback.
- [x] Integrate real home/result avatars, read-only cues, settings and visibility.
- [x] Build browser/WeChat modules and render actual native Canvas screens for inspection.

### Task 3: Backend
Files: services/online/**, tests/product-online-server.test.js
Interfaces: createOnlineServer({dbFile,deals,exchangeCode,verifyReward,now}); POST /api/auth/wechat {code}; POST /api/call {action,data}, Bearer session; existing actions plus progress.get/put/clear, reward.offer/observe, leaderboard.
- [x] Red-test login isolation, expiry, invalid code, missing setup and no secret response.
- [x] Implement SQLite transactional persistence, authenticated social actions, CAS progress, strict reward ledger and paginated leaderboard.
- [x] Red-test replay/duplicate/cross-user/grant forgery, restart, progress conflicts and exact result retries over real loopback HTTP.
- [x] Review spec compliance and quality.

### Task 4: WeChat network client
Files: src/product/online-client.js, tests/product-online-client.test.js; later templates/wechat-full/game.js.
Interfaces: wechatClient(wx,{serviceUrl,allowLoopbackForTests:false,timeoutMs}) returning scope/kind/ready/request, authenticated user scope; never fallback to local on error.
- [x] Red-test wx.login/wx.request, transport failure, one reauth, concurrent login, user scope and domain rejection.
- [x] Implement transport and session handling without persistent credentials or AppSecret.
- [x] Integrate explicit online_preview configuration, capability labels and cloud progress.

### Task 5: Resume and cloud sync
Files: ui/product/app.js, src/product/progress.js if useful, tests/product-resume.test.js.
- [x] Red-test ordinary PLAYING/first-loss resume, elapsed time excluding offline, pending interruption, scope/day/corruption and terminal precedence.
- [x] Implement home resume/restart choice, confirmed discard and original ticket restoration.
- [x] Red-test cloud CAS conflict and local write failures; do not silently replace an incompatible save.
- [x] Wire reward authorization hooks and cloud progress, with missing verification disabled.

### Task 6: Verification and final source
Files: docs/product, package.json, tools/build-full.js, verification scripts.
- [x] Complete source scan for credentials, unchanged freeze hashes, repeated build/config preservation.
- [x] Run full:check, full:stress, release gate expected closed, real HTTP server restart/identity tests.
- [x] Independent whole-diff review, fix important findings, rerun affected tests and aggregate suite.
- [x] Produce one final verified source/build archive with precise platform limits. No public publication.
