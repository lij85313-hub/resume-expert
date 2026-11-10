# 开发与数据说明

## 分析历史与长期记忆（本机单用户 MVP）

需要 **Node.js >= 22.13**（使用内置 `node:sqlite`）。已有启动窗口继续可用，命令行启动：

```sh
npm install
npm run dev:all
```

访问 http://127.0.0.1:5173 。初始分析成功后自动保存，深度优化及面试评价继续关联同一份记录。网页顶部新增「历史分析」「长期记忆」「新会话」。刷新后进入历史列表查看报告；保存失败时浏览器 IndexedDB 暂存报告，重新打开网页可恢复、重试。也可下载完整 JSON 报告备份。清理浏览器站点数据会移除尚未保存的暂存报告。

新简历沿用文本粘贴入口。在历史中选「作为新分析参考 / 对比基准」，填写新版内容、名称与版本并开始分析。报告下点击「分析版本变化」调用所配置模型，展示增删改、已解决/待核实问题、下一步建议及依据。对比不修改原评分：保留岗位适配分、岗位匹配分，以及 11 项文字维度评价。岗位、JD、模型或标准不同会提示可比性受限。当前版本仍不包含 PDF/Word 上传解析。

长期记忆页面仅保存用户主动确认的信息，可编辑、删除。新分析按岗位/行业相关性最多取 3 份历史记录，加有限条已确认画像，生成有长度限制的摘要；不会拼接全部历史对话。历史问题可标记「已修改」，这是用户自报状态，模型仍需根据当前原文判断。

### 数据结构与隐私

- `data/resume-expert.sqlite`：`analyses`（原始材料、完整报告、评分依据、名称、版本、时间、模型、标准）、`memories`（已确认画像）、`issues`（历史问题与用户修改状态）、`comparisons`（对比结果）、`deleted_records`（仅含记录 ID 和所有者的防重写标记）、`schema_versions`（迁移版本）。结构化报告保存在 JSON 列中；筛选字段独立存储。
- 数据库自动创建，事务写入；不会读取或迁移原有模型配置和成本日志，不覆盖旧数据。数据库及 WAL 文件已加入忽略规则。升级前建议关闭服务后备份整个 `data` 目录。
- 服务端所有者固定为 `local-owner`，客户端不能切换用户；仅监听本机，API 检查 Host、Origin 和跨站请求。**同一操作系统账户共用本地数据，不提供共享电脑账号隔离或公网多用户登录。**数据库使用本机文件权限保护，未加密，应使用个人系统账户和磁盘保护。
- 只有用户配置的模型服务会收到分析所需材料和有限历史摘要；没有接入新的第三方数据服务。日志不记录完整简历、模型原始输出或密钥。本次开发未写入任何 API Key。
- 删除分析会同时删除关联问题与比较结果，清理其他记录中的比较快照；防重写标记防止迟到的保存重试恢复已删除内容。画像是用户独立确认的数据，需在记忆页面单独删除。删除属于应用逻辑删除操作，不承诺磁盘取证级擦除；自己下载的报告备份需要自行删除。

### 开发与验收

```sh
npm test
npm run test:browser
npm run build
```

测试使用临时 SQLite 文件、虚构简历及模型替身，不消耗真实模型额度。浏览器测试默认使用本机 Edge；其他系统可在 `playwright.config.ts` 调整浏览器 channel。测试覆盖自动保存、报告恢复、SQLite 重开、历史检索、画像确认与删除、版本比较、记录级所有者隔离、保存失败暂存及幂等重试、删除后不能重写。`RESUME_DB_PATH` 可指定独立数据库路径。


### 本次实现文件

新增：`server/storage.ts`、`server/memory.ts`、`src/services/pendingSaves.ts`、`src/components/workflow/HistoryPanel.tsx`（包含画像管理）、`src/components/workflow/VersionComparison.tsx`、`playwright.config.ts`、`tests/fixtures.ts`、`tests/storage.test.ts`、`tests/api.test.ts`、`tests/browser/history.spec.ts`。

修改：`server/index.ts`（接口与自动保存）、`server/prompts.ts`（记忆约束及评价标准）、`server/aiClient.ts`（日志脱敏）、`src/App.tsx`（入口、恢复、重试与对比）、`src/services/api.ts`、`src/types/index.ts`、`package.json`、`package-lock.json`、`.gitignore` 和本说明。为减少改动，历史和记忆入口直接在 App 中接入，未重构现有布局与输入组件。

评价标准 `campus-evidence-v1`：岗位适配分表示可投递性，岗位匹配分表示 JD 证据覆盖；0–39 关键缺口，40–59 证据偏弱，60–79 基本覆盖，80–100 证据充分。评分由模型根据当前材料判断，必须附依据，不能视为客观录取概率。历史版本分数不自动重算。
