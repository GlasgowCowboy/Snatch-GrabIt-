import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft } from "lucide-react";

export default function ForgotPasswordPage() {
  const [username, setUsername] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await fetch("/api/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok) {
        // Server returns a generic message regardless of whether the account
        // exists (so we can't enumerate users). We always tell the user the
        // same thing — check your email.
        setSubmitted(true);
        toast({
          title: 'Check your email',
          description: data.message ?? 'If an account matches, a reset link is on its way.',
        });
      } else {
        toast({
          title: "Couldn't request reset",
          description: data.message || 'Please try again.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: "Couldn't reach the server",
        description: 'Check your connection and try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-8 bg-background">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">Forgot password</CardTitle>
          <CardDescription>
            Enter your username — we'll email you a link to reset it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!submitted ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  data-testid="input-username"
                />
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={isLoading || !username.trim()}
                data-testid="button-request-reset"
              >
                {isLoading ? 'Sending…' : 'Email me a reset link'}
              </Button>

              <div className="text-center text-sm">
                <Link href="/auth" className="text-primary hover:underline inline-flex items-center gap-1">
                  <ArrowLeft className="w-4 h-4" />
                  Back to login
                </Link>
              </div>
            </form>
          ) : (
            <div className="space-y-4" data-testid="forgot-password-submitted">
              <div className="p-4 bg-muted rounded-md">
                <p className="text-sm">
                  If an account with that username exists, we've emailed a link to reset the password.
                  The link expires in 1 hour.
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                Didn't get an email? Check spam, then try again with the username spelled exactly as you registered.
              </p>
              <div className="text-center text-sm">
                <Link href="/auth" className="text-primary hover:underline inline-flex items-center gap-1">
                  <ArrowLeft className="w-4 h-4" />
                  Back to login
                </Link>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
