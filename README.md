# Drift Fox（雪地：北极狐）

一款赛璐璐风格的雪原街机漂移游戏：操控全速疾驰的北极狐，按住 Shift 利爪抓雪贴地漂移，
犁开碎雪蓄满寒气，满格穿越冰晶门、蹬冰飞跃裂谷。一局 5 个飞跃点，寒气满格才能起飞。

## 文档分工

- **README**：给玩家、试玩者和准备参与项目的人看，说明游戏是什么、怎么玩、怎么运行。
- [`docs/llmwiki.md`](docs/llmwiki.md)：给 AI 和接手代码的开发者看，记录稳定的玩法、输入、渲染、资产管线与验收合同。
- [`docs/development-handoff.md`](docs/development-handoff.md)：记录当前版本的开发交接、已完成事项、未完成事项和风险，不承担长期架构说明。
- [`docs/PRODUCT.md`](docs/PRODUCT.md)：产品事实的单源（标语、卖点、美术风格、验收标准）。
- [`docs/DEVPLAN.md`](docs/DEVPLAN.md)：当前开发计划与唯一下一步。

## 本地运行

```bash
npm install
npm run dev
```

打开终端输出的地址即可。游戏是纯前端应用，无账号、无服务端状态。

## 玩法与操作

自动全速奔跑；玩家只负责转向和漂移：

| 设备 | 转向 | 抓地漂移 |
| --- | --- | --- |
| 键盘 | `A` `D` 或 `←` `→` | `Shift`（按住，松开爆发蹬冰） |
| 手柄 | 左摇杆 | `X / Square` |
| 手机（844x390 横屏） | 左侧触控区 | 右侧触控区 |

漂移时犁出爪痕、喷出冷气并积蓄寒气槽；满格后穿越金色冰晶门即脚本化飞跃裂谷。
寒气不足或过门偏离会坠入裂谷，坠落扣部分寒气并回正重生。`R` 重开一局。竖屏手机会提示旋转设备。

## 画面与美术

街机雪原 = LowPoly 几何 × toon/cel 着色 × 极光色彩剧本（亮蓝白昼天空 + 青色极光帘 +
白雪蓝影 + 金色冰晶门）。北极狐是 Blender 程序化生成的**蒙皮骨骼角色**（19 根骨骼，
代码 60Hz 驱动四足步态与漂移姿态），表面覆盖**两层毛发壳**（shell texturing），
远景是原画重打包的 360° 整球穹顶——怎么转身都不会露出贴图边缘。

## 开发参与

TypeScript 游戏逻辑 + Vite 开发环境 + Three.js 实时 3D；Blender headless 负责角色与道具网格
（`tools/blender/*.py` 导出 GLB），Playwright 在真实浏览器里跑确定性验收。

```bash
npm run build          # tsc + vite 产物
npm run verify:smoke   # 桌面 + 844x390 横屏：启动、非空渲染、奔跑/漂移蓄寒/爆发/五门飞跃/坠落重生合同
npm run shot           # 评审截图（--pose closeup / closeup-drift / turn / drift / leap，--mobile）
npm run build:assets   # 重建全部 Blender 资产（gate.glb / fox.glb）
```

常用代码位置：

- `src/game/`：狐狸骨骼驱动（`fox.ts`）、地面真值模拟（`foxController.ts`）、赛程导演、爪痕/冷气。
- `src/world/`：赛道样条与裂谷地形、雪原高度场、Blender 道具加载与材质映射。
- `src/render/`：toon 材质（含毛发壳 alpha 裁剪）、描边、ink 预通道、天空、极光、远景穹顶、后处理。
- `src/core/`：60Hz 固定步进、键盘/手柄/触控输入合同、调色板。
- `harness/`：确定性浏览器验收与截图。

每个任务开始都完整阅读 [`AGENTS.md`](AGENTS.md)、[`docs/llmwiki.md`](docs/llmwiki.md)
和 [`docs/development-handoff.md`](docs/development-handoff.md)。改了物理、输入或模拟就运行
`verify:smoke`；像素改动则保存桌面和横屏手机截图供人工复核。

## 资产与许可

原画（`src/assets/textures/keyart-vista.png`）为项目所有者提供的素材，PALETTE 从中取色锁定；
角色与道具网格由仓库内 Blender 脚本程序化生成，可随时重建（`npm run build:assets`）。
