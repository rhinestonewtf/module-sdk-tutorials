import {
  RHINESTONE_ATTESTER_ADDRESS,
  MOCK_ATTESTER_ADDRESS,
  getScheduledTransferData,
  getScheduledTransfersExecutor,
  getExecuteScheduledTransferAction,
  OWNABLE_VALIDATOR_ADDRESS,
} from "@rhinestone/module-sdk";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { Address, createPublicClient, http } from "viem";
import { createSmartAccountClient } from "permissionless";
import { erc7579Actions } from "permissionless/actions/erc7579";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import {
  createPaymasterClient,
  entryPoint07Address,
} from "viem/account-abstraction";
import { toSafeSmartAccount } from "permissionless/accounts";
import { createAutomationClient } from "@rhinestone/automations-sdk";

export default async function main({
  bundlerUrl,
  rpcUrl,
  paymasterUrl,
  chain,
}: {
  bundlerUrl: string;
  rpcUrl: string;
  paymasterUrl: string;
  chain: any;
}) {
  const publicClient = createPublicClient({
    transport: http(rpcUrl),
    chain: chain,
  });

  const pimlicoClient = createPimlicoClient({
    transport: http(bundlerUrl),
    entryPoint: {
      address: entryPoint07Address,
      version: "0.7",
    },
  });

  const paymasterClient = createPaymasterClient({
    transport: http(paymasterUrl),
  });

  const owner = privateKeyToAccount(generatePrivateKey());

  const safeAccount = await toSafeSmartAccount({
    client: publicClient,
    owners: [owner],
    version: "1.4.1",
    entryPoint: {
      address: entryPoint07Address,
      version: "0.7",
    },
    // safe4337ModuleAddress: "0x7579F9feedf32331C645828139aFF78d517d0001",
    // erc7579LaunchpadAddress: "0x7579011aB74c46090561ea277Ba79D510c6C00ff",
    safe4337ModuleAddress: "0x3Fdb5BC686e861480ef99A6E3FaAe03c0b9F32e2", // These are not meant to be used in production as of now.
    erc7579LaunchpadAddress: "0xEBe001b3D534B9B6E2500FB78E67a1A137f561CE",
    attesters: [
      RHINESTONE_ATTESTER_ADDRESS, // Rhinestone Attester
      MOCK_ATTESTER_ADDRESS, // Mock Attester - do not use in production
    ],
    attestersThreshold: 1,
  });

  const smartAccountClient = createSmartAccountClient({
    account: safeAccount,
    chain: chain,
    bundlerTransport: http(bundlerUrl),
    paymaster: paymasterClient,
    userOperation: {
      estimateFeesPerGas: async () => {
        return (await pimlicoClient.getUserOperationGasPrice()).fast;
      },
    },
  }).extend(erc7579Actions());

  const executeInterval = 60 * 60 * 24; // 1 day
  const numberOfExecutions = 10;
  const startDate = 1710759572; // UNIX timestamp

  const scheduledTransfer = {
    startDate: startDate,
    repeatEvery: executeInterval,
    numberOfRepeats: numberOfExecutions,
    token: {
      token_address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48" as Address, // USDC
      decimals: 6,
    },
    amount: 10,
    recipient: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48" as Address,
  };

  const executionData = getScheduledTransferData({
    scheduledTransfer,
  });

  const scheduledTransfers = getScheduledTransfersExecutor({
    executeInterval,
    numberOfExecutions,
    startDate,
    executionData,
  });

  const opHash = await smartAccountClient.installModule(scheduledTransfers);

  await pimlicoClient.waitForUserOperationReceipt({
    hash: opHash,
  });

  const automationClient = createAutomationClient({
    account: "0x...",
    accountType: "SAFE", // 'SAFE', 'KERNEL',
    apiKey: "YOUR_API_KEY",
    accountInitCode: "0x",
    network: 11155111,
    validator: OWNABLE_VALIDATOR_ADDRESS,
  });

  const jobId = 0;

  const executeScheduledTranferAction = getExecuteScheduledTransferAction({
    jobId: jobId,
  });

  const actions = [
    {
      type: "static" as const,
      target: executeScheduledTranferAction.target,
      value: Number(executeScheduledTranferAction.value),
      callData: executeScheduledTranferAction.callData,
    },
  ];

  const triggerData = {
    cronExpression: "*/0 0 * * *",
    startDate: startDate,
  };

  const automation = await automationClient.createAutomation({
    type: "time-based",
    data: {
      trigger: {
        triggerData,
      },
      actions,
      maxNumberOfExecutions: numberOfExecutions,
    },
  });

  const hash = await smartAccountClient.signMessage({
    message: { raw: automation.hash },
  });

  const signature = "0x";

  const response = await automationClient.signAutomation({
    automationId: automation.id,
    signature: signature,
  });

  const automationLogs = await automationClient.getAutomationLogs(
    automation.id,
  );
}
