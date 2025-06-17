import { Client, DecodedMessage, Group } from "@xmtp/node-sdk";
import { isSameString, log } from "./helpers/utils.js";

// --- Retry Logic Constants and Helper ---
const MAX_RETRIES = 6; // Max number of retry attempts
const RETRY_DELAY_MS = 10000; // Delay between retries in milliseconds (10 seconds)

// Helper function to pause execution
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
// --- End of Retry Logic ---

export async function listenForMessages(client: Client, tradersGroup: Group<any>) {
    let retryCount = 0;

    // Outer loop for retry mechanism
    while (retryCount < MAX_RETRIES) {
      try {
        log(
          `Starting message stream... (Attempt ${retryCount + 1}/${MAX_RETRIES})`
        );
        // Initialize the stream within the try block
        const stream = await client.conversations.streamAllMessages();
        log("Message stream started successfully. Waiting for messages...");

        // Process messages from the stream
        for await (const message of stream) {
          // Simplified skip logic: only check for self and non-text initially
          if (shouldSkip(message, client)) {
            log(
              `[DEBUG] Skipping message ${message?.id}: Self-message or non-text content.`
            );
            continue;
          }

          log(`[DEBUG] Message received from: ${message?.senderInboxId}`);
          log(`[DEBUG] Client inbox ID: ${client.inboxId}`);
          log(`[DEBUG] Message content type: ${message?.contentType?.typeId}`);

          // Inner try...catch for processing individual messages
          try {
            const senderInboxId = message?.senderInboxId ?? "";
            const conversationId = message?.conversationId;

            if (!conversationId) {
              log(`[WARN] Skipping message ${message?.id}: Missing conversationId.`);
              continue;
            }

            // Get the conversation object
            const conversation = await client.conversations.getConversationById(
              conversationId
            );

            if (!conversation) {
              log(`[ERROR] Could not find conversation for message ${message?.id} with conversationId ${conversationId}`);
              continue;
            }

            // Explicitly check if the conversation is a Group
            if (conversation instanceof Group) {
              log(`[DEBUG] Skipping message ${message?.id}: Is a group chat.`);
              continue; // Skip group messages
            }

            // --- Proceed only if it's confirmed to be a DM ---
            log(`[DEBUG] Message ${message?.id} is a DM. Proceeding with processing.`);

            // Check if sender is already in the target Traders group
            const members = await tradersGroup.members();
            const isMember = members.some((member: { inboxId: string }) =>
              isSameString(member.inboxId, senderInboxId)
            );

            if (!isMember) {
              log(`Adding new member ${senderInboxId} to Traders group...`);
              await tradersGroup.addMembers([senderInboxId]);
              await conversation.send(
                `Hi! I've added you to the Traders group. Check your message requests to view!`
              );
              log(`Added ${senderInboxId} to Traders group`);
            } else {
              log(`User ${senderInboxId} is already a member of the group`);
              await conversation.send(`You're already a member of the Traders group!`);
            }
          } catch (processingError: unknown) {
            // Log errors processing individual messages but continue the stream
            const errorMessage =
              processingError instanceof Error ? processingError.message : String(processingError);
            log(`Error processing message ${message?.id}: ${errorMessage}`);

            // Attempt to send error reply
            try {
              const convIdForError = message?.conversationId;
              if (convIdForError) {
                 const errorConversation = await client.conversations.getConversationById(convIdForError);
                 // Check if it's not a group before sending error
                 if (errorConversation && !(errorConversation instanceof Group)) {
                    await errorConversation.send(
                      "Sorry, I encountered an error processing your message."
                    );
                 }
              }
            } catch (sendError) {
              log(
                `Failed to send error message after processing error: ${
                  sendError instanceof Error ? sendError.message : String(sendError)
                }`
              );
            }
          } // End of inner try...catch for message processing
        } // End of for await...of stream loop

        // If the stream completes without error (less common for indefinite streams), reset retry count
        log("Message stream completed normally.");
        retryCount = 0; // Reset retries if stream finishes cleanly

      } catch (streamError: unknown) {
        // Handle errors related to the stream itself (initialization or fatal error)
        retryCount++;
        log(`Stream error (Attempt ${retryCount}/${MAX_RETRIES}): ${streamError instanceof Error ? streamError.message : String(streamError)}`);
        if (streamError instanceof Error && streamError.stack) {
            log(`Stack trace: ${streamError.stack}`);
        }

        if (retryCount < MAX_RETRIES) {
          log(`Waiting ${RETRY_DELAY_MS / 1000} seconds before retrying stream...`);
          await sleep(RETRY_DELAY_MS);
        } else {
          log("Maximum retry attempts reached for message stream. Exiting listener.");
          // The while loop condition will handle exiting
        }
      } // End of outer try...catch for stream handling
    } // End of while loop for retries

    log("listenForMessages function finished."); // Indicates the retry loop has exited
}

// Updated shouldSkip: Only checks self-message and content type
function shouldSkip(
  message: DecodedMessage<any> | undefined,
  client: Client
) {
  if (!message) {
    return true;
  }
  return (
    isSameString(message.senderInboxId, client.inboxId) ||
    message.contentType?.typeId !== "text"
  );
}

