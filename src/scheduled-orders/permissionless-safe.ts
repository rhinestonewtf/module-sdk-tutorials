import {
  RHINESTONE_ATTESTER_ADDRESS,
  MOCK_ATTESTER_ADDRESS,
  OWNABLE_VALIDATOR_ADDRESS,
  getOwnableValidator,
  encode1271Signature,
  getAccount,
  encode1271Hash,
  getScheduledOrdersExecutor,
  getSwapOrderData,
  getExecuteScheduledOrderAction,
} from "@rhinestone/module-sdk";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  Address,
  Chain,
  createPublicClient,
  encodeFunctionData,
  http,
  parseAbi,
} from "viem";
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
  automationsApiKey,
}: {
  bundlerUrl: string;
  rpcUrl: string;
  paymasterUrl: string;
  chain: Chain;
  automationsApiKey: string;
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

  const ownableValidator = getOwnableValidator({
    owners: ["0x2DC2fb2f4F11DeE1d6a2054ffCBf102D09b62bE2", owner.address],
    threshold: 1,
  });

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
    validators: [
      {
        address: ownableValidator.address,
        context: ownableValidator.initData,
      },
    ],
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

  const executeInterval = 60; // in seconds
  const numberOfExecutions = 2;
  const startDate = Date.now(); // UNIX timestamp

  const recurringOrder = {
    startDate: startDate,
    repeatEvery: executeInterval,
    numberOfRepeats: numberOfExecutions,
    buyToken: {
      token_address: "0x8034e69FAFEd6588cc36ff3400AFE5c049a3B92E" as Address, // Mock USDC
      decimals: 6,
    },
    sellToken: {
      token_address: "0x3520ef0E951125dEfA8476946d6D3153fd07b346" as Address, // Mock USDT
      decimals: 6,
    },
    amount: 1,
    orderType: "buy" as const,
  };

  const executionData = getSwapOrderData({
    recurringOrder,
  });

  const scheduledOrders = getScheduledOrdersExecutor({
    chainId: chain.id,
    executeInterval,
    numberOfExecutions,
    startDate,
    executionData,
  });

  const opHash = await smartAccountClient.installModule(scheduledOrders);

  // todo: get jobId
  const jobId = 0;

  await pimlicoClient.waitForUserOperationReceipt({
    hash: opHash,
  });

  await smartAccountClient.sendTransaction({
    to: recurringOrder.sellToken.token_address,
    data: encodeFunctionData({
      abi: parseAbi(["function mint(address to, uint256 amount) external"]),
      functionName: "mint",
      args: [safeAccount.address, BigInt(10)],
    }),
  });

  const automationClient = createAutomationClient({
    account: safeAccount.address,
    accountType: "SAFE",
    apiKey: automationsApiKey,
    accountInitCode: "0x",
    network: 11155111,
    validator: OWNABLE_VALIDATOR_ADDRESS,
  });

  const executeScheduledOrderAction = getExecuteScheduledOrderAction({
    jobId: jobId,
  });

  const actions = [
    {
      type: "static" as const,
      target: executeScheduledOrderAction.target,
      value: Number(executeScheduledOrderAction.value),
      callData: executeScheduledOrderAction.callData,
    },
  ];

  const triggerData = {
    cronExpression: "* * * * *",
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

  const account = getAccount({
    address: safeAccount.address,
    type: "safe",
  });

  const formattedHash = encode1271Hash({
    account,
    validator: OWNABLE_VALIDATOR_ADDRESS,
    chainId: chain.id,
    hash: automation.hash,
  });

  const signature = await owner.signMessage({
    message: { raw: formattedHash },
  });

  const formattedSignature = encode1271Signature({
    account,
    validator: OWNABLE_VALIDATOR_ADDRESS,
    signature,
  });

  await automationClient.signAutomation({
    automationId: automation.id,
    signature: formattedSignature,
  });

  // wait for 10 seconds
  await new Promise((resolve) => setTimeout(resolve, 10000));

  const automationLogs = await automationClient.getAutomationLogs(
    automation.id,
  );

  return automationLogs;
}
