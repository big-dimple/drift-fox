# Drift Fox 开发计划 v1.0

> 状态：M0 进行中（美术方向按原画修正为「白昼极光」后重启）· 2026-09-05
> 上游合同：`docs/PRODUCT.md`（产品计划定稿）。本计划只排"怎么落地"，不改产品决定。

## 复用策略

drift-fox 是新仓库，但从 board-race 选择性移植**已验证的渲染与输入管线**，不重写。物理手感参考 `boat.ts` 的漂移动力学（`latGMax` / `yawRateMax` 权威值），但重新实现为地面狐版。

| 来源（board-race） | 用途 | 说明 |
|---|---|---|
| `src/cel/toonMaterial.ts` `edgePass.ts` `outline.ts` `postPipeline.ts` `sky.ts` | 渲染底座 | 直接移植为 drift-fox `src/render/`，风格合同的核心载体 |
| `src/core/timeOfDay.ts` `nightPalette.ts` `palette.ts` | 色彩剧本 | 变种为「白昼极光」色彩剧本（对齐原画：亮蓝白昼 + 青绿极光帘） |
| `src/core/loop.ts` `input.ts` `stage.ts` `gamepadInput.ts` `haptics.ts` | 地基 | 60Hz 固定步 + 输入合同原样移植 |
| `src/game/boat.ts` 漂移段 | 手感参考 | 抓地漂移的向心 G / 角速度 / 阻尼参数派生，不拷贝代码 |
| `src/game/course.ts` 样条/航线概念 | 赛道参考 | 收窄版：单赛道 + 5 飞跃点，不搬七轨/雾道/Final 体系 |
| `harness/screenshot.mjs` + `verify:smoke` | 验证 | 裁剪版：启动渲染 + 核心合同断言 + 双尺寸截图 |
| Blender headless（bpy 脚本） | 道具美术主路径 | `tools/blender/*.py` 程序化建模 → 导出 .glb 到 `src/assets/models/` → 进场统一转 toonMaterial + 描边；材质命名约定 `energy_*` 上泛光层 |
| 3D AI 生成静态资产 | 道具美术备选路径 | Blender 产能不足时的备选；原画风格提示词包已交付 |

狐狸、地形、天空、极光维持程序化：狐狸要绑进 60Hz 固定步与骨骼动画（Blender 出网格，动画用代码驱动），地形要精确碰撞高度场，天空极光是 shader。

明确不搬：双人分屏、导弹/互动、高光录像、荣誉/金币经济、PWA 之外的开场体系。

## 里程碑

### M0 — 地基（目标 1 天）

- Vite + TS 骨架，目录 `src/render|core|game|world|hud`，`index.html` 竖屏旋转提示；
- 移植渲染五件套 + loop/input/stage，空场景跑出白昼极光雪原（亮蓝白昼天空 + 极光帘 + 白雪蓝影，对齐原画），并立起原画背景板：远山雪峰、右侧蓝冰崖、发光裂谷、金色冰晶门（Blender headless 管线首件验证；裂谷/冰崖的玩法版归 M2）；
- `verify:smoke` 裁剪版上线（能启动、渲染非空、844x390 截图）。
- **验收**：build + smoke 绿，桌面/手机天空截图评审通过。

### M1 — 狐狸手感（核心里程碑，目标 1 周）

- LowPoly 狐狸程序化网格（橙白花斑、耳尖、黑袜、大尾巴剪影；批次化建模思路参考 `riderMesh.ts`）；
- 自动全速奔跑 + Shift 抓地漂移（抓地 = 向心 G 与角速度权威提升、留下爪痕 decal + 冷气粒子）+ 松开爆发蹬冰；
- 平地试滑区：一段直道 + 两个发卡弯。
- **验收**：30 秒试玩想继续；爪痕/冷气在雪面可读；build + smoke 绿。

### M2 — 赛道与飞跃（目标 1 周）

- 雪原样条赛道 + 寒气值 HUD 槽；
- 5 个冰晶门飞跃点 + 裂谷几何（飞跃=跃迁资源的释放，不额外加飞行物理分支）；
- 掉谷失败判定 + 回正。
- **验收**：桌面 + 844x390 跑通全程；build + smoke 绿。

### M3 — 环境互动（目标 3-4 天）

- 松树林回转门、扬尘尾迹、冰面裂纹 decal（复用 M1 decal 池）、白昼极光色彩剧本调优（极光帘形态/密度/流动感）。
- **验收**：三件套 + 松林截图评审；夜航可读性对标 board-race 夜间合同。

### M4 — 表现层完整化（目标 3-4 天）

- HUD 全套（寒气槽、飞跃提示、失败回顾）、音效（抓地/漂移/飞跃三词汇）、haptics、移动端触控（左区转向、右区抓地）。
- **验收**：桌面 + 844x390 完整体验；build + smoke 绿。

### M5 — 验收封板（目标 2 天）

- 对照 `PRODUCT.md` 三条验收标准逐条过；
- 双人试玩收集"比船更贴地更紧张"反馈，必要的手感微调；
- 归档：本计划打勾、更新 `AGENTS.md` 命令区。

## 唯一下一步

**M0：建 Vite+TS 骨架并完成渲染五件套移植，跑出极光雪夜空场景。**
