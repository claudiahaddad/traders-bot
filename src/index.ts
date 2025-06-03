import "dotenv/config";
import { Client, Conversation } from "@xmtp/node-sdk";
import { createSigner } from "./helpers/client.js";
import { log } from "./helpers/utils.js";
import { listenForMessages } from "./stream.js";
import { findOrCreateTradersGroup } from "./traders.js";

async function run() {
  const key = process.env.WALLET_KEY;
  if (!key) {
    log("[ERROR] WALLET_KEY is required");
    return;
  }

  log("[INFO] Starting XMTP client...");
  const signer = createSigner(key as `0x${string}`);
  const client = await Client.create(signer, {
    env: process.env.XMTP_ENV === "production" ? "production" : "dev",
  });

  const address = (await signer.getIdentifier()).identifier;
  log(
    `[INFO] XMTP client created. Inbox ID: ${client.inboxId}, Address: ${address}`
  );

  if (!client.isRegistered) {
    log("[INFO] Registering XMTP client...");
    await client.register();
    log("[INFO] XMTP client registered");
  } else {
    log("[INFO] XMTP client already registered");
  }

  // Create or get the traders group
  const tradersGroup = await findOrCreateTradersGroup(client);
  if (!tradersGroup) {
    log("[ERROR] Failed to create or find traders group");
    return;
  }

  // Start listening for messages
  await listenForMessages(client, tradersGroup);
}

run().catch((error) => {
  log(`Fatal error: ${error}`);
  process.exit(1);
});
