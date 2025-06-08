import { Client, Group } from "@xmtp/node-sdk";
import { log, isSameString } from "./helpers/utils.js";

const GROUP_NAME = "Trader Group 1 ⭐";
const TRADERS_ADMIN_ADDRESS = "0x80245b9C0d2Ef322F2554922cA86Cf211a24047F";

export async function findOrCreateTradersGroup(client: Client): Promise<Group> {
  // Find existing group by listing all groups and filtering
  const groups = await client.conversations.listGroups();
  const existingGroup = groups.find((g) => g.name === GROUP_NAME);
  
  if (existingGroup) {
    log(`[INFO] Found existing Traders group`);
    return existingGroup;
  } else {
    log(`[INFO] Creating new Traders group...`);
    const group = await client.conversations.newGroup(
      [],
      {
        groupName: GROUP_NAME,
        groupDescription: "The Traders group",
        groupImageUrlSquare: "",
      }
    );

    log(`[INFO] Group created with ID: ${group.id}`);

    // Add owner to group
    if (!TRADERS_ADMIN_ADDRESS) {
      log(`[ERROR] TRADERS_ADMIN_ADDRESS is not set`);
      return group;
    }

    log(`[INFO] Adding owner ${TRADERS_ADMIN_ADDRESS} to group...`);
    try {
      await group.addMembers([TRADERS_ADMIN_ADDRESS]);

      // Wait a bit for the member to be added
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Verify owner was added and promote them
      const members = await group.members();
      const ownerMember = members.find((member: any) =>
        member.accountAddresses?.some((id: any) =>
          isSameString(id.identifier, TRADERS_ADMIN_ADDRESS)
        )
      );

      if (ownerMember) {
        await group.addSuperAdmin(ownerMember.inboxId);
        log(`[SUCCESS] Added ${TRADERS_ADMIN_ADDRESS} as super admin (owner)`);
      } else {
        log(
          `[WARNING] Could not find member ${TRADERS_ADMIN_ADDRESS} to add as super admin`
        );
      }
    } catch (error) {
      log(`[ERROR] Failed to add owner: ${error}`);
    }

    log(`[SUCCESS] Traders group created successfully`);
    return group;
  }
} 