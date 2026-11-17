import { Suspense } from "react";
import { AuthForm } from "@/components/AuthForm";

export const metadata = { title: "Join" };

export default function Register() {
  return <div className="auth-wrap"><Suspense><AuthForm mode="register" /></Suspense></div>;
}
