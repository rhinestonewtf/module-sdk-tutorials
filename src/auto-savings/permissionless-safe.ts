import {
  RHINESTONE_ATTESTER_ADDRESS,
  MOCK_ATTESTER_ADDRESS,
  OWNABLE_VALIDATOR_ADDRESS,
  getOwnableValidator,
  encode1271Signature,
  getAccount,
  encode1271Hash,
  getAutoSavingsExecutor,
  AUTO_SAVINGS_ADDRESS,
} from "@rhinestone/module-sdk";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  Address,
  Chain,
  createPublicClient,
  encodeFunctionData,
  http,
  parseAbi,
  toFunctionSelector,
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

  const config = {
    token: "0x8034e69FAFEd6588cc36ff3400AFE5c049a3B92E" as Address, // Mock USDC
    percentage: BigInt(1),
    vault: "0xd921f0dF3B56899F26F658809aaa161cdfC2359F" as Address, // WETH Vault
  };

  const autoSavings = getAutoSavingsExecutor({
    chainId: chain.id,
    configs: [config],
  });

  const opHash = await smartAccountClient.installModule(autoSavings);

  await pimlicoClient.waitForUserOperationReceipt({
    hash: opHash,
  });

  const automationClient = createAutomationClient({
    account: safeAccount.address,
    accountType: "SAFE",
    apiKey: automationsApiKey,
    accountInitCode: "0x",
    network: 11155111,
    validator: OWNABLE_VALIDATOR_ADDRESS,
  });

  const actions = [
    {
      type: "dynamic" as const,
      target: AUTO_SAVINGS_ADDRESS,
      value: 0,
      callDataBuilderUrl:
        "https://calldata-builder-example.vercel.app/auto-savings/",
      functionSelector: toFunctionSelector(
        "autoSave(address token,uint256 amountReceived,uint160 sqrtPriceLimitX96,uint256 amountOutMinimum,uint24 fee)",
      ),
    },
  ];

  const automation = await automationClient.createAutomation({
    type: "event-based",
    data: {
      trigger: {
        triggerData: {
          query: "",
        },
      },
      actions,
      maxNumberOfExecutions: 10,
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

  // todo: send token
  await smartAccountClient.sendTransaction({
    to: config.token,
    data: encodeFunctionData({
      abi: parseAbi(["function mint(address to, uint256 amount) external"]),
      functionName: "mint",
      args: [safeAccount.address, BigInt(10)],
    }),
  });

  const automationLogs = await automationClient.getAutomationLogs(
    automation.id,
  );

  return automationLogs;
}
