import { MyAIChat } from "@/components/ai/MyAIChat";

export default function AIAssistant() {
  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">AVA AI Assistant</h1>
        <p className="text-sm text-muted-foreground">Ask AVA about your calls, voicemails, recordings, or have it set up your voicemail greeting using ElevenLabs.</p>
      </div>
      <MyAIChat embedded />
    </div>
  );
}
