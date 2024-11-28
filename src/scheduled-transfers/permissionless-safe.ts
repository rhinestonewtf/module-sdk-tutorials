import {
  RHINESTONE_ATTESTER_ADDRESS,
  MOCK_ATTESTER_ADDRESS,
  getScheduledTransferData,
  getScheduledTransfersExecutor,
  getExecuteScheduledTransferAction,
  OWNABLE_VALIDATOR_ADDRESS,
  getOwnableValidator,
  encode1271Signature,
  getAccount,
  encode1271Hash,
  getSmartSessionsValidator,
  Session,
  encodeValidationData,
  SCHEDULED_TRANSFERS_EXECUTOR_ADDRESS,
  getSudoPolicy,
  SMART_SESSIONS_ADDRESS,
  getPermissionId,
} from "@rhinestone/module-sdk";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  Address,
  Chain,
  createPublicClient,
  encodeFunctionData,
  http,
  parseAbi,
  toBytes,
  toFunctionSelector,
  toHex,
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
    owners: [owner.address],
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
    safe4337ModuleAddress: "0x7579EE8307284F293B1927136486880611F20002",
    erc7579LaunchpadAddress: "0x7579011aB74c46090561ea277Ba79D510c6C00ff",
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

  const session: Session = {
    sessionValidator: OWNABLE_VALIDATOR_ADDRESS,
    sessionValidatorInitData: encodeValidationData({
      threshold: 1,
      owners: ["0x2DC2fb2f4F11DeE1d6a2054ffCBf102D09b62bE2"],
    }),
    salt: toHex(toBytes("0", { size: 32 })),
    userOpPolicies: [],
    erc7739Policies: {
      allowedERC7739Content: [],
      erc1271Policies: [],
    },
    actions: [
      {
        actionTarget: SCHEDULED_TRANSFERS_EXECUTOR_ADDRESS,
        actionTargetSelector: toFunctionSelector("executeOrder(uint256 jobId)"),
        // todo: use universal action policy
        actionPolicies: [getSudoPolicy()],
      },
    ],
    chainId: BigInt(chain.id),
  };

  const smartSessions = getSmartSessionsValidator({
    sessions: [session],
  });

  const opHash2 = await smartAccountClient.installModule(smartSessions);

  await pimlicoClient.waitForUserOperationReceipt({
    hash: opHash2,
  });

  const executeInterval = 60; // in seconds
  const numberOfExecutions = 2;
  const startDate = Date.now(); // UNIX timestamp

  const scheduledTransfer = {
    startDate: startDate,
    repeatEvery: executeInterval,
    numberOfRepeats: numberOfExecutions,
    token: {
      token_address: "0x8034e69FAFEd6588cc36ff3400AFE5c049a3B92E" as Address, // Mock USDC
      decimals: 6,
    },
    amount: 1,
    recipient: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" as Address,
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

  // todo: get jobId
  const jobId = 0;

  await pimlicoClient.waitForUserOperationReceipt({
    hash: opHash,
  });

  await smartAccountClient.sendTransaction({
    to: scheduledTransfer.token.token_address,
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
    accountInitCode: "0x", // since the account is already deployed
    network: 11155111,
    validator: SMART_SESSIONS_ADDRESS,
  });

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
      // todo: fix this type issue
      permissionId: getPermissionId({
        session,
      }),
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
