"use client";

import Link from "next/link";
import { useActionState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/ui/field-error";
import { requestPasswordResetAction, type AuthState } from "../actions";

export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState<AuthState, FormData>(requestPasswordResetAction, {});
  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle className="text-xl">Reset your password</CardTitle>
        <CardDescription>We&apos;ll email you a secure link to choose a new password.</CardDescription>
      </CardHeader>
      <CardContent>
        {state.success ? (
          <div role="status" className="flex gap-3 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800">
            <CheckCircle2 className="size-5 shrink-0" aria-hidden />
            <p>{state.success}</p>
          </div>
        ) : (
          <form action={action} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
            </div>
            <FieldError message={state.error} />
            <Button type="submit" className="w-full" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              Send reset link
            </Button>
          </form>
        )}
        <p className="mt-6 text-center text-sm">
          <Link href="/admin/login" className="font-medium text-primary hover:underline">
            Back to sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
