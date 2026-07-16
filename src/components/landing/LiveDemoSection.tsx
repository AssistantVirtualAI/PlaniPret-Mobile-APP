import { useEffect, useRef, useState } from "react";
import { motion, useInView } from "framer-motion";
import { Bot, User, Zap, MessageSquare, Star, ArrowRight, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AnimatedCounter } from "@/components/ui/animated-counter";
import { useTranslation } from "@/hooks/useTranslation";
import { useNavigate } from "react-router-dom";

interface ChatMessage {
  role: "user" | "agent";
  text: string;
}

const CHAT_SCRIPT: ChatMessage[] = [
  { role: "user", text: "Hi, I'd like to reschedule my appointment" },
  { role: "agent", text: "Of course! I can help you with that. What date works best for you?" },
  { role: "user", text: "Next Tuesday at 3pm?" },
  { role: "agent", text: "Perfect — I've updated your appointment to Tuesday at 3:00 PM. You'll receive a confirmation email shortly. Is there anything else I can help you with?" },
  { role: "user", text: "No, that's all. Thanks!" },
  { role: "agent", text: "Happy to help! Have a great day. 😊" },
];

const CHAT_SCRIPT_FR: ChatMessage[] = [
  { role: "user", text: "Bonjour, je souhaite reprogrammer mon rendez-vous" },
  { role: "agent", text: "Bien sûr ! Je peux vous aider avec ça. Quelle date vous convient le mieux ?" },
  { role: "user", text: "Mardi prochain à 15h ?" },
  { role: "agent", text: "Parfait — votre rendez-vous a été mis à jour pour mardi à 15h00. Vous recevrez un email de confirmation. Puis-je vous aider pour autre chose ?" },
  { role: "user", text: "Non, c'est tout. Merci !" },
  { role: "agent", text: "Avec plaisir ! Bonne journée. 😊" },
];

const TypingIndicator = () => (
  <div className="flex gap-1 items-center px-3 py-2">
    {[0, 1, 2].map((i) => (
      <motion.div
        key={i}
        className="w-2 h-2 rounded-full bg-primary"
        animate={{ y: [0, -5, 0] }}
        transition={{ duration: 0.6, delay: i * 0.15, repeat: Infinity }}
      />
    ))}
  </div>
);

export const LiveDemoSection = () => {
  const { t, language } = useTranslation();
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: false, margin: "-100px" });
  const scrollRef = useRef<HTMLDivElement>(null);

  const [visibleMessages, setVisibleMessages] = useState<ChatMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isDone, setIsDone] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);

  const script = language === "fr" ? CHAT_SCRIPT_FR : CHAT_SCRIPT;

  const runScript = () => {
    setVisibleMessages([]);
    setCurrentIndex(0);
    setIsDone(false);
    setIsTyping(false);
    setHasStarted(true);
  };

  useEffect(() => {
    if (isInView && !hasStarted) {
      const timer = setTimeout(runScript, 500);
      return () => clearTimeout(timer);
    }
  }, [isInView, hasStarted]);

  useEffect(() => {
    if (!hasStarted || currentIndex >= script.length) {
      if (currentIndex >= script.length && hasStarted) setIsDone(true);
      return;
    }

    const msg = script[currentIndex];
    const delay = msg.role === "agent" ? 900 : 500;

    if (msg.role === "agent") {
      setIsTyping(true);
      const typingTimer = setTimeout(() => {
        setIsTyping(false);
        setVisibleMessages((prev) => [...prev, msg]);
        setCurrentIndex((i) => i + 1);
      }, delay + 800);
      return () => clearTimeout(typingTimer);
    } else {
      const timer = setTimeout(() => {
        setVisibleMessages((prev) => [...prev, msg]);
        setCurrentIndex((i) => i + 1);
      }, delay);
      return () => clearTimeout(timer);
    }
  }, [currentIndex, hasStarted, script]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [visibleMessages, isTyping]);

  return (
    <section className="py-20 px-4 bg-background relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-primary/5 rounded-full blur-3xl" />
      </div>

      <div className="container mx-auto max-w-6xl relative" ref={ref}>
        {/* Header */}
        <motion.div
          className="text-center mb-14"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <Badge variant="outline" className="mb-4 border-primary/30 text-primary bg-primary/5 px-4 py-1.5">
            {t("liveDemo.badge")}
          </Badge>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            {t("liveDemo.title")}
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            {t("liveDemo.subtitle")}
          </p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          {/* Chat Panel */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="rounded-2xl border border-border bg-card shadow-xl overflow-hidden"
          >
            {/* Chat header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-muted/30">
              <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center">
                <Bot className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-foreground text-sm">AVA Agent</p>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-xs text-muted-foreground">{t("liveDemo.online")}</span>
                </div>
              </div>
              <div className="ml-auto">
                <button
                  onClick={runScript}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  {t("liveDemo.replay")}
                </button>
              </div>
            </div>

            {/* Messages */}
            <div
              ref={scrollRef}
              className="h-72 overflow-y-auto p-4 space-y-3 scroll-smooth"
            >
              {visibleMessages.map((msg, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {msg.role === "agent" && (
                    <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0 mt-1">
                      <Bot className="w-3.5 h-3.5 text-primary" />
                    </div>
                  )}
                  <div
                    className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground rounded-tr-sm"
                        : "bg-muted text-foreground rounded-tl-sm"
                    }`}
                  >
                    {msg.text}
                  </div>
                  {msg.role === "user" && (
                    <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center flex-shrink-0 mt-1">
                      <User className="w-3.5 h-3.5 text-secondary-foreground" />
                    </div>
                  )}
                </motion.div>
              ))}

              {isTyping && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex gap-2 justify-start"
                >
                  <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0">
                    <Bot className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <div className="bg-muted rounded-2xl rounded-tl-sm">
                    <TypingIndicator />
                  </div>
                </motion.div>
              )}

              {isDone && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex justify-center pt-2"
                >
                  <span className="text-xs text-muted-foreground bg-muted px-3 py-1 rounded-full">
                    {t("liveDemo.conversationEnded")}
                  </span>
                </motion.div>
              )}
            </div>

            {/* CTA */}
            <div className="px-5 py-4 border-t border-border bg-muted/20">
              <Button
                className="w-full gap-2"
                onClick={() => navigate("/demo-request")}
              >
                {t("liveDemo.cta")}
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </motion.div>

          {/* Metrics Panel */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, delay: 0.15 }}
            className="space-y-5"
          >
            <div className="rounded-2xl border border-border bg-card p-6 shadow-lg">
              <h3 className="font-semibold text-foreground mb-5 text-base">{t("liveDemo.metricsTitle")}</h3>
              <div className="space-y-6">
                {/* Response Time */}
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Zap className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground mb-0.5">{t("liveDemo.metric1Label")}</p>
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-bold text-foreground">
                        <AnimatedCounter value={0.8} decimals={1} />
                      </span>
                      <span className="text-sm text-muted-foreground">{t("liveDemo.metric1Unit")}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 bg-muted rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-primary rounded-full"
                        initial={{ width: 0 }}
                        whileInView={{ width: "12%" }}
                        viewport={{ once: true }}
                        transition={{ duration: 1.2, delay: 0.5 }}
                      />
                    </div>
                  </div>
                </div>

                {/* Conversations */}
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <MessageSquare className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground mb-0.5">{t("liveDemo.metric2Label")}</p>
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-bold text-foreground">
                        <AnimatedCounter value={3247} />
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 bg-muted rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-primary rounded-full"
                        initial={{ width: 0 }}
                        whileInView={{ width: "82%" }}
                        viewport={{ once: true }}
                        transition={{ duration: 1.4, delay: 0.6 }}
                      />
                    </div>
                  </div>
                </div>

                {/* Satisfaction */}
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Star className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground mb-0.5">{t("liveDemo.metric3Label")}</p>
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-bold text-foreground">
                        <AnimatedCounter value={94.2} decimals={1} />
                      </span>
                      <span className="text-sm text-muted-foreground">%</span>
                    </div>
                    <div className="mt-1.5 h-1.5 bg-muted rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-primary rounded-full"
                        initial={{ width: 0 }}
                        whileInView={{ width: "94%" }}
                        viewport={{ once: true }}
                        transition={{ duration: 1.6, delay: 0.7 }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Live indicator */}
            <motion.div
              className="rounded-2xl border border-primary/20 bg-primary/5 p-5"
              animate={{ borderColor: ["hsl(var(--primary) / 0.2)", "hsl(var(--primary) / 0.5)", "hsl(var(--primary) / 0.2)"] }}
              transition={{ duration: 3, repeat: Infinity }}
            >
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                  <motion.div
                    className="absolute inset-0 rounded-full bg-green-500"
                    animate={{ scale: [1, 2, 1], opacity: [0.8, 0, 0.8] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{t("liveDemo.liveLabel")}</p>
                  <p className="text-xs text-muted-foreground">{t("liveDemo.liveDesc")}</p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};
