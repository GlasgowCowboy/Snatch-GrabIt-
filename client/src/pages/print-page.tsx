import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { apiRequest, getQueryFn } from '@/lib/queryClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, CheckCircle2, Loader2, Package, Printer } from 'lucide-react';
import type {
  CreatePrintOrderInput,
  PrintConfig,
  PrintOrderResponse,
  PrintProduct,
} from '@shared/print';

/**
 * Print-on-demand storefront (#52). V1 scaffold:
 *   - Lists the catalog with prices.
 *   - On purchase, posts to /api/print/orders. While payments + vendor are not
 *     wired (PRINT_STRIPE_KEY / PRINT_VENDOR env vars absent), the server queues
 *     the order for manual fulfilment and returns a friendly notice.
 *   - When payments + vendor are wired, this page will redirect to Stripe
 *     Checkout instead of showing the inline confirmation.
 */

function formatPrice(cents: number, currency: string): string {
  const major = (cents / 100).toFixed(2);
  const sym = currency === 'GBP' ? '£' : currency === 'EUR' ? '€' : '$';
  return `${sym}${major}`;
}

export default function PrintPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const { data: config, isLoading } = useQuery<PrintConfig>({
    queryKey: ['/api/print/config'],
    queryFn: getQueryFn({ on401: 'returnNull' }),
  });

  const [selectedProduct, setSelectedProduct] = useState<PrintProduct | null>(null);
  const [confirmed, setConfirmed] = useState<PrintOrderResponse | null>(null);

  const [form, setForm] = useState<CreatePrintOrderInput>({
    productId: '',
    quantity: 1,
    cardBackImageUrl: undefined,
    shipping: {
      fullName: '',
      line1: '',
      line2: undefined,
      city: '',
      region: undefined,
      postalCode: '',
      country: 'GB',
    },
    email: user?.email ?? '',
  });

  const orderMutation = useMutation({
    mutationFn: async (input: CreatePrintOrderInput) => {
      const res = await apiRequest('POST', '/api/print/orders', input);
      return (await res.json()) as PrintOrderResponse;
    },
    onSuccess: (data) => {
      setConfirmed(data);
      toast({
        title: 'Order received',
        description:
          data.notice ?? "We'll email you confirmation and tracking shortly.",
      });
    },
    onError: (e: Error) => {
      toast({
        title: "Couldn't place order",
        description: e.message,
        variant: 'destructive',
      });
    },
  });

  if (isLoading || !config) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (confirmed) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-2xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-6 w-6 text-green-600" />
                Order received
              </CardTitle>
              <CardDescription>Reference: {confirmed.order.id}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p>
                {confirmed.order.quantity} × <strong>{confirmed.order.productId}</strong>
                {' — '}
                {formatPrice(confirmed.order.totalCents, confirmed.order.currency)}
              </p>
              <p className="text-sm text-muted-foreground">
                Shipping to: {confirmed.order.shipping.fullName},{' '}
                {confirmed.order.shipping.line1}, {confirmed.order.shipping.city}{' '}
                {confirmed.order.shipping.postalCode}, {confirmed.order.shipping.country}
              </p>
              {confirmed.notice && (
                <div className="rounded-lg border bg-muted/40 p-3 text-sm">
                  <p>{confirmed.notice}</p>
                </div>
              )}
              <Button onClick={() => navigate('/')} className="w-full">
                Back to Snatch&GrabIt!
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (selectedProduct) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-2xl mx-auto space-y-4">
          <Button
            variant="ghost"
            onClick={() => setSelectedProduct(null)}
            data-testid="button-print-back-to-catalog"
          >
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to catalog
          </Button>
          <Card>
            <CardHeader>
              <CardTitle>{selectedProduct.name}</CardTitle>
              <CardDescription>
                {formatPrice(selectedProduct.priceCents, selectedProduct.currency)}
                {' / deck — ships in '}
                {selectedProduct.leadDaysMin}-{selectedProduct.leadDaysMax} business days
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  orderMutation.mutate({
                    ...form,
                    productId: selectedProduct.id,
                  });
                }}
              >
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="print-quantity">Quantity</Label>
                    <Input
                      id="print-quantity"
                      type="number"
                      min={1}
                      max={50}
                      value={form.quantity}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, quantity: parseInt(e.target.value) || 1 }))
                      }
                      data-testid="input-print-quantity"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="print-email">Email</Label>
                    <Input
                      id="print-email"
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                      placeholder="you@example.com"
                      data-testid="input-print-email"
                      required
                    />
                  </div>
                </div>

                {selectedProduct.customizable && (
                  <div className="space-y-1">
                    <Label htmlFor="print-cardback">Custom card-back image URL (optional)</Label>
                    <Input
                      id="print-cardback"
                      type="url"
                      placeholder="https://your.cdn/back.png"
                      value={form.cardBackImageUrl ?? ''}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          cardBackImageUrl: e.target.value || undefined,
                        }))
                      }
                      data-testid="input-print-cardback"
                    />
                  </div>
                )}

                <Separator />

                <h3 className="font-semibold">Shipping address</h3>
                <div className="space-y-3">
                  <Input
                    placeholder="Full name"
                    value={form.shipping.fullName}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        shipping: { ...f.shipping, fullName: e.target.value },
                      }))
                    }
                    data-testid="input-print-name"
                    required
                  />
                  <Input
                    placeholder="Address line 1"
                    value={form.shipping.line1}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        shipping: { ...f.shipping, line1: e.target.value },
                      }))
                    }
                    data-testid="input-print-line1"
                    required
                  />
                  <Input
                    placeholder="Address line 2 (optional)"
                    value={form.shipping.line2 ?? ''}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        shipping: { ...f.shipping, line2: e.target.value || undefined },
                      }))
                    }
                    data-testid="input-print-line2"
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      placeholder="City"
                      value={form.shipping.city}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          shipping: { ...f.shipping, city: e.target.value },
                        }))
                      }
                      data-testid="input-print-city"
                      required
                    />
                    <Input
                      placeholder="Postal code"
                      value={form.shipping.postalCode}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          shipping: { ...f.shipping, postalCode: e.target.value },
                        }))
                      }
                      data-testid="input-print-postcode"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      placeholder="State / county (optional)"
                      value={form.shipping.region ?? ''}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          shipping: { ...f.shipping, region: e.target.value || undefined },
                        }))
                      }
                      data-testid="input-print-region"
                    />
                    <Input
                      placeholder="Country (ISO-2, e.g. GB)"
                      maxLength={2}
                      value={form.shipping.country}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          shipping: {
                            ...f.shipping,
                            country: e.target.value.toUpperCase(),
                          },
                        }))
                      }
                      data-testid="input-print-country"
                      required
                    />
                  </div>
                </div>

                {!config.paymentsEnabled && (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
                    <p className="font-medium">Early-access fulfilment</p>
                    <p className="text-muted-foreground">
                      Stripe checkout isn't wired yet — your order will be
                      queued and our team will reach out with a payment link
                      within 1 business day.
                    </p>
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full"
                  disabled={orderMutation.isPending}
                  data-testid="button-place-print-order"
                >
                  {orderMutation.isPending && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  Place order — {formatPrice(
                    selectedProduct.priceCents * form.quantity,
                    selectedProduct.currency,
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Printer className="h-8 w-8" />
              Order a physical deck
            </h1>
            <p className="text-muted-foreground mt-1">
              Get a real-world Snatch&GrabIt! deck shipped to your door — great
              for game nights and gifts.
            </p>
          </div>
          <Button variant="outline" onClick={() => navigate('/')} data-testid="button-print-back-home">
            Back to game
          </Button>
        </div>

        {!config.fulfilmentEnabled && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
            <p className="font-medium">We're in early-access print mode</p>
            <p className="text-muted-foreground">
              Orders go into a small manual-fulfilment queue while we finalise
              our printer integration. You'll get a personal email with
              payment + tracking within 1 business day.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {config.catalog.map((p) => (
            <Card
              key={p.id}
              className="flex flex-col"
              data-testid={`print-product-${p.id}`}
            >
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  {p.name}
                </CardTitle>
                <CardDescription>
                  {formatPrice(p.priceCents, p.currency)} · ships in{' '}
                  {p.leadDaysMin}-{p.leadDaysMax} business days
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col gap-4">
                <p className="text-sm text-muted-foreground flex-1">
                  {p.description}
                </p>
                <Button
                  onClick={() => {
                    setSelectedProduct(p);
                    setForm((f) => ({ ...f, productId: p.id }));
                  }}
                  data-testid={`button-select-print-${p.id}`}
                >
                  Order this deck
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
