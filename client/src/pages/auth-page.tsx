// From blueprint: javascript_auth_all_persistance
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Redirect } from "wouter";
import { Spade, Heart, Diamond, Club, CheckCircle2, XCircle } from "lucide-react";
import { passwordSchema } from "@shared/schema";

export default function AuthPage() {
  const { user, loginMutation, registerMutation } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");

  // Password validation checks
  const passwordValidation = {
    minLength: password.length >= 8,
    hasNumber: /[0-9]/.test(password),
    hasCapital: /[A-Z]/.test(password),
    hasSpecial: /[!@#$%^&*(),.?":{}|<>]/.test(password),
  };

  const isPasswordValid = isLogin || (
    passwordValidation.minLength &&
    passwordValidation.hasNumber &&
    passwordValidation.hasCapital &&
    passwordValidation.hasSpecial
  );

  // Redirect if already logged in
  if (user) {
    return <Redirect to="/" />;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate password for registration
    if (!isLogin) {
      try {
        passwordSchema.parse(password);
      } catch (error) {
        // Error will be shown in the UI via validation checks
        return;
      }
    }
    
    if (isLogin) {
      loginMutation.mutate({ username, password });
    } else {
      registerMutation.mutate({ 
        username, 
        password, 
        email: email || undefined,
        displayName: displayName || undefined 
      });
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left side - Form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-2xl">{isLogin ? "Welcome Back" : "Create Account"}</CardTitle>
            <CardDescription>
              {isLogin 
                ? "Login to access your saved games and settings" 
                : "Register to save your game history and customize your experience"}
            </CardDescription>
          </CardHeader>
          <CardContent>
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

              {!isLogin && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="displayName">Display Name</Label>
                    <Input
                      id="displayName"
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="How you'll appear in games"
                      required
                      data-testid="input-display-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email (optional)</Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      data-testid="input-email"
                    />
                  </div>
                </>
              )}

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  data-testid="input-password"
                />
                {!isLogin && password && (
                  <div className="space-y-1 text-xs mt-2">
                    <div className={`flex items-center gap-1 ${passwordValidation.minLength ? 'text-green-600' : 'text-muted-foreground'}`}>
                      {passwordValidation.minLength ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                      <span>At least 8 characters</span>
                    </div>
                    <div className={`flex items-center gap-1 ${passwordValidation.hasNumber ? 'text-green-600' : 'text-muted-foreground'}`}>
                      {passwordValidation.hasNumber ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                      <span>At least 1 number</span>
                    </div>
                    <div className={`flex items-center gap-1 ${passwordValidation.hasCapital ? 'text-green-600' : 'text-muted-foreground'}`}>
                      {passwordValidation.hasCapital ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                      <span>At least 1 capital letter</span>
                    </div>
                    <div className={`flex items-center gap-1 ${passwordValidation.hasSpecial ? 'text-green-600' : 'text-muted-foreground'}`}>
                      {passwordValidation.hasSpecial ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                      <span>At least 1 special character (!@#$%^&*...)</span>
                    </div>
                  </div>
                )}
              </div>

              <Button 
                type="submit" 
                className="w-full" 
                disabled={loginMutation.isPending || registerMutation.isPending || (!isLogin && !isPasswordValid)}
                data-testid={isLogin ? "button-login" : "button-register"}
              >
                {isLogin ? "Login" : "Register"}
              </Button>

              <div className="text-center text-sm space-y-2">
                {isLogin && (
                  <div>
                    <a
                      href="/forgot-password"
                      className="text-primary hover:underline"
                      data-testid="link-forgot-password"
                    >
                      Forgot password?
                    </a>
                  </div>
                )}
                <div>
                  <button
                    type="button"
                    onClick={() => setIsLogin(!isLogin)}
                    className="text-primary hover:underline"
                    data-testid="button-toggle-auth"
                  >
                    {isLogin ? "Need an account? Register" : "Already have an account? Login"}
                  </button>
                </div>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Right side - Hero */}
      <div className="hidden lg:flex flex-1 bg-primary/10 items-center justify-center p-8">
        <div className="max-w-md space-y-6 text-center">
          <div className="flex justify-center gap-4 text-6xl">
            <Spade className="w-16 h-16" />
            <Heart className="w-16 h-16 text-red-500" />
            <Diamond className="w-16 h-16 text-red-500" />
            <Club className="w-16 h-16" />
          </div>
          <h1 className="text-4xl font-bold">Snatch&GrabIt!</h1>
          <p className="text-lg text-muted-foreground">
            Real-time multiplayer competitive solitaire. Race to empty your bone pile and dominate the shared foundations!
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            Powered by <span className="font-semibold">AppSmith</span>
          </p>
          <div className="space-y-2 text-left">
            <p className="text-sm"><strong>Free Account:</strong> Play anytime, no saves</p>
            <p className="text-sm"><strong>Paid Account:</strong> Save game history, customize table themes, and track your stats</p>
          </div>
        </div>
      </div>
    </div>
  );
}
