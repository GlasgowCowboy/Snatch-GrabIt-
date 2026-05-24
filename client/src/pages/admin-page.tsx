import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { useLocation } from 'wouter';
import { getQueryFn, apiRequest, queryClient } from '@/lib/queryClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { Separator } from '@/components/ui/separator';
import { Settings, Image, Loader2 } from 'lucide-react';
import type { AdminSettings } from '@shared/schema';

export default function AdminPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const { data: settings, isLoading } = useQuery<AdminSettings>({
    queryKey: ['/api/admin/settings'],
    queryFn: getQueryFn({ on401: 'returnNull' }),
    enabled: !!user?.isAdmin, // Only fetch if user is admin
  });

  const [formData, setFormData] = useState<Partial<AdminSettings>>({});

  // Update form data when settings load
  useEffect(() => {
    if (settings) {
      setFormData(settings);
    }
  }, [settings]);

  const updateMutation = useMutation({
    mutationFn: async (updates: Partial<AdminSettings>) => {
      const response = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
        credentials: 'include',
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to update settings');
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/settings'] });
      toast({
        title: 'Settings updated',
        description: 'Admin settings have been saved successfully',
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Couldn't save settings",
        description: error.message || 'Please try again.',
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate(formData);
  };

  const handleChange = (field: keyof AdminSettings, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  // Redirect if not admin
  if (user && !user.isAdmin) {
    navigate('/');
  }

  if (!user) {
    navigate('/auth');
  }

  if (isLoading || !settings) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Settings className="h-8 w-8" />
              Admin Settings
            </h1>
            <p className="text-muted-foreground mt-1">
              Configure AI difficulty levels and sponsorship settings
            </p>
          </div>
          <Button variant="outline" onClick={() => navigate('/')} data-testid="button-back-home">
            Back to Home
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* AI Difficulty Settings */}
          <Card>
            <CardHeader>
              <CardTitle>AI Difficulty Settings</CardTitle>
              <CardDescription>
                Configure move delays (ms) and intelligence levels (0-100%) for each AI difficulty
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Easy Difficulty */}
              <div className="space-y-4">
                <h3 className="font-semibold text-lg">Easy Difficulty</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="easyMoveDelayMin">Min Delay (ms)</Label>
                    <Input
                      id="easyMoveDelayMin"
                      type="number"
                      value={formData.easyMoveDelayMin ?? settings.easyMoveDelayMin}
                      onChange={(e) => handleChange('easyMoveDelayMin', parseInt(e.target.value))}
                      min={100}
                      max={5000}
                      data-testid="input-easy-delay-min"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="easyMoveDelayMax">Max Delay (ms)</Label>
                    <Input
                      id="easyMoveDelayMax"
                      type="number"
                      value={formData.easyMoveDelayMax ?? settings.easyMoveDelayMax}
                      onChange={(e) => handleChange('easyMoveDelayMax', parseInt(e.target.value))}
                      min={100}
                      max={5000}
                      data-testid="input-easy-delay-max"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="easyIntelligence">Intelligence (%)</Label>
                    <Input
                      id="easyIntelligence"
                      type="number"
                      value={formData.easyIntelligence ?? settings.easyIntelligence}
                      onChange={(e) => handleChange('easyIntelligence', parseInt(e.target.value))}
                      min={0}
                      max={100}
                      data-testid="input-easy-intelligence"
                    />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Medium Difficulty */}
              <div className="space-y-4">
                <h3 className="font-semibold text-lg">Medium Difficulty</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="mediumMoveDelayMin">Min Delay (ms)</Label>
                    <Input
                      id="mediumMoveDelayMin"
                      type="number"
                      value={formData.mediumMoveDelayMin ?? settings.mediumMoveDelayMin}
                      onChange={(e) => handleChange('mediumMoveDelayMin', parseInt(e.target.value))}
                      min={100}
                      max={5000}
                      data-testid="input-medium-delay-min"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="mediumMoveDelayMax">Max Delay (ms)</Label>
                    <Input
                      id="mediumMoveDelayMax"
                      type="number"
                      value={formData.mediumMoveDelayMax ?? settings.mediumMoveDelayMax}
                      onChange={(e) => handleChange('mediumMoveDelayMax', parseInt(e.target.value))}
                      min={100}
                      max={5000}
                      data-testid="input-medium-delay-max"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="mediumIntelligence">Intelligence (%)</Label>
                    <Input
                      id="mediumIntelligence"
                      type="number"
                      value={formData.mediumIntelligence ?? settings.mediumIntelligence}
                      onChange={(e) => handleChange('mediumIntelligence', parseInt(e.target.value))}
                      min={0}
                      max={100}
                      data-testid="input-medium-intelligence"
                    />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Hard Difficulty */}
              <div className="space-y-4">
                <h3 className="font-semibold text-lg">Hard Difficulty</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="hardMoveDelayMin">Min Delay (ms)</Label>
                    <Input
                      id="hardMoveDelayMin"
                      type="number"
                      value={formData.hardMoveDelayMin ?? settings.hardMoveDelayMin}
                      onChange={(e) => handleChange('hardMoveDelayMin', parseInt(e.target.value))}
                      min={100}
                      max={5000}
                      data-testid="input-hard-delay-min"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="hardMoveDelayMax">Max Delay (ms)</Label>
                    <Input
                      id="hardMoveDelayMax"
                      type="number"
                      value={formData.hardMoveDelayMax ?? settings.hardMoveDelayMax}
                      onChange={(e) => handleChange('hardMoveDelayMax', parseInt(e.target.value))}
                      min={100}
                      max={5000}
                      data-testid="input-hard-delay-max"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="hardIntelligence">Intelligence (%)</Label>
                    <Input
                      id="hardIntelligence"
                      type="number"
                      value={formData.hardIntelligence ?? settings.hardIntelligence}
                      onChange={(e) => handleChange('hardIntelligence', parseInt(e.target.value))}
                      min={0}
                      max={100}
                      data-testid="input-hard-intelligence"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Sponsorship Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Image className="h-5 w-5" />
                Sponsorship Settings
              </CardTitle>
              <CardDescription>
                Configure sponsorship banner displayed on homepage, scoreboard, and game over screens
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="sponsorEnabled">Enable Sponsorship</Label>
                  <p className="text-sm text-muted-foreground">
                    Show sponsorship banner across the site
                  </p>
                </div>
                <Switch
                  id="sponsorEnabled"
                  checked={formData.sponsorEnabled ?? settings.sponsorEnabled}
                  onCheckedChange={(checked) => handleChange('sponsorEnabled', checked)}
                  data-testid="switch-sponsor-enabled"
                />
              </div>

              <Separator />

              <div className="space-y-2">
                <Label htmlFor="sponsorLogoUrl">Logo URL</Label>
                <Input
                  id="sponsorLogoUrl"
                  type="url"
                  placeholder="https://example.com/logo.png"
                  value={formData.sponsorLogoUrl ?? settings.sponsorLogoUrl ?? ''}
                  onChange={(e) => handleChange('sponsorLogoUrl', e.target.value || null)}
                  data-testid="input-sponsor-logo"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="sponsorText">Sponsor Text/Tagline</Label>
                <Input
                  id="sponsorText"
                  type="text"
                  placeholder="Sponsored by YourCompany"
                  maxLength={200}
                  value={formData.sponsorText ?? settings.sponsorText ?? ''}
                  onChange={(e) => handleChange('sponsorText', e.target.value || null)}
                  data-testid="input-sponsor-text"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="sponsorLink">Sponsor Link</Label>
                <Input
                  id="sponsorLink"
                  type="url"
                  placeholder="https://sponsor-website.com"
                  value={formData.sponsorLink ?? settings.sponsorLink ?? ''}
                  onChange={(e) => handleChange('sponsorLink', e.target.value || null)}
                  data-testid="input-sponsor-link"
                />
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setFormData(settings)}>
              Reset Changes
            </Button>
            <Button 
              type="submit" 
              disabled={updateMutation.isPending}
              data-testid="button-save-settings"
            >
              {updateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Settings
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
