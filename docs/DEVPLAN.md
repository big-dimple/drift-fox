# Drift Fox 开发计划 v2.0

> 状态：M0 已完成 · M1 进行中 · 2026-09-05
> 上游合同：`docs/PRODUCT.md`（产品计划定稿）。本计划只排"怎么落地"，不改产品决定。
> 自治目标：一路推进到「可上手操作的 H5 游戏」（M2 末态）再交付评审；M3+ 为打磨。

## 复用策略

drift-fox 是新仓库，但从 board-race 选择性移植**已验证的渲染与输入管线**，不重写。物理手感参考 `boat.ts` 的漂移动力学（`latGMax` / `yawRateMax` 权威值），但重新实现为地面狐版。

| 来源（board-race） | 用途 | 说明 |
|---|---|---|
| `src/cel/toonMaterial.ts` `edgePass.ts` `outline.ts` `postPipeline.ts` `sky.ts` | 渲染底座 | 已移植为 drift-fox `src/render/`，风格合同的核心载体 |
| `src/core/timeOfDay.ts` `nightPalette.ts` `palette.ts` | 色彩剧本 | PALETTE 已按原画取色锁定（白昼极光） |
| `src/core/loop.ts` `input.ts` `stage.ts` `gamepadInput.ts` `haptics.ts` | 地基 | 60Hz 固定步 + 输入合同已原样移植 |
| `src/game/boat.ts` 漂移段 | 手感参考 | 抓地漂移的向心 G / 角速度 / 阻尼参数派生，不拷贝代码 |
| `src/game/course.ts` 样条/航线概念 | 赛道参考 | 收窄版：单赛道 + 5 飞跃点，不搬七轨/雾道/Final 体系 |
| `harness/screenshot.mjs` + `verify:smoke` | 验证 | 裁剪版：启动渲染 + 核心合同断言 + 双尺寸截图 |
| 原画 PNG（用户提供） | 远景 | 修版（patch 掉画中门/狐）为 `keyart-vista-plate.png`，贴相机跟随圆柱带（`render/vista.ts`）；PALETTE 从原画取色锁定 |
| Blender headless（bpy 脚本） | 道具/角色网格主路径 | `tools/blender/*.py` 程序化建模 → 导出 .glb 到 `src/assets/models/` → 进场统一转 toonMaterial + 描边；材质命名约定 `energy_*` 上泛光层 |
| 3D AI 生成静态资产 | 道具美术备选路径 | Blender 产能不足时的备选；原画风格提示词包已交付 |

狐狸动画用代码驱动（Blender 出分件网格，60Hz 固定步里算姿态），不依赖外部骨骼动画。

明确不搬：双人分屏、导弹/互动、高光录像、荣誉/金币经济、PWA 之外的开场体系。

## 里程碑

### M0 — 地基 ✅（方向评审通过：「有那么点意思了」）

- [x] Vite + TS 骨架，目录 `src/render|core|game|world|hud`，`index.html` 竖屏旋转提示；
- [x] 移植渲染五件套 + loop/input/stage，只修剪 import 依赖；
- [x] 空场景对齐原画：远景 = 原画 matte painting 圆柱带（修版去门/狐），PALETTE 从原画取色，中近景 = 发光裂谷 + 冰碴散布 + 金色冰晶门（Blender headless 首件验证）；
- [x] `verify:smoke` 裁剪版上线（启动、渲染非空、1440x900 + 844x390 截图）。
- **验收**：build + smoke 绿 ✅，桌面/手机截图方向评审通过 ✅。

### M1 — 狐狸手感（核心里程碑，目标 1 周）

- [x] 北极狐网格：程序化 LowPoly 分件（three.js 直出——四肢/尾巴绕各自枢轴，免导出往返）。雪白主色、深色耳尖爪、大尾巴剪影，以原画为准；代码驱动奔跑/漂移姿态；
- [x] 自动全速奔跑 + Shift 抓地漂移（向心 G 与角速度权威提升、速度方向滞后于朝向 = 可读滑移角）+ 松开爆发蹬冰；
- [x] 寒气值：漂移积蓄、满格待发（HUD 最小槽已上线）；
- [x] 爪痕 decal 池 + 冷气粒子（漂移反馈二件套）；
- [x] 平地试滑区：体育场环形冰柱标记（两段直道 + 两个发卡弯）；
- [x] ink prepass 补齐（render/prePass.ts），狐狸/冰晶门恢复 cel 内部勾线。
- **验收**：smoke 合同断言绿（奔跑/漂移蓄寒/释放爆发/爪痕/冷气）；双尺寸截图过审。30 秒试玩感受待用户体验。

### M2 — 赛道与飞跃（目标：完整可玩一局 = 本次自治的终点）

- [ ] 雪原样条赛道（收窄单圈）+ 寒气值 HUD 槽；
- [ ] 5 个冰晶门飞跃点（复用 `gate.glb`）+ 裂谷玩法几何（飞跃 = 满格寒气的释放，不加飞行物理分支）；
- [ ] 掉谷失败判定 + 回正重生；失败/重开提示；
- [ ] 移动端最小触控：左区转向、右区抓地（对齐输入合同）。
- **验收**：桌面 + 844x390 跑通 5 个飞跃点全程；build + smoke 绿。**到此即「可上手操作的 H5」，交付用户评审。**

### M3 — 环境互动（目标 3-4 天）

- 松树林回转门（Blender 雪松）、扬尘尾迹、冰面裂纹 decal（复用 M1 decal 池）、白昼极光色彩剧本调优（极光帘形态/密度/流动感）、冰崖套件替换占位。
- **验收**：三件套 + 松林截图评审；白昼可读性对标原画。

### M4 — 表现层完整化（目标 3-4 天）

- HUD 全套（寒气槽、飞跃提示、失败回顾）、音效（抓地/漂移/飞跃三词汇）、haptics。
- **验收**：桌面 + 844x390 完整体验；build + smoke 绿。

### M5 — 验收封板（目标 2 天）

- 对照 `PRODUCT.md` 三条验收标准逐条过；
- 双人试玩收集"比船更贴地更紧张"反馈，必要的手感微调；
- 归档：本计划打勾、更新 `AGENTS.md` 命令区。

## 唯一下一步

**M1：Blender 出北极狐分件网格，狐狸在试滑区自动奔跑 + Shift 抓地漂移。**
