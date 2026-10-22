import Workspace from "./workspace";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionUser } from "../lib/auth-store.mjs";
import { publicOrigin } from "../lib/runtime";

export default async function Home() {
  const user = getSessionUser((await cookies()).toString(), publicOrigin());
  if (!user) redirect("/login");
  return <Workspace />;
}
