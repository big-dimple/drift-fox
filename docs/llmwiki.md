# Drift Fox AI 运行手册

状态：`current / schema-v1`

本文只记录接手代码必须知道的稳定结构和行为合同。每个任务都要完整读取本文、根目录
`AGENTS.md` 和 [`development-handoff.md`](development-handoff.md)。当前进度不写在本文；
玩家说明归 `README.md`；产品决定归 [`PRODUCT.md`](PRODUCT.md)；里程碑排期归
[`DEVPLAN.md`](DEVPLAN.md)。代码与用户最新明确决定高于文档，发现冲突时先按真实实现修正文档。

## 一分钟恢复上下文

- Drift Fox 是横屏 Three.js 街机雪原漂移游戏：北极狐自动全速奔跑，玩家按住 Shift 抓地漂移
  蓄寒气，满格穿越冰晶门脚本化飞跃裂谷。一局 5 个飞跃点，寒气不分档。
- `BoatInput`（沿用 board-race 命名）、60 Hz fixed-step、`FoxController` 唯一地面真值、
  渲染/碰撞/进度共享同一狐狸 world transform，是最重要的跨模块合同。
- 狐狸是 Blender 程序化蒙皮角色（`tools/blender/make_fox.py` → `fox.glb`，19 骨骼 +
  两层毛发壳），`fox.ts` 在渲染帧驱动骨骼姿态状态机（run/drift/leap/fall/idle）。
  **不允许退回 three.js 图元堆叠拼狐狸。**
- 远景是原画重打包的 360° 整球穹顶（`vista.ts`），**世界固定**，只跟随相机位置，
  永不随狐狸朝向旋转——转弯露贴图边曾是用户否决项。
- 本地修改、已推送、Actions 成功是不同状态。常规发布只负责构建、冒烟、提交和普通推送。

## 事实归属

| 事实 | 权威位置 |
| --- | --- |
| 玩家可见玩法与操作 | `README.md` |
| 产品决定（卖点/美术风格/不做清单） | `docs/PRODUCT.md` |
| 跨模块类型与输入合同 | `src/contracts.ts` |
| 狐狸地面物理与寒气/飞跃 | `src/game/foxController.ts` |
| 狐狸骨骼姿态状态机 | `src/game/fox.ts` |
| 赛道样条、裂谷地形、飞跃门 | `src/world/course.ts` |
| 雪原高度场（渲染/模拟同源） | `src/world/snowfield.ts` |
| 赛程生命周期（门/坠落/重生/通关） | `src/game/courseDirector.ts` |
| 调色板（唯一色源） | `src/core/palette.ts` |
| Blender 角色/道具生成 | `tools/blender/make_fox.py`、`make_gate.py` |
| 远景穹顶贴图打包 | `tools/make_vista_dome.py` |
| 当前任务进度与风险 | `docs/development-handoff.md` |

不要再维护一份重复正文的 knowledge map。摘要文档只指向 owner，不复制参数和当前状态。

## 核心玩法合同

1. 自动全速奔跑（`cruiseSpeed`），无油门键；转向只有 A/D。
2. 按住 Shift = 抓地漂移：yaw 权威提升、速度方向滞后于朝向（可读滑移角）、寒气按
   实际 carve 角速度积蓄；松开且漂移时长 ≥ `burstMin` 才结算蹬冰爆发。
3. 寒气满格（≥0.98）穿越冰晶门 = 脚本化抛物线飞跃裂谷；**不加飞行物理分支**。
   不足或偏门 = 坠落，扣回 0.6 寒气并由 director 回正重生。一局 5 门，全过即通关。
4. 动作边沿留在输入合同，物理只读 hold；`step()` 内不得有渲染帧依赖。
5. 移动端左区转向、右区漂移；竖屏只显示旋转提示，不跑游戏。

## 渲染与美术合同

- 美术风格锁定：LowPoly × toon/cel × 极光色彩剧本。不做真实毛发模拟、不做水彩、不做暗夜场景
  （夜晚管线仅为调色调试保留 `?tod=night`）。
- 所有颜色来自 `PALETTE`；Blender 资产只携带语义材质名（`fox_body` / `fox_shade` /
  `fox_dark` / `fox_fur_*` / `gold` / `energy_*` 等），由 `world/props.ts` 的
  `MATERIAL_MAP` 映射到 PALETTE + toon 材质。新增资产材质必须走同一约定。
- **狐狸网格**：单连通管状蒙皮网格 + 程序化骨架 + 手工逐环权重；爪子必须是腿管末端的
  渐收锥（深色小爪），**禁止方块"鞋子"**。剪影毛发靠 per-ring `spike`（沿管交错）+
  per-sector `jag`（环绕交错），环数要密到读作"毛"而不是"叠甲"。
- **两层毛发壳**：`fox_fur_1/2` 是底皮同拓扑外扩壳（+2.2cm / +3.8cm），共享骨骼权重，
  toon shader 按管状 UV 做发丝 alpha 裁剪（内层密、外层稀）。壳体必须带 glTF extras
  `noOutline` + `noInk`，不进描边 hull 和 ink 预通道。
- **远景**：`vista-dome.png` 由 `tools/make_vista_dome.py` 从原画重打包（天顶渐变 + 原画带 +
  地平雪雾），贴整球内面、MirroredRepeat ×3、世界固定；`aurora.ts` 三条帘 × 120° 环布。
  极光/穹顶只随相机平移，不随朝向旋转。
- 冰晶门等 `energy_*` 材质进 `LAYER_ENERGY` 泛光层；ink 预通道只渲染 `LAYER_INK`
  （`markInk` 遇到 `userData.noInk` 子树剪枝）。
- 固定步进中避免无界分配；爪痕/冷气用预分配池。视觉质量由桌面与 `844x390` 截图人工评审决定，
  draw call/帧时只证明性能，不证明"好看"。

## 资产管线合同

- `npm run build:assets` 跑全部 `tools/blender/make_*.py`（Blender headless，Blender 4.x）。
  角色/道具导出 GLB 到 `src/assets/models/`，glTF +Y up，`export_apply=True`，
  需要 extras 时显式 `export_extras=True`。
- 狐狸朝向约定：Blender 内 -Y 前进（导出后 = 游戏 +Z = heading 0），原点在体心正下方地面。
- `make_fox.py` 同时渲染三视角 turntable 到 `shots/fox-turntable-*.png`，改模型必须出图评审。
- 骨骼名（`pelvis/chest/neck/head/tail_1..3/f{l,r}_shoulder/forearm/paw/r{l,r}_thigh/shin/paw`）
  是 `fox.ts` 与 Blender 脚本之间的硬合同，改名必须两端同步。
- 管状环的截面材质规则：段 i 取**前向环** i+1 的材质（末端环的鼻尖/爪尖深色才能生效）；
  壳体开口端必须封盖（开口边会露出内壁黑圈）。

## 验证与发布

```bash
npm run build
npm run verify:smoke   # 桌面 + 844x390：启动、非空渲染、奔跑、漂移蓄寒、释放爆发、
                       # 爪痕、冷气、五门全飞跃、坠落重生、通关
npm run shot -- --pose closeup        # 狐狸特写（run）
npm run shot -- --pose closeup-drift  # 狐狸特写（漂移钉地）
npm run shot -- --pose turn           # 转弯中远景（检查穹顶无边界）
npm run shot -- --pose drift|leap     # 动作场景
```

`?harness=1` 暴露 `window.__harness`：`advance / drive / warpToGate / resetRun / view /
course / fox / stats`。harness 截图是确定性的（资产在 main.ts 顶层 await）。

发布：build + smoke 绿 → 人工评审双尺寸截图 → 提交推送。不等待远端状态比对。

## 任务交接

- 每个任务开始完整阅读 `AGENTS.md`、本文和 `development-handoff.md`。
- `development-handoff.md` 保持短小：活动目标、已完成、验证证据、遗留风险、下一步。
  新工作包覆盖旧流水账，不永久追加历史。
- 不运行的验证保持 pending；未推送不写成已发布；未人工审图不写"视觉已改善"。
