import { Badge } from '@/components/ui/badge';
import { 
  HelpCircle, 
  ShoppingCart, 
  AlertTriangle, 
  Wrench,
  Phone,
  Calendar,
  CreditCard,
  MessageSquare
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type SmartTag = 
  | 'reclamation'
  | 'demande_info'
  | 'achat'
  | 'support_technique'
  | 'rendez_vous'
  | 'facturation'
  | 'rappel'
  | 'autre';

interface SmartTagConfig {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bgColor: string;
}

export const smartTagsConfig: Record<SmartTag, SmartTagConfig> = {
  reclamation: {
    label: 'Réclamation',
    icon: AlertTriangle,
    color: 'text-red-500',
    bgColor: 'bg-red-500/10 border-red-500/30'
  },
  demande_info: {
    label: 'Demande d\'info',
    icon: HelpCircle,
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10 border-blue-500/30'
  },
  achat: {
    label: 'Achat',
    icon: ShoppingCart,
    color: 'text-green-500',
    bgColor: 'bg-green-500/10 border-green-500/30'
  },
  support_technique: {
    label: 'Support technique',
    icon: Wrench,
    color: 'text-orange-500',
    bgColor: 'bg-orange-500/10 border-orange-500/30'
  },
  rendez_vous: {
    label: 'Rendez-vous',
    icon: Calendar,
    color: 'text-purple-500',
    bgColor: 'bg-purple-500/10 border-purple-500/30'
  },
  facturation: {
    label: 'Facturation',
    icon: CreditCard,
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-500/10 border-yellow-500/30'
  },
  rappel: {
    label: 'Rappel demandé',
    icon: Phone,
    color: 'text-cyan-500',
    bgColor: 'bg-cyan-500/10 border-cyan-500/30'
  },
  autre: {
    label: 'Autre',
    icon: MessageSquare,
    color: 'text-gray-500',
    bgColor: 'bg-gray-500/10 border-gray-500/30'
  }
};

interface SmartTagBadgeProps {
  tag: SmartTag | string;
  size?: 'sm' | 'md';
}

export function SmartTagBadge({ tag, size = 'md' }: SmartTagBadgeProps) {
  const config = smartTagsConfig[tag as SmartTag] || smartTagsConfig.autre;
  const Icon = config.icon;

  return (
    <Badge 
      variant="outline" 
      className={cn(
        "gap-1",
        config.bgColor,
        config.color,
        size === 'sm' && 'text-xs px-1.5 py-0.5'
      )}
    >
      <Icon className={cn("w-3 h-3", size === 'sm' && 'w-2.5 h-2.5')} />
      {config.label}
    </Badge>
  );
}

interface SmartTagsListProps {
  tags: string[];
  maxVisible?: number;
  size?: 'sm' | 'md';
}

export function SmartTagsList({ tags, maxVisible = 3, size = 'md' }: SmartTagsListProps) {
  if (!tags || tags.length === 0) {
    return null;
  }

  const visibleTags = tags.slice(0, maxVisible);
  const remainingCount = tags.length - maxVisible;

  return (
    <div className="flex flex-wrap gap-1">
      {visibleTags.map((tag, index) => (
        <SmartTagBadge key={index} tag={tag} size={size} />
      ))}
      {remainingCount > 0 && (
        <Badge variant="outline" className={cn("text-muted-foreground", size === 'sm' && 'text-xs')}>
          +{remainingCount}
        </Badge>
      )}
    </div>
  );
}

// Fonction utilitaire pour parser les tags de l'analyse IA
export function parseSmartTagsFromAnalysis(topics: string[], intentions: string[]): SmartTag[] {
  const tags: SmartTag[] = [];
  const allTerms = [...topics, ...intentions].map(t => t.toLowerCase());

  // Mapping des termes vers les tags
  const termMappings: { terms: string[]; tag: SmartTag }[] = [
    { terms: ['réclamation', 'plainte', 'problème', 'insatisfaction', 'erreur'], tag: 'reclamation' },
    { terms: ['achat', 'commander', 'acheter', 'prix', 'tarif', 'devis'], tag: 'achat' },
    { terms: ['technique', 'bug', 'panne', 'dysfonctionnement', 'installation'], tag: 'support_technique' },
    { terms: ['rendez-vous', 'rdv', 'réservation', 'planning', 'disponibilité'], tag: 'rendez_vous' },
    { terms: ['facture', 'paiement', 'remboursement', 'facturation'], tag: 'facturation' },
    { terms: ['rappel', 'recontacter', 'callback'], tag: 'rappel' },
    { terms: ['information', 'renseignement', 'question', 'demande'], tag: 'demande_info' },
  ];

  for (const mapping of termMappings) {
    if (mapping.terms.some(term => allTerms.some(t => t.includes(term)))) {
      if (!tags.includes(mapping.tag)) {
        tags.push(mapping.tag);
      }
    }
  }

  // Si aucun tag trouvé, ajouter "autre"
  if (tags.length === 0) {
    tags.push('autre');
  }

  return tags;
}
