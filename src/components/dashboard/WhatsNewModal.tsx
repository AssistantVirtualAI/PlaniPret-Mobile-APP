import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { BarChart3, Clock, DollarSign, GripVertical, Trash2, Gift, PhoneOff, Users, Sparkles, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const WHATS_NEW_VERSION = 'april-2026';
const STORAGE_KEY = 'ava_whats_new_dismissed';

const UPDATES = [
  {
    icon: BarChart3,
    gradient: 'from-indigo-500 to-purple-600',
    title: 'Analytics & Conversations consolidés',
    description: 'Consultez les analytics et conversations de tous vos agents en un seul tableau de bord unifié. Désactivé par défaut, activable par client.',
  },
  {
    icon: Users,
    gradient: 'from-pink-500 to-rose-600',
    title: 'Se souvenir de moi (30 jours)',
    description: 'Cochez « Se souvenir de moi » à la connexion pour rester connecté 30 jours. Disponible pour les agences et les clients.',
  },
  {
    icon: Clock,
    gradient: 'from-emerald-500 to-teal-600',
    title: 'Suivi des appels hors horaires',
    description: 'Configurez les horaires d\'ouverture de votre client. Chaque appel est automatiquement tagué comme hors horaires ou non.',
  },
  {
    icon: DollarSign,
    gradient: 'from-amber-500 to-orange-600',
    title: 'Multiplicateur de revenus',
    description: 'Transformez les compteurs en valeurs de revenus avec un prix par unité (USD ou EUR) sur vos métriques personnalisées.',
  },
  {
    icon: GripVertical,
    gradient: 'from-cyan-500 to-blue-600',
    title: 'Menu Drag & Drop',
    description: 'Réorganisez les éléments de votre menu latéral personnalisé en les glissant-déposant.',
  },
  {
    icon: Trash2,
    gradient: 'from-red-500 to-rose-600',
    title: 'Suppression groupée',
    description: 'Sélectionnez et supprimez plusieurs conversations d\'un coup.',
  },
  {
    icon: Gift,
    gradient: 'from-violet-500 to-purple-600',
    title: 'Essai gratuit client',
    description: 'Offrez une période d\'essai gratuite lors de la création d\'un abonnement pour un client.',
  },
  {
    icon: PhoneOff,
    gradient: 'from-orange-500 to-red-600',
    title: 'Raison de fin d\'appel & Taux de transfert',
    description: 'Nouveaux graphiques analytics pour les agents ElevenLabs. Activables dans les contrôles d\'accès.',
  },
];

export function WhatsNewModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem(STORAGE_KEY);
    if (dismissed !== WHATS_NEW_VERSION) {
      // Small delay so the page loads first
      const timer = setTimeout(() => setOpen(true), 1000);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, WHATS_NEW_VERSION);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleDismiss(); }}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] p-0 gap-0 overflow-hidden">
        {/* Header with gradient */}
        <div className="relative px-6 pt-6 pb-4 bg-gradient-to-br from-primary/10 via-purple-500/10 to-pink-500/10 border-b border-border/30">
          <DialogHeader>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center">
                <Sparkles className="h-4 w-4 text-white" />
              </div>
              <Badge variant="outline" className="text-xs border-primary/30">Avril 2026</Badge>
            </div>
            <DialogTitle className="text-xl font-bold">Nouveautés</DialogTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Analytics unifiés, Conversations et plus encore
            </p>
          </DialogHeader>
        </div>

        {/* Updates list */}
        <ScrollArea className="max-h-[55vh] px-6 py-4">
          <div className="space-y-3">
            {UPDATES.map((update, idx) => {
              const Icon = update.icon;
              return (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className="flex gap-3 p-3 rounded-xl border border-border/40 bg-card/50 hover:bg-card/80 transition-colors"
                >
                  <div className={cn(
                    'w-9 h-9 rounded-lg flex-shrink-0 flex items-center justify-center bg-gradient-to-br',
                    update.gradient
                  )}>
                    <Icon className="h-4 w-4 text-white" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-semibold text-sm">{update.title}</h4>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{update.description}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border/30 bg-muted/20">
          <Button onClick={handleDismiss} className="w-full">
            C'est noté !
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
