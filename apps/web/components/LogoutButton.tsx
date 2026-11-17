"use client";

import { useRouter } from "next/navigation";
import { send } from "@/lib/client";

export function LogoutButton() {
  const router = useRouter();
  return (
    <button
      className="btn btn-ghost"
      onClick={async () => {
        await send("POST", "/auth/logout");
        router.refresh();
      }}
    >
      Sign out
    </button>
  );
}
