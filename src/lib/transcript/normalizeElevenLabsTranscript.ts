/**
 * Transcript normalization utilities for ElevenLabs conversations
 * Provides consistent transcript parsing, merging, and deduplication
 */

export interface TranscriptMessage {
  role: 'agent' | 'user';
  message: string;
  time_in_call_secs?: number;
}

/**
 * Check if messages have structured timestamp data
 */
export function hasStructuredMessages(userMsgs: any[] | null, agentMsgs: any[] | null): boolean {
  const checkArray = (arr: any[] | null) => arr?.some((m: any) => 
    typeof m === 'object' && (m.timestamp !== undefined || m.time_in_call_secs !== undefined || m.time !== undefined)
  );
  return checkArray(userMsgs) || checkArray(agentMsgs);
}

/**
 * Merge structured messages with timestamps into chronological order
 */
export function mergeStructuredMessages(userMsgs: any[], agentMsgs: any[]): TranscriptMessage[] {
  const all: { role: 'agent' | 'user'; message: string; time: number }[] = [];
  
  agentMsgs?.forEach((m: any) => {
    const msg = typeof m === 'string' ? m : (m?.message || m?.text || m?.content || '');
    const time = m?.timestamp || m?.time_in_call_secs || m?.time || 0;
    if (msg.trim()) all.push({ role: 'agent', message: msg.trim(), time });
  });
  
  userMsgs?.forEach((m: any) => {
    const msg = typeof m === 'string' ? m : (m?.message || m?.text || m?.content || '');
    const time = m?.timestamp || m?.time_in_call_secs || m?.time || 0;
    if (msg.trim()) all.push({ role: 'user', message: msg.trim(), time });
  });
  
  return all
    .sort((a, b) => a.time - b.time)
    .map(m => ({ role: m.role, message: m.message, time_in_call_secs: m.time || undefined }));
}

/**
 * Merge simple messages without timestamps by interleaving (agent starts first)
 */
export function mergeSimpleMessages(userMsgs: any[], agentMsgs: any[]): TranscriptMessage[] {
  const combined: TranscriptMessage[] = [];
  const maxLen = Math.max(userMsgs?.length || 0, agentMsgs?.length || 0);
  
  for (let i = 0; i < maxLen; i++) {
    // Agent typically starts (first_message)
    if (agentMsgs && i < agentMsgs.length && agentMsgs[i]) {
      const msg = typeof agentMsgs[i] === 'string' ? agentMsgs[i] : (agentMsgs[i] as any)?.message || (agentMsgs[i] as any)?.text || '';
      if (msg.trim()) combined.push({ role: 'agent', message: msg.trim() });
    }
    if (userMsgs && i < userMsgs.length && userMsgs[i]) {
      const msg = typeof userMsgs[i] === 'string' ? userMsgs[i] : (userMsgs[i] as any)?.message || (userMsgs[i] as any)?.text || '';
      if (msg.trim()) combined.push({ role: 'user', message: msg.trim() });
    }
  }
  return combined;
}

/**
 * Parse a transcript string into structured messages
 */
export function parseTranscriptString(transcript: string): TranscriptMessage[] {
  const lines = transcript.split('\n').filter(l => l.trim());
  const messages: TranscriptMessage[] = [];
  
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    
    // Detect role from prefix patterns
    const agentPatterns = /^(agent|assistant|ai|bot):\s*/i;
    const userPatterns = /^(user|client|human|customer|caller):\s*/i;
    
    let role: 'agent' | 'user';
    let cleanMessage: string;
    
    if (agentPatterns.test(trimmed)) {
      role = 'agent';
      cleanMessage = trimmed.replace(agentPatterns, '');
    } else if (userPatterns.test(trimmed)) {
      role = 'user';
      cleanMessage = trimmed.replace(userPatterns, '');
    } else {
      // Use context from previous message or default
      role = messages.length > 0 && messages[messages.length - 1].role === 'agent' ? 'user' : 'agent';
      cleanMessage = trimmed;
    }
    
    if (cleanMessage.trim()) {
      messages.push({ role, message: cleanMessage.trim() });
    }
  });
  
  return messages;
}

/**
 * Remove consecutive duplicate messages (same role + same content)
 */
export function deduplicateMessages(messages: TranscriptMessage[]): TranscriptMessage[] {
  return messages.filter((msg, idx, arr) => {
    if (idx === 0) return true;
    const prev = arr[idx - 1];
    // Remove if same role and same message content
    return !(prev.role === msg.role && prev.message === msg.message);
  });
}

/**
 * Normalize transcript from any conversation format (ElevenLabs, Retell, Vapi)
 * Returns a clean, deduplicated array of messages in chronological order
 */
export function normalizeTranscript(conversationData: {
  metadata?: any;
  user_messages?: any[] | null;
  agent_messages?: any[] | null;
  transcript?: string | any[] | null;
  transcript_object?: any[] | null;
  platform?: string;
}): TranscriptMessage[] {
  if (!conversationData) return [];

  const meta = conversationData.metadata as any;
  let messages: TranscriptMessage[] = [];
  
  // Priority 0: Retell's transcript_object (structured array from Retell API)
  if (conversationData.transcript_object && Array.isArray(conversationData.transcript_object)) {
    messages = conversationData.transcript_object
      .map((msg: any) => ({
        role: (msg.role === 'agent' || msg.role === 'assistant') ? 'agent' as const : 'user' as const,
        message: (msg.message || msg.content || msg.text || '').trim(),
        time_in_call_secs: msg.time_in_call_secs || msg.words?.[0]?.start || undefined
      }))
      .filter((msg: TranscriptMessage) => msg.message.length > 0);
  }
  // Priority 1: metadata.transcript (structured, most reliable from ElevenLabs)
  else if (meta?.transcript && Array.isArray(meta.transcript)) {
    messages = meta.transcript
      .map((msg: any) => ({
        role: (msg.role === 'agent' || msg.role === 'assistant') ? 'agent' as const : 'user' as const,
        message: (msg.message || msg.text || msg.content || '').trim(),
        time_in_call_secs: msg.time_in_call_secs || msg.timestamp || msg.time
      }))
      .filter((msg: TranscriptMessage) => msg.message.length > 0);
  }
  // Priority 2: Structured user_messages/agent_messages with timestamps
  else if (hasStructuredMessages(conversationData.user_messages || null, conversationData.agent_messages || null)) {
    messages = mergeStructuredMessages(
      conversationData.user_messages || [], 
      conversationData.agent_messages || []
    );
  }
  // Priority 3: Simple user_messages/agent_messages arrays
  else if ((conversationData.user_messages?.length || 0) > 0 || (conversationData.agent_messages?.length || 0) > 0) {
    messages = mergeSimpleMessages(
      conversationData.user_messages || [], 
      conversationData.agent_messages || []
    );
  }
  // Priority 4: Parse transcript string
  else if (conversationData.transcript && typeof conversationData.transcript === 'string') {
    messages = parseTranscriptString(conversationData.transcript);
  }
  // Priority 5: transcript is already an array
  else if (Array.isArray(conversationData.transcript)) {
    messages = conversationData.transcript
      .map((msg: any) => ({
        role: (msg.role === 'agent' || msg.role === 'assistant' || msg.speaker === 'agent') ? 'agent' as const : 'user' as const,
        message: (msg.message || msg.text || msg.content || '').trim(),
        time_in_call_secs: msg.time_in_call_secs || msg.timestamp || msg.time
      }))
      .filter((msg: TranscriptMessage) => msg.message.length > 0);
  }

  // Deduplicate consecutive identical messages
  return deduplicateMessages(messages);
}

/**
 * Convert transcript to text format for AI analysis
 */
export function transcriptToText(messages: TranscriptMessage[]): string {
  return messages.map(msg => {
    const role = msg.role === 'agent' ? 'Agent' : 'Client';
    return `${role}: ${msg.message}`;
  }).join('\n');
}

/**
 * Convert normalized transcript to audio player format
 */
export function transcriptToAudioPlayerFormat(messages: TranscriptMessage[]): Array<{
  speaker: 'agent' | 'caller';
  text: string;
  timestamp: number;
}> {
  return messages.map((msg, index) => ({
    speaker: msg.role === 'agent' ? 'agent' : 'caller',
    text: msg.message,
    timestamp: msg.time_in_call_secs ? msg.time_in_call_secs * 1000 : index * 5000,
  }));
}
