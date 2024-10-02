import { createBundlerClient } from "viem/account-abstraction";
import { http } from "viem";
import { foundry } from "viem/chains";

export const ensureBundlerIsReady = async ({
  bundlerUrl,
}: {
  bundlerUrl: string;
}) => {
  const bundlerClient = createBundlerClient({
    chain: foundry,
    transport: http(bundlerUrl),
  });

  while (true) {
    try {
      await bundlerClient.getChainId();
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
};

export const ensurePaymasterIsReady = async ({
  paymasterUrl,
}: {
  paymasterUrl: string;
}) => {
  while (true) {
    try {
      // mock paymaster will open up this endpoint when ready
      const res = await fetch(`${paymasterUrl}/ping`);
      const data = await res.json();
      if (data.message !== "pong") {
        throw new Error("paymaster not ready yet");
      }

      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
};
