"use client";

import { useMemo, useState } from "react";
import {
  ConnectionProvider,
  WalletProvider,
  useConnection,
  useWallet,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider, WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-wallets";
import {
  clusterApiUrl,
  PublicKey,
  Transaction,
  type TransactionInstruction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";

type Recipient = {
  line: number;
  address: string;
  amountText: string;
  amount: number;
  valid: boolean;
  error?: string;
};

type SolanaBatchContentProps = {
  network: WalletAdapterNetwork;
  onNetworkChange: (network: WalletAdapterNetwork) => void;
};

type PendingExecution = {
  clientRequestId: string;
  fingerprint: string;
  mint: string;
  decimalsNumber: number;
};

const SOLANA_ADDRESS_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const AMOUNT_REGEX = /^\d+(\.\d+)?$/;
const MAX_SINGLE_AMOUNT = 1000;
const MAX_TOTAL_AMOUNT = 10000;
const MAX_RECIPIENTS = 200;

function generateClientRequestId() {
  const withCrypto = globalThis.crypto?.randomUUID?.();
  if (withCrypto) return withCrypto;
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function decimalToBigInt(amountText: string, decimals: number): bigint | null {
  if (!AMOUNT_REGEX.test(amountText)) return null;
  const [intPart, fracPart = ""] = amountText.split(".");
  if (fracPart.length > decimals) return null;
  const normalized = `${intPart}${fracPart.padEnd(decimals, "0")}`.replace(/^0+/, "") || "0";
  return BigInt(normalized);
}

function parseRecipients(raw: string): Recipient[] {
  const parsed = raw
    .split("\n")
    .map((lineText, index) => ({ lineText: lineText.trim(), line: index + 1 }))
    .filter((item) => item.lineText.length > 0)
    .map(({ lineText, line }) => {
      const parts = lineText.split(",").map((part) => part.trim());
      if (parts.length !== 2) {
        return {
          line,
          address: "",
          amountText: "",
          amount: 0,
          valid: false,
          error: "行格式错误，请使用 address,amount",
        };
      }

      const [address, amountText] = parts;
      const amount = Number(amountText);

      if (!SOLANA_ADDRESS_REGEX.test(address)) {
        return {
          line,
          address,
          amountText,
          amount,
          valid: false,
          error: "地址格式无效",
        };
      }

      if (!AMOUNT_REGEX.test(amountText) || !Number.isFinite(amount) || amount <= 0) {
        return {
          line,
          address,
          amountText,
          amount,
          valid: false,
          error: "金额必须为正数",
        };
      }

      return {
        line,
        address,
        amountText,
        amount,
        valid: true,
      };
    });

  const transferCount = parsed.reduce<Record<string, number>>((acc, item) => {
    if (item.valid) {
      const key = `${item.address}::${item.amountText}`;
      acc[key] = (acc[key] || 0) + 1;
    }
    return acc;
  }, {});

  return parsed.map((item) => {
    if (item.valid && transferCount[`${item.address}::${item.amountText}`] > 1) {
      return { ...item, valid: false, error: "重复发送项（同地址同金额）" };
    }
    return item;
  });
}

function SolanaBatchContent({ network, onNetworkChange }: SolanaBatchContentProps) {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();

  const [mint, setMint] = useState("");
  const [decimals, setDecimals] = useState("9");
  const [rawList, setRawList] = useState("");
  const [ackRisk, setAckRisk] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [resultText, setResultText] = useState("");
  const [pendingExecution, setPendingExecution] = useState<PendingExecution | null>(null);
  const [lastSubmittedFingerprint, setLastSubmittedFingerprint] = useState<string | null>(null);

  const recipients = useMemo(() => parseRecipients(rawList), [rawList]);

  const stats = useMemo(() => {
    const validItems = recipients.filter((item) => item.valid);
    const invalidItems = recipients.filter((item) => !item.valid);
    const totalAmount = validItems.reduce((sum, item) => sum + item.amount, 0);

    return {
      count: recipients.length,
      validCount: validItems.length,
      invalidCount: invalidItems.length,
      totalAmount,
      validItems,
    };
  }, [recipients]);

  const validateBeforeSubmit = () => {
    if (!publicKey) return "请先连接钱包后再执行。";
    if (!ackRisk) return "请先勾选风险确认：当前操作会发起真实链上转账。";
    if (!mint.trim()) return "请先填写 mint 地址。";
    if (!SOLANA_ADDRESS_REGEX.test(mint.trim())) return "mint 地址格式无效。";

    const decimalsNumber = Number(decimals);
    if (!Number.isInteger(decimalsNumber) || decimalsNumber < 0 || decimalsNumber > 18) {
      return "小数位需为 0-18 的整数。";
    }

    if (stats.validCount === 0) return "没有可执行的有效收款条目。";
    if (stats.invalidCount > 0) return "存在无效或重复条目，请修正后再执行。";

    if (stats.count > MAX_RECIPIENTS) {
      return `超出总笔数上限（${MAX_RECIPIENTS}）。`;
    }

    if (stats.totalAmount > MAX_TOTAL_AMOUNT) {
      return `超出总金额上限（${MAX_TOTAL_AMOUNT}）。`;
    }

    const overSingle = stats.validItems.find((item) => item.amount > MAX_SINGLE_AMOUNT);
    if (overSingle) {
      return `第 ${overSingle.line} 行超出单笔上限（${MAX_SINGLE_AMOUNT}）。`;
    }

    return null;
  };

  const buildFingerprint = (decimalsNumber: number) => {
    const body = stats.validItems
      .map((item) => `${item.address}:${item.amountText}`)
      .sort()
      .join("|");
    return `${network}|${mint.trim()}|${decimalsNumber}|${body}`;
  };

  const onClickExecute = () => {
    const validationError = validateBeforeSubmit();
    if (validationError) {
      setResultText(validationError);
      return;
    }

    const decimalsNumber = Number(decimals);
    const fingerprint = buildFingerprint(decimalsNumber);

    if (executing || lastSubmittedFingerprint === fingerprint) {
      setResultText("已拦截重复提交：该批次已提交过，请检查执行结果。");
      return;
    }

    setPendingExecution({
      clientRequestId: generateClientRequestId(),
      fingerprint,
      mint: mint.trim(),
      decimalsNumber,
    });
  };

  const onConfirmExecute = async () => {
    if (!pendingExecution) return;
    if (!publicKey) {
      setResultText("钱包未连接，无法执行。");
      setPendingExecution(null);
      return;
    }

    if (executing) {
      setResultText("执行中，请勿重复提交。");
      return;
    }

    const idempotencyKey = `solana-batch:${pendingExecution.clientRequestId}`;
    if (sessionStorage.getItem(idempotencyKey)) {
      setResultText(`幂等拦截：请求 ${pendingExecution.clientRequestId} 已执行过。`);
      setPendingExecution(null);
      return;
    }

    setExecuting(true);
    setResultText(`链上执行中，请保持钱包可用...\nclient_request_id: ${pendingExecution.clientRequestId}`);

    try {
      const mintKey = new PublicKey(pendingExecution.mint);
      const results: Array<{ line: number; address: string; signature?: string; error?: string }> = [];
      const blockhash = await connection.getLatestBlockhash();

      for (const recipient of stats.validItems) {
        try {
          const amount = decimalToBigInt(recipient.amountText, pendingExecution.decimalsNumber);
          if (amount === null || amount <= BigInt(0)) {
            throw new Error("金额精度超出小数位限制");
          }

          const receiver = new PublicKey(recipient.address);
          const fromTokenAccount = await getAssociatedTokenAddress(mintKey, publicKey);
          const toTokenAccount = await getAssociatedTokenAddress(mintKey, receiver);

          const instructions: TransactionInstruction[] = [];
          const toAccountInfo = await connection.getAccountInfo(toTokenAccount);
          if (!toAccountInfo) {
            instructions.push(
              createAssociatedTokenAccountInstruction(publicKey, toTokenAccount, receiver, mintKey)
            );
          }

          instructions.push(createTransferInstruction(fromTokenAccount, toTokenAccount, publicKey, amount));

          const transaction = new Transaction().add(...instructions);
          transaction.feePayer = publicKey;
          transaction.recentBlockhash = blockhash.blockhash;

          const signature = await sendTransaction(transaction, connection);
          await connection.confirmTransaction({ signature, ...blockhash }, "confirmed");
          results.push({ line: recipient.line, address: recipient.address, signature });
        } catch (error) {
          results.push({
            line: recipient.line,
            address: recipient.address,
            error: error instanceof Error ? error.message : "发送失败",
          });
        }
      }

      const success = results.filter((item) => item.signature);
      const failed = results.filter((item) => item.error);
      sessionStorage.setItem(idempotencyKey, JSON.stringify(results));
      setLastSubmittedFingerprint(pendingExecution.fingerprint);

      const lines = [
        `执行完成：成功 ${success.length} 笔，失败 ${failed.length} 笔。`,
        `client_request_id: ${pendingExecution.clientRequestId}`,
        success.length
          ? `成功签名：\n${success.map((item) => `${item.line}. ${item.signature}`).join("\n")}`
          : "无成功签名。",
        failed.length
          ? `失败原因：\n${failed.map((item) => `${item.line}. ${item.address} - ${item.error}`).join("\n")}`
          : "无失败记录。",
      ];

      setResultText(lines.join("\n\n"));
    } finally {
      setExecuting(false);
      setPendingExecution(null);
    }
  };

  const previewAddresses = stats.validItems.map((item) => item.address);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.9),_rgba(236,244,255,0.6)_40%,_rgba(255,223,246,0.55)_80%)] px-4 py-10 text-slate-900 dark:bg-[radial-gradient(circle_at_top,_rgba(30,33,46,0.95),_rgba(8,10,20,1)_55%)] dark:text-slate-100 sm:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <a
          href="/"
          className="inline-flex w-fit items-center gap-2 rounded-full bg-white/80 px-4 py-2 text-sm font-semibold text-indigo-700 shadow-sm transition hover:-translate-y-0.5 dark:bg-white/10 dark:text-indigo-200"
        >
          ← 返回导航首页
        </a>

        <header className="clay-surface dark:clay-card-dark rounded-[28px] px-6 py-8 sm:px-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold sm:text-3xl">Solana 代币批量分发</h1>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 sm:text-base">
                粘贴 <code>address,amount</code> 列表，完成校验与真实链上转账（支持 SPL Token）。
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <span className="text-xs text-slate-500 dark:text-slate-300">连接钱包</span>
              <WalletMultiButton className="!rounded-2xl !bg-indigo-500 !text-sm !font-semibold" />
            </div>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="clay-card dark:clay-card-dark rounded-[24px] p-5 sm:p-6">
            <h2 className="text-lg font-semibold">输入区</h2>
            <div className="mt-4 grid gap-4">
              <label className="grid gap-2 text-sm">
                <span className="font-medium">网络选择</span>
                <select
                  className="rounded-2xl border border-white/60 bg-white/80 px-4 py-3 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-300/60 dark:border-white/15 dark:bg-slate-900/40"
                  value={network}
                  onChange={(event) => onNetworkChange(event.target.value as WalletAdapterNetwork)}
                >
                  <option value={WalletAdapterNetwork.Devnet}>Devnet (默认)</option>
                  <option value={WalletAdapterNetwork.Mainnet}>Mainnet</option>
                </select>
              </label>

              <label className="grid gap-2 text-sm">
                <span className="font-medium">Mint 地址</span>
                <input
                  value={mint}
                  onChange={(event) => setMint(event.target.value)}
                  placeholder="输入 Solana mint 地址"
                  className="rounded-2xl border border-white/60 bg-white/80 px-4 py-3 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-300/60 dark:border-white/15 dark:bg-slate-900/40"
                />
              </label>

              <label className="grid gap-2 text-sm">
                <span className="font-medium">小数位</span>
                <input
                  value={decimals}
                  onChange={(event) => setDecimals(event.target.value)}
                  placeholder="9"
                  className="rounded-2xl border border-white/60 bg-white/80 px-4 py-3 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-300/60 dark:border-white/15 dark:bg-slate-900/40"
                />
              </label>

              <label className="grid gap-2 text-sm">
                <span className="font-medium">收款列表（每行一个）</span>
                <textarea
                  value={rawList}
                  onChange={(event) => setRawList(event.target.value)}
                  placeholder={"7Yh...abc,1.25\n9Qp...xyz,2"}
                  rows={10}
                  className="rounded-2xl border border-white/60 bg-white/80 px-4 py-3 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-300/60 dark:border-white/15 dark:bg-slate-900/40"
                />
              </label>
            </div>
          </div>

          <div className="clay-card dark:clay-card-dark rounded-[24px] p-5 sm:p-6">
            <h2 className="text-lg font-semibold">预览区</h2>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-2xl bg-white/75 p-3 dark:bg-white/10">总条数：{stats.count}</div>
              <div className="rounded-2xl bg-white/75 p-3 dark:bg-white/10">有效：{stats.validCount}</div>
              <div className="rounded-2xl bg-white/75 p-3 dark:bg-white/10">错误：{stats.invalidCount}</div>
              <div className="rounded-2xl bg-white/75 p-3 dark:bg-white/10">总额：{stats.totalAmount.toFixed(6)}</div>
            </div>

            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/90 p-3 text-xs text-amber-800 dark:border-amber-300/30 dark:bg-amber-300/10 dark:text-amber-200">
              <p>风险提醒：该操作将发起真实链上转账，请确认钱包余额与网络环境。</p>
              <p className="mt-1">上限控制：单笔 ≤ {MAX_SINGLE_AMOUNT}，总额 ≤ {MAX_TOTAL_AMOUNT}，总笔数 ≤ {MAX_RECIPIENTS}</p>
            </div>

            <label className="mt-4 flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={ackRisk}
                onChange={(event) => setAckRisk(event.target.checked)}
                className="mt-1 h-4 w-4 accent-indigo-600"
              />
              <span>我已确认：当前操作会发生真实资产转移，风险自担。</span>
            </label>

            <button
              type="button"
              onClick={onClickExecute}
              disabled={executing}
              className="mt-4 w-full rounded-2xl bg-gradient-to-r from-pink-400 to-indigo-400 px-4 py-3 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(124,133,255,0.4)] transition hover:-translate-y-0.5 hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {executing ? "执行中..." : "开始链上执行"}
            </button>

            <pre className="mt-4 whitespace-pre-wrap rounded-2xl bg-slate-900 p-3 text-xs text-slate-100">
              {resultText || "执行结果会显示在这里。"}
            </pre>
          </div>
        </section>

        <section className="clay-card dark:clay-card-dark rounded-[24px] p-5 sm:p-6">
          <h2 className="text-lg font-semibold">收款列表校验结果</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-slate-600 dark:text-slate-300">
                  <th className="px-2 py-2">行</th>
                  <th className="px-2 py-2">地址</th>
                  <th className="px-2 py-2">金额</th>
                  <th className="px-2 py-2">状态</th>
                </tr>
              </thead>
              <tbody>
                {recipients.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-2 py-4 text-slate-500 dark:text-slate-400">
                      暂无数据，先在上方粘贴收款清单。
                    </td>
                  </tr>
                ) : (
                  recipients.map((item) => (
                    <tr key={`${item.line}-${item.address}-${item.amountText}`} className="border-t border-white/40 dark:border-white/10">
                      <td className="px-2 py-2">{item.line}</td>
                      <td className="px-2 py-2 break-all">{item.address || "-"}</td>
                      <td className="px-2 py-2">{Number.isFinite(item.amount) ? item.amount : "-"}</td>
                      <td className="px-2 py-2">
                        {item.valid ? (
                          <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200">有效</span>
                        ) : (
                          <span className="rounded-full bg-rose-100 px-2 py-1 text-xs text-rose-700 dark:bg-rose-500/20 dark:text-rose-200">{item.error || "无效"}</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {pendingExecution && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 text-slate-900 shadow-2xl dark:bg-slate-900 dark:text-slate-100">
            <h3 className="text-lg font-semibold">二次确认</h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">请核对本次转账摘要，确认后再提交。</p>
            <div className="mt-4 space-y-2 text-sm">
              <p>网络：{network}</p>
              <p>Mint：{pendingExecution.mint}</p>
              <p>总笔数：{stats.validCount}</p>
              <p>总金额：{stats.totalAmount.toFixed(6)}</p>
              <p>请求ID：{pendingExecution.clientRequestId}</p>
              <p>地址预览：{previewAddresses.slice(0, 3).join(", ")}{previewAddresses.length > 3 ? " ... " : ""}{previewAddresses.slice(-3).join(", ")}</p>
            </div>
            <p className="mt-4 rounded-xl bg-amber-100 p-3 text-xs text-amber-800 dark:bg-amber-500/20 dark:text-amber-200">警告：发送后不可撤销，请确认网络、Mint 与金额完全正确。</p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setPendingExecution(null)}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                取消
              </button>
              <button
                type="button"
                onClick={onConfirmExecute}
                className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-600"
              >
                确认提交
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SolanaBatchPage() {
  const [network, setNetwork] = useState<WalletAdapterNetwork>(WalletAdapterNetwork.Devnet);
  const endpoint = useMemo(() => clusterApiUrl(network), [network]);
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <SolanaBatchContent network={network} onNetworkChange={setNetwork} />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
