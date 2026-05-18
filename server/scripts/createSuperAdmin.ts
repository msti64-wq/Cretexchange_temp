import { runCreateSuperadmin } from "../../scripts/create-superadmin";

async function main(): Promise<void> {
  try {
    await runCreateSuperadmin();
    process.exit(0);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`Failed to create super admin: ${message}`);
    process.exit(1);
  }
}

void main();
