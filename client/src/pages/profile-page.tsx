import { useQuery, useMutation } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { useLocation } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ArrowLeft, Save, Image } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient, getQueryFn } from '@/lib/queryClient';
import { UserProfile } from '@shared/schema';
import { useForm } from 'react-hook-form';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import PrizeStorePanel from '@/components/PrizeStorePanel';

const profileFormSchema = z.object({
  displayName: z.string().max(50).optional(),
  bio: z.string().max(500).optional(),
  cardBackUrl: z.string().url().optional().or(z.literal('')),
  bonePilePosition: z.enum(['left', 'right']).optional(),
});

type ProfileFormData = z.infer<typeof profileFormSchema>;

export default function ProfilePage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: profile, isLoading } = useQuery<UserProfile>({
    queryKey: ['/api/profile'],
    queryFn: getQueryFn({ on401: 'returnNull' }),
  });

  const form = useForm<ProfileFormData>({
    resolver: zodResolver(profileFormSchema),
    values: {
      displayName: profile?.displayName || '',
      bio: profile?.bio || '',
      cardBackUrl: profile?.cardBackUrl || '',
      bonePilePosition: (profile?.bonePilePosition as 'left' | 'right') || 'left',
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (data: ProfileFormData) => {
      const res = await apiRequest('PATCH', '/api/profile', data);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/profile'] });
      toast({
        title: 'Profile updated',
        description: 'Your profile has been saved successfully.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Couldn't update profile",
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const onSubmit = (data: ProfileFormData) => {
    updateProfileMutation.mutate(data);
  };

  if (isLoading || !user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading profile...</p>
      </div>
    );
  }

  const initials = user.username.slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation('/')}
            data-testid="button-back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Profile & Settings</h1>
            <p className="text-muted-foreground">Manage your account information</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Profile Information</CardTitle>
            <CardDescription>
              Update your display name and bio. Your username cannot be changed.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center gap-4">
              <Avatar className="h-20 w-20">
                <AvatarFallback className="text-2xl">{initials}</AvatarFallback>
              </Avatar>
              <div>
                <p className="text-sm font-medium">@{user.username}</p>
                <p className="text-xs text-muted-foreground">
                  {user.tier === 'paid' ? 'Pro Member' : 'Free Member'}
                </p>
              </div>
            </div>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="displayName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Display Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Enter your display name"
                          {...field}
                          data-testid="input-display-name"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="bio"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bio</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Tell us about yourself..."
                          className="resize-none"
                          rows={4}
                          {...field}
                          data-testid="input-bio"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="cardBackUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <Image className="w-4 h-4" />
                        Card Back Image URL
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder="https://example.com/card-back.jpg"
                          {...field}
                          data-testid="input-card-back-url"
                        />
                      </FormControl>
                      <p className="text-xs text-muted-foreground">
                        Enter a URL to an image file. Recommended size: 150x200px. Max file size: 5MB.
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="bonePilePosition"
                  render={({ field }) => (
                    <FormItem className="space-y-3">
                      <FormLabel>Bone Pile Position</FormLabel>
                      <FormControl>
                        <RadioGroup
                          onValueChange={field.onChange}
                          value={field.value}
                          className="flex flex-col space-y-1"
                        >
                          <FormItem className="flex items-center space-x-3 space-y-0">
                            <FormControl>
                              <RadioGroupItem value="left" data-testid="radio-bone-pile-left" />
                            </FormControl>
                            <FormLabel className="font-normal">
                              Left of tableau (default)
                            </FormLabel>
                          </FormItem>
                          <FormItem className="flex items-center space-x-3 space-y-0">
                            <FormControl>
                              <RadioGroupItem value="right" data-testid="radio-bone-pile-right" />
                            </FormControl>
                            <FormLabel className="font-normal">
                              Right of tableau
                            </FormLabel>
                          </FormItem>
                        </RadioGroup>
                      </FormControl>
                      <FormDescription>
                        Choose where the bone pile appears in your player area
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  disabled={updateProfileMutation.isPending}
                  data-testid="button-save-profile"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {updateProfileMutation.isPending ? 'Saving...' : 'Save Changes'}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        <PrizeStorePanel />

        {user.tier === 'free' && (
          <Card>
            <CardHeader>
              <CardTitle>Upgrade to Pro</CardTitle>
              <CardDescription>
                Unlock game history tracking and data persistence
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={() => setLocation('/upgrade')}
                data-testid="button-upgrade-cta"
              >
                Upgrade Now
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
