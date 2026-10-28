"use server";

import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { createSession, destroySession } from "@/lib/session";
import { safeEqual } from "@/lib/signature";

export async function login(formData: FormData): Promise<void> {
  const password = String(formData.get("password") ?? "");
  if (!safeEqual(password, env.inboxPassword)) {
    // Slow down password guessing.
    await new Promise((resolve) => setTimeout(resolve, 1000));
    redirect("/login?error=1");
  }
  await createSession();
  redirect("/inbox");
}

export async function logout(): Promise<void> {
  await destroySession();
  redirect("/login");
}
