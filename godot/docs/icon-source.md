# UI icon source and license

All 20 interface icons are from the official [Phosphor Icons core repository](https://github.com/phosphor-icons/core), using the **Bold** weight from one pinned snapshot. These icons supplement the interface; they do not replace the user's existing card artwork.

- Package: `@phosphor-icons/core` **2.1.1** (version read from the package manifest at the pinned commit).
- Upstream commit: [`2b75f3ad12b420c9504ef05df8d2564a28f8500e`](https://github.com/phosphor-icons/core/tree/2b75f3ad12b420c9504ef05df8d2564a28f8500e).
- Upstream asset path: `assets/bold/<icon-name>-bold.svg`.
- Download URL template: `https://raw.githubusercontent.com/phosphor-icons/core/2b75f3ad12b420c9504ef05df8d2564a28f8500e/assets/bold/<icon-name>-bold.svg`.
- License: MIT. The full, unchanged upstream copyright and permission text is retained in [`assets/ui-icons/LICENSE`](../assets/ui-icons/LICENSE): **Copyright (c) 2023 Phosphor Icons**. Include this file in redistributed builds/source packages.
- Local adjustment: root `fill="currentColor"` is changed to `fill="#ffffff"` so Godot `CanvasItem.modulate` / `self_modulate` can tint the imported textures. All path geometry and the `0 0 256 256` viewBox are unchanged. No SVGs are generated or substituted from another icon family.
- Machine-readable paths: [`icon-map.json`](../assets/ui-icons/icon-map.json). Source/local file hashes: [`sha256.json`](../assets/ui-icons/sha256.json).

## Semantic mapping

| Key | Meaning | Phosphor Bold asset |
| --- | --- | --- |
| `back` | 返回 | `arrow-left-bold.svg` |
| `settings` | 设置 | `gear-bold.svg` |
| `close` | 关闭 | `x-bold.svg` |
| `move` | 移出三张牌到暂存 | `tray-arrow-down-bold.svg` |
| `undo` | 撤回 | `arrow-counter-clockwise-bold.svg` |
| `shuffle` | 洗牌 | `shuffle-bold.svg` |
| `revive` | 复活 | `heart-bold.svg` |
| `rank` | 排行榜 | `trophy-bold.svg` |
| `friends` | 好友 | `users-bold.svg` |
| `topic` | 话题 PK | `sword-bold.svg` |
| `wardrobe` | 衣服/换装 | `t-shirt-bold.svg` |
| `profile` | 个人 | `user-bold.svg` |
| `club` | 游戏圈 | `users-three-bold.svg` |
| `locate` | 地区定位 | `map-pin-bold.svg` |
| `bullet` | 弹幕 | `chat-text-bold.svg` |
| `volume` | 音量开启 | `speaker-high-bold.svg` |
| `mute` | 静音 | `speaker-slash-bold.svg` |
| `music` | 音乐 | `music-notes-bold.svg` |
| `eye` | 显示/观看 | `eye-bold.svg` |
| `eye_off` | 隐藏 | `eye-slash-bold.svg` |

`move` intentionally uses a tray with an inward arrow to communicate temporary storage. The UI must retain its “移出” text and three-card explanation; this icon does not mean delete. `topic` uses the package's single sword as a compact PK symbol, accompanied by its text label. No shop or daily check-in icons are included.

## Godot compatibility verification

Godot **4.7.2 stable** (`ed1daf0bf`) imported these 20 SVG files in a separate temporary project using `--headless --editor --import`, then loaded every imported file as `Texture2D` in a headless script. Each texture measured **256 × 256** and contained visible pixels. Both processes returned exit code **0**; the script printed:

```text
PHOSPHOR_IMPORT_PASS count=20 dimensions=256x256 nonempty=true
```

The temporary test redirected Godot's application/cache directories inside the writable temp directory. A sandbox-related `Failed to read the root certificate store` message was emitted; it did not affect local SVG import or texture validation. No game/editor window was launched and no project rules, scenes, or card assets were changed.

## SHA-256

Both upstream bytes and adjusted local bytes are listed below. Hashes are lowercase hex.

| File | Upstream SHA-256 | Local SHA-256 |
| --- | --- | --- |
| arrow-counter-clockwise-bold.svg | `b02289073e6510dad9f74d1edfdfdd533ef848154fa6cb910a3302b960b533c2` | `62094518390ef75040fa9e3034a9aba2d344323ea4d9d19f9ce1e109e278072a` |
| arrow-left-bold.svg | `7588792d7824e7c5337bca7b5de96ad0685ddea0a5732dfb62701d163a076563` | `587ec0440aa708880b68c43f2c59d8ecac61cbf756b5778a5e17048f8e08d590` |
| chat-text-bold.svg | `f0404176ec19df88951e27e96fc38a876f2aeb919efbb3a668bc0163a7e71e13` | `b4e1e5ec139b260f5016016ab160e34c3343462a7333c04f672e359c5a3fbe6c` |
| eye-bold.svg | `766b10b6ed7d8a899a76ba28f3f066ca49e8ce0a75ae68b65bfec0e615d8130d` | `e1023d284e340e9a161102e31bb17e861acb8a8f7a1da9b99c427240647a5ba2` |
| eye-slash-bold.svg | `2c90457e608c86c1e880b897f2258eeea8ea7f60e7eaf61592b9674d7978647e` | `4fd959e2cbc6514c69d2e550971edc073c5444ca2411f8c85adef1114faada09` |
| gear-bold.svg | `b70f71ce6d08d59ee13575d7278737ff6dc2011adb5d126c9090641bc783fdd2` | `0d1f37374650831d87391a5ff3dda0d708ea8bf725c6a9f45794ca8427a8abb2` |
| heart-bold.svg | `786ecbd4cb71cf3356bc3da191185084693fc278dc3aaf389bcdeb8b10fc7104` | `73843a1fdbfd579836473ce22933061ffcc6ca16149a9703cbbe0dea8fc3490e` |
| map-pin-bold.svg | `07bb9883e9e324d0043309d8f7e41a1b2a8db80acb8371be8294edd9135f3b69` | `67c916553f1aed5ab1a56ec8d965bec1c3b9d8189d733114be94f23f88d1f2a9` |
| music-notes-bold.svg | `9b46fd28e1d67ed654730c11c1c928366d581eaa337dea44ba33c0a97eb21620` | `9f78e02959b43deab05b9525e64e12295a15c6f89689018c5f09e22018f22268` |
| shuffle-bold.svg | `6a5f1c5f067da9a20cac8872c921d61d9c93d571493677c95a159d8f1f952eaf` | `d57b82491283b6550d3d7b53220d01ca3d25ed178ec3f35d5144173cf400ea89` |
| speaker-high-bold.svg | `f0fc825cb96958238882b98aea55afdb63da92c4c5c8b499c0e1068e9abb299e` | `5b1bbbfe029b092d00b553235b59dc5594c683a4a88511bf0e1e8fc8c08c15a2` |
| speaker-slash-bold.svg | `19f3d5a5a4b3012c43dbc712b9a48a81fb458ec4ba3f3a9a9565a0c6526ff315` | `abbf005639d32e773f742bf808fc29b1c22418ac9fe5be3a03405adaba20cd8a` |
| sword-bold.svg | `530fffc9146242d007810f628e9bf65cbf6f79853b8a8fc4dbce1343d6f54ff1` | `8ccf59a380fbdd1464401f2e8ad56065493b912b6094dff50a6bcda3cd582053` |
| t-shirt-bold.svg | `ac5d0c01103ae6bd62f9305174762af909474434715d2cc0ce66f56421c25610` | `8c9e30b5c62c2762c69707faa44a64b9b2a5212a663d9245dba8313129f84601` |
| tray-arrow-down-bold.svg | `3ed2c27d885d7f779d2ac9e7e0e9777217e073061be684887dd66bd957e2110d` | `4633f655b98fc82ee9aa36b1afc5838fbb5e920fa60f62b20f39fcc9705243fd` |
| trophy-bold.svg | `a0f8974d38f1ea17839a756a0d6584fa672fc70332d9376486b4f7f715d1af65` | `a161a9baa90381ffb20e1c020ccaf27a22b98bb5c825bc8f413615c3239e042b` |
| user-bold.svg | `a4739174a602675d627b029aa524dd9345c56838ed1da34b5e1c3d02611792d5` | `db645710564d05a41088932f5a4d00b56e4621a318492e4737bd4d34c2701e1a` |
| users-bold.svg | `3483c79bd35afe632197363741da6018b1204b168cf3f34e7073f574306677a8` | `8ab6c60fee027dced2d49290fb6add8113303b29ece633c4a9b08faeb91fe102` |
| users-three-bold.svg | `5246b7d9cc7e2011823f127b65278a3d9434bb0b008e9dedacd9f10ff33697c5` | `20b9f6dc9223d17007a4327bf51f923db7cb4c2f171e16829c9983f4c01722e1` |
| x-bold.svg | `d540487912a267d83c495954b24ca07981002fda05ee2ea0b492d8fc188d1c3e` | `cab98c30df11991ebe926079ac5ced112af979589d743bc353156ce8781b2b62` |
| LICENSE (unchanged) | `b5b1f1da112d18ea2147decfd48ddc1bf2b5aeb6c265381579340e95b15a2bb2` | `b5b1f1da112d18ea2147decfd48ddc1bf2b5aeb6c265381579340e95b15a2bb2` |
