# TOOLBOX Nav

粘土风格的 Web3 工具导航站（claymorphism + dark mode）。

## 功能

- Web3 工具导航入口（钱包创建、批量分发、合约工具）
- 新增 `Solana 批量分发` 页面（真实转账 MVP）：
  - 接入 Solana 钱包（Wallet Adapter，默认支持 Phantom）
  - 支持网络选择（devnet / mainnet，默认 devnet）
  - 支持 SPL Token 批量发送（输入 mint + decimals）
  - 地址/金额/重复发送项校验与汇总预览
  - 幂等键 `client_request_id`（会话内重复请求拦截）
  - 二次确认弹窗（网络/mint/笔数/总额/地址摘要）
  - 上限控制（单笔、总额、总笔数）
  - 执行后返回交易签名与失败原因

## 开发

```bash
npm install
npm run dev
```

## 构建

```bash
npm run build
```

## 部署

推荐使用 Vercel：

```bash
npx vercel --prod
```
