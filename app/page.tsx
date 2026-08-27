import InventoryApp from "./inventory-app";
import { requireChatGPTUser } from "./chatgpt-auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await requireChatGPTUser("/");
  return <InventoryApp user={{ displayName: user.displayName, email: user.email }} />;
}
