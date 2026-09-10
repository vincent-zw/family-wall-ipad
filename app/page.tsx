import { FamilyDashboard } from "./family-dashboard";
import { FamilyAccessScreen } from "./family-access-screen";
import { hasFamilyAccess } from "./family-access";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (!(await hasFamilyAccess())) return <FamilyAccessScreen />;
  return <FamilyDashboard />;
}
