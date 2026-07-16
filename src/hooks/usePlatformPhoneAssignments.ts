import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/context/OrganizationContext';
import { TwilioPhoneNumber } from './useTwilioIntegration';

export interface PlatformPhoneAssignment {
  phoneNumber: string;
  platform: 'elevenlabs' | 'vapi' | 'retell' | 'custom' | 'unknown';
  agentId?: string;
  agentName?: string;
  platformAgentId?: string;
  detectedFrom: 'voice_url' | 'platform_api' | 'db_assignment';
}

// Normalize phone number to E.164 format
function normalizePhoneNumber(phone: string | null): string {
  if (!phone) return '';
  const cleaned = phone.replace(/[^\d+]/g, '');
  return cleaned.startsWith('+') ? cleaned : `+${cleaned}`;
}

// Detect platform from voice_url
function detectPlatformFromUrl(voiceUrl: string | null): { platform: PlatformPhoneAssignment['platform']; agentId?: string } {
  if (!voiceUrl) return { platform: 'unknown' };

  // ElevenLabs patterns
  if (voiceUrl.includes('elevenlabs.io')) {
    // Try to extract agent ID from URL if possible
    const match = voiceUrl.match(/agent[_-]?id[=:]([a-zA-Z0-9_-]+)/i);
    return { 
      platform: 'elevenlabs', 
      agentId: match?.[1] 
    };
  }

  // Vapi patterns
  if (voiceUrl.includes('vapi.ai') || voiceUrl.includes('api.vapi.ai')) {
    const match = voiceUrl.match(/agent[_-]?id[=:]([a-zA-Z0-9_-]+)/i);
    return { 
      platform: 'vapi',
      agentId: match?.[1]
    };
  }

  // Retell patterns  
  if (voiceUrl.includes('retell') || voiceUrl.includes('retellai')) {
    const match = voiceUrl.match(/agent[_-]?id[=:]([a-zA-Z0-9_-]+)/i);
    return { 
      platform: 'retell',
      agentId: match?.[1]
    };
  }

  // Our own webhook
  if (voiceUrl.includes('supabase.co/functions') && voiceUrl.includes('twilio-voice-webhook')) {
    return { platform: 'custom' }; // Will be resolved from DB
  }

  // Custom URL (third-party integrations)
  if (voiceUrl.startsWith('http')) {
    return { platform: 'custom' };
  }

  return { platform: 'unknown' };
}

export function usePlatformPhoneAssignments(twilioPhoneNumbers: TwilioPhoneNumber[]) {
  const { selectedOrgId } = useOrganization();

  return useQuery({
    queryKey: ['platform-phone-assignments', selectedOrgId, twilioPhoneNumbers.map(n => n.phone_number)],
    queryFn: async () => {
      if (!selectedOrgId || twilioPhoneNumbers.length === 0) return [];

      console.log('[PlatformPhoneAssignments] Processing', twilioPhoneNumbers.length, 'numbers');

      // 1. Fetch all agents for this org
      const { data: agents } = await supabase
        .from('agents_safe')
        .select('id, name, platform, platform_agent_id, twilio_number')
        .eq('organization_id', selectedOrgId)
        .in('platform', ['elevenlabs', 'vapi', 'retell']);

      const agentsByPlatformId: Record<string, { id: string; name: string; platform: string }> = {};
      const agentsByTwilioNumber: Record<string, { id: string; name: string; platform: string }> = {};

      agents?.forEach((agent) => {
        if (agent.platform_agent_id) {
          agentsByPlatformId[agent.platform_agent_id] = {
            id: agent.id,
            name: agent.name,
            platform: agent.platform,
          };
        }
        if (agent.twilio_number) {
          const normalized = normalizePhoneNumber(agent.twilio_number);
          agentsByTwilioNumber[normalized] = {
            id: agent.id,
            name: agent.name,
            platform: agent.platform,
          };
        }
      });

      // 2. Try to fetch ElevenLabs phone numbers if we have an integration
      let elevenLabsPhoneNumbers: any[] = [];
      try {
        const { data: elData } = await supabase.functions.invoke('elevenlabs-phone-numbers', {
          body: { action: 'list' },
        });
        elevenLabsPhoneNumbers = elData?.phone_numbers || [];
        console.log('[PlatformPhoneAssignments] ElevenLabs phone numbers:', elevenLabsPhoneNumbers.length);
      } catch (err) {
        console.log('[PlatformPhoneAssignments] Could not fetch ElevenLabs phones:', err);
      }

      // 3. Build assignments for each Twilio number
      const assignments: PlatformPhoneAssignment[] = [];

      for (const twilioNum of twilioPhoneNumbers) {
        const normalized = normalizePhoneNumber(twilioNum.phone_number);
        let assignment: PlatformPhoneAssignment = {
          phoneNumber: normalized,
          platform: 'unknown',
          detectedFrom: 'voice_url',
        };

        // First, check our DB for explicit assignment
        const dbAgent = agentsByTwilioNumber[normalized];
        if (dbAgent) {
          assignment = {
            phoneNumber: normalized,
            platform: dbAgent.platform as PlatformPhoneAssignment['platform'],
            agentId: dbAgent.id,
            agentName: dbAgent.name,
            detectedFrom: 'db_assignment',
          };
          assignments.push(assignment);
          continue;
        }

        // Detect platform from voice_url
        const detected = detectPlatformFromUrl(twilioNum.voice_url);
        assignment.platform = detected.platform;

        // Check ElevenLabs phone numbers for this number
        if (detected.platform === 'elevenlabs' || twilioNum.voice_url?.includes('elevenlabs')) {
          const elPhone = elevenLabsPhoneNumbers.find((p: any) => {
            const elNormalized = normalizePhoneNumber(p.phone_number);
            return elNormalized === normalized;
          });

          if (elPhone?.agent_id) {
            // Find agent by platform_agent_id
            const matchedAgent = agentsByPlatformId[elPhone.agent_id];
            if (matchedAgent) {
              assignment = {
                phoneNumber: normalized,
                platform: 'elevenlabs',
                agentId: matchedAgent.id,
                agentName: matchedAgent.name,
                platformAgentId: elPhone.agent_id,
                detectedFrom: 'platform_api',
              };
            } else {
              assignment = {
                phoneNumber: normalized,
                platform: 'elevenlabs',
                platformAgentId: elPhone.agent_id,
                detectedFrom: 'platform_api',
              };
            }
          }
        }

        // For Vapi/Retell, we'd need their APIs (similar pattern)
        // For now, try to match by detected agent ID from URL
        if (detected.agentId && !assignment.agentId) {
          const matchedAgent = agentsByPlatformId[detected.agentId];
          if (matchedAgent) {
            assignment.agentId = matchedAgent.id;
            assignment.agentName = matchedAgent.name;
            assignment.platformAgentId = detected.agentId;
          }
        }

        assignments.push(assignment);
      }

      console.log('[PlatformPhoneAssignments] Final assignments:', assignments);
      return assignments;
    },
    enabled: !!selectedOrgId && twilioPhoneNumbers.length > 0,
    staleTime: 30000, // 30 seconds
  });
}
