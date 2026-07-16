import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { UserPlus, CheckCircle2, Star, Mail, Phone, User } from "lucide-react";
import { toast } from "sonner";

export const LeadFormDemo = () => {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [leadScore, setLeadScore] = useState(0);

  // Calculate lead score based on form completion
  const calculateScore = () => {
    let score = 0;
    if (formData.name.length > 2) score += 30;
    if (formData.email.includes("@") && formData.email.includes(".")) score += 40;
    if (formData.phone.length >= 10) score += 30;
    return score;
  };

  const handleChange = (field: keyof typeof formData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setTimeout(() => {
      setLeadScore(calculateScore());
    }, 100);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    setSubmitted(true);
    setIsSubmitting(false);
    toast.success("Lead capturé avec succès !");
  };

  const handleReset = () => {
    setFormData({ name: "", email: "", phone: "" });
    setSubmitted(false);
    setLeadScore(0);
  };

  const getScoreColor = () => {
    if (leadScore >= 80) return "text-green-500";
    if (leadScore >= 50) return "text-yellow-500";
    return "text-muted-foreground";
  };

  const getScoreLabel = () => {
    if (leadScore >= 80) return "Qualifié";
    if (leadScore >= 50) return "Prometteur";
    if (leadScore > 0) return "En cours";
    return "Non qualifié";
  };

  if (submitted) {
    return (
      <Card className="h-[400px] flex flex-col">
        <CardContent className="flex-1 flex flex-col items-center justify-center text-center p-6">
          <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mb-4">
            <CheckCircle2 className="w-8 h-8 text-green-500" />
          </div>
          <h3 className="text-xl font-bold mb-2">Lead Capturé !</h3>
          <p className="text-muted-foreground mb-4">
            Les informations ont été enregistrées dans le CRM
          </p>
          <div className="flex items-center gap-2 mb-6">
            <Badge variant="secondary" className="gap-1">
              <Star className="w-3 h-3" />
              Score: {leadScore}%
            </Badge>
            <Badge className="bg-green-500">{getScoreLabel()}</Badge>
          </div>
          <Button onClick={handleReset} variant="outline">
            Tester à nouveau
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-[400px] flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-primary" />
            Capture de Lead
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={getScoreColor()}>
              Score: {leadScore}%
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <User className="w-4 h-4" />
              Nom complet
            </Label>
            <Input
              placeholder="Jean Dupont"
              value={formData.name}
              onChange={(e) => handleChange("name", e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Mail className="w-4 h-4" />
              Email
            </Label>
            <Input
              type="email"
              placeholder="jean@example.com"
              value={formData.email}
              onChange={(e) => handleChange("email", e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Phone className="w-4 h-4" />
              Téléphone
            </Label>
            <Input
              type="tel"
              placeholder="+33 6 12 34 56 78"
              value={formData.phone}
              onChange={(e) => handleChange("phone", e.target.value)}
            />
          </div>

          {/* Score Progress Bar */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Qualification</span>
              <span className={getScoreColor()}>{getScoreLabel()}</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  leadScore >= 80
                    ? "bg-green-500"
                    : leadScore >= 50
                    ? "bg-yellow-500"
                    : "bg-muted-foreground"
                }`}
                style={{ width: `${leadScore}%` }}
              />
            </div>
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={isSubmitting || leadScore < 50}
          >
            {isSubmitting ? "Enregistrement..." : "Capturer le Lead"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};
