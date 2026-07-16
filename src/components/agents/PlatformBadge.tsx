import { Badge } from '@/components/ui/badge';

const PLATFORM_COLORS: Record<string, string> = {
  elevenlabs: 'bg-purple-500 hover:bg-purple-600 text-white',
  vapi: 'bg-blue-500 hover:bg-blue-600 text-white',
  retell: 'bg-green-500 hover:bg-green-600 text-white',
  openai: 'bg-gray-800 hover:bg-gray-900 text-white',
  voiceflow: 'bg-indigo-500 hover:bg-indigo-600 text-white',
  botpress: 'bg-cyan-500 hover:bg-cyan-600 text-white',
  vectorshift: 'bg-orange-500 hover:bg-orange-600 text-white',
  flowise: 'bg-teal-500 hover:bg-teal-600 text-white',
  n8n: 'bg-pink-500 hover:bg-pink-600 text-white',
  custom: 'bg-gray-500 hover:bg-gray-600 text-white',
};

interface PlatformBadgeProps {
  platform: string;
}

export function PlatformBadge({ platform }: PlatformBadgeProps) {
  const displayName = platform.charAt(0).toUpperCase() + platform.slice(1);
  const colorClass = PLATFORM_COLORS[platform.toLowerCase()] || PLATFORM_COLORS.custom;

  return (
    <Badge className={colorClass}>
      {displayName}
    </Badge>
  );
}
