# Drift Fox Working Notes

Drift Fox 是 board-race 资料片「雪地：北极狐」的独立新项目：LowPoly 北极狐在雪原贴地漂移、蓄寒气、飞跃裂谷。

## Required Context

- 每个任务先读本文件、`docs/PRODUCT.md`（产品合同）与 `docs/DEVPLAN.md`（当前开发计划与唯一下一步）。
- `PRODUCT.md` 只随产品决策变更；`DEVPLAN.md` 每里程碑更新进度与下一步。

## Commands

- `npm run dev` / `npm run build` / `npm run verify:smoke`（与 board-race 同构）。

## Non-Negotiable Contracts

- 保留统一输入合同与 60 Hz 固定步模拟；动作边沿与物理保持分离。
- 自动奔跑 + Shift 抓地漂移 + 满格寒气飞跃的循环不改写。
- 一局 5 个飞跃点，寒气不分档。
- 美术风格锁定「街机雪原」：LowPoly × toon/cel × 极光色彩剧本；不做毛发、不做水彩质感。
- 支持桌面与 844x390 横屏手机；竖屏为旋转提示。
- 渲染、碰撞、进度共享同一狐狸世界变换。

## Delivery

- 每个里程碑结束：`build + verify:smoke` 全绿 + 桌面/844x390 截图人工评审。
- 提交前做轻量预检（只审本次 diff，不扩大审计）。
- 完成的工作正常提交推送，除非用户要求先本地评审。
