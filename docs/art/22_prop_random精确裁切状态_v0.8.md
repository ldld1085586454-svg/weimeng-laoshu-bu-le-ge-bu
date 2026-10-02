# prop_random 精确裁切状态 v0.8

## 已确认
社区构建 `resources/config.8b75c.json` 中存在：
- `rewardIcon/prop_random`
- UUID / native version 链路指向与其他道具相同的 `rewardIcon` 图集族。
- `rewardIcon` 原生纹理已定位为 `assets/resources/native/12/128b0bdde.4bc94.png`，尺寸 345×1022。

## 尚未确认
公开仓库没有保留 `prop_random` 对应的独立 SpriteFrame import JSON；第二个 2022-09-16 镜像同样缺失该文件。因此当前不能仅凭猜测写死 x/y/w/h。

## 视觉参考
历史/后续截图能够清楚看到“洗牌道具”的双向交叉箭头图标，可用于人工比对，但**截图不是 atlas 精确裁切坐标证据**。

## 当前工程处理
- `assets/art/ui/prop_random.png` 继续使用程序占位资源。
- 找到包含完整 SpriteAtlas 元数据的构建或拿到可授权原始图集后，再替换并更新裁切清单。
- 禁止用视觉猜测坐标伪装成“verified_spriteframe”。
