# toolbox-nav

粘土风格 Web3 工具导航站（Next.js），包含 Solana 批量分发页面（MVP）。

## 线上地址

- Production: `https://toolbox-nav.vercel.app`

## 导航入口

- 创建钱包：`https://mct.xyz/create-wallet?chain=evm`
- BTC 批量发送：`https://wizz.cash/btc/send`
- Token 批量发送：`https://batchsender.tptool.pro/#/`
- Disperse：`https://disperse.app/`
- 合约工具：`https://ct.app/dashboard`
- 内部页面：`/solana-batch`

## Solana 批量分发（MVP）

- 钱包接入：Wallet Adapter（Phantom）
- 网络切换：devnet / mainnet（默认 devnet）
- SPL Token 发送：输入 mint + decimals + `address,amount` 列表
- 校验：地址、金额、重复项
- 安全交互：
  - 幂等键 `client_request_id`
  - 重复提交拦截
  - 二次确认弹窗
  - 单笔/总额/总笔数上限控制
- 执行结果：返回签名与失败原因

## 本地开发

```bash
npm install
npm run dev
```

## 构建

```bash
npm run build
```

## 部署

```bash
npx vercel --prod
```
