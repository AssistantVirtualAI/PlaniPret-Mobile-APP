import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { Navbar } from "@/components/landing/Navbar";
import { FooterSection } from "@/components/landing/FooterSection";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "@/hooks/useTranslation";

const demoRequestSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(255),
  company: z.string().trim().max(120).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  expectedClients: z.string().trim().max(40).optional().or(z.literal("")),
  currentPlatform: z.string().trim().max(80).optional().or(z.literal("")),
  requirements: z.string().trim().max(2000).optional().or(z.literal("")),
});

type DemoRequestValues = z.infer<typeof demoRequestSchema>;

export default function DemoRequestPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);

  const defaultValues = useMemo<DemoRequestValues>(
    () => ({
      name: "",
      email: "",
      company: "",
      phone: "",
      expectedClients: "",
      currentPlatform: "",
      requirements: "",
    }),
    []
  );

  const form = useForm<DemoRequestValues>({
    resolver: zodResolver(demoRequestSchema),
    defaultValues,
    mode: "onBlur",
  });

  const onSubmit = async (values: DemoRequestValues) => {
    setSubmitting(true);
    try {
      const payload = {
        ...values,
        company: values.company || undefined,
        phone: values.phone || undefined,
        expectedClients: values.expectedClients || undefined,
        currentPlatform: values.currentPlatform || undefined,
        requirements: values.requirements || undefined,
      };

      const { error } = await supabase.functions.invoke("send-contact-sales", {
        body: payload,
      });

      if (error) throw error;

      toast({
        title: t('demoRequest.successTitle'),
        description: t('demoRequest.successDescription'),
      });
      form.reset(defaultValues);
    } catch (e: any) {
      toast({
        title: t('demoRequest.errorTitle'),
        description: e?.message ?? "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background overflow-hidden">
      <Navbar />
      <main className="pt-24">
        <section className="py-16 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-background to-background" />
          <div className="container mx-auto px-6 relative z-10">
            <div className="max-w-3xl mx-auto">
              <div className="text-center mb-8">
                <h1 className="text-4xl md:text-5xl font-bold">{t('demoRequest.title')}</h1>
                <p className="text-muted-foreground mt-4">
                  {t('demoRequest.subtitle')}
                </p>
              </div>

              <Card className="bg-card/50 backdrop-blur-xl border-border/60">
                <CardHeader>
                  <CardTitle>{t('demoRequest.cardTitle')}</CardTitle>
                  <CardDescription>
                    {t('demoRequest.cardDescription')}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="name">{t('demoRequest.nameLabel')}</Label>
                        <Input id="name" autoComplete="name" {...form.register("name")} />
                        {form.formState.errors.name ? (
                          <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
                        ) : null}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="email">{t('demoRequest.emailLabel')}</Label>
                        <Input id="email" type="email" autoComplete="email" {...form.register("email")} />
                        {form.formState.errors.email ? (
                          <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>
                        ) : null}
                      </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="company">{t('demoRequest.companyLabel')}</Label>
                        <Input id="company" {...form.register("company")} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="phone">{t('demoRequest.phoneLabel')}</Label>
                        <Input id="phone" {...form.register("phone")} />
                      </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="expectedClients">{t('demoRequest.expectedClientsLabel')}</Label>
                        <Input id="expectedClients" {...form.register("expectedClients")} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="currentPlatform">{t('demoRequest.currentPlatformLabel')}</Label>
                        <Input id="currentPlatform" {...form.register("currentPlatform")} />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="requirements">{t('demoRequest.requirementsLabel')}</Label>
                      <Textarea
                        id="requirements"
                        rows={6}
                        placeholder={t('demoRequest.requirementsPlaceholder')}
                        {...form.register("requirements")}
                      />
                      {form.formState.errors.requirements ? (
                        <p className="text-sm text-destructive">{form.formState.errors.requirements.message}</p>
                      ) : null}
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3 justify-end">
                      <Button type="button" variant="outline" onClick={() => navigate("/")}>{t('demoRequest.back')}</Button>
                      <Button
                        type="submit"
                        className="bg-gradient-to-r from-primary to-secondary hover:opacity-90"
                        disabled={submitting}
                      >
                        {submitting ? t('demoRequest.sending') : t('demoRequest.submit')}
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>
      </main>
      <FooterSection />
    </div>
  );
}
