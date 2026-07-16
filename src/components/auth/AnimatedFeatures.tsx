import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  BarChart3, 
  Bot, 
  MessageSquare, 
  BookOpen, 
  Plug,
  Shield,
  Zap,
  TrendingUp
} from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';

export const AnimatedFeatures = () => {
  const { t } = useTranslation();
  const [currentFeature, setCurrentFeature] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const features = [
    {
      icon: BarChart3,
      title: t('auth.features.realTimeAnalytics.title'),
      description: t('auth.features.realTimeAnalytics.description'),
      color: 'from-blue-500 to-cyan-500',
      bgColor: 'bg-blue-500/20',
    },
    {
      icon: Bot,
      title: t('auth.features.aiAgents.title'),
      description: t('auth.features.aiAgents.description'),
      color: 'from-purple-500 to-pink-500',
      bgColor: 'bg-purple-500/20',
    },
    {
      icon: MessageSquare,
      title: t('auth.features.conversationManagement.title'),
      description: t('auth.features.conversationManagement.description'),
      color: 'from-emerald-500 to-teal-500',
      bgColor: 'bg-emerald-500/20',
    },
    {
      icon: BookOpen,
      title: t('auth.features.knowledgeBase.title'),
      description: t('auth.features.knowledgeBase.description'),
      color: 'from-orange-500 to-amber-500',
      bgColor: 'bg-orange-500/20',
    },
    {
      icon: Plug,
      title: t('auth.features.integrations.title'),
      description: t('auth.features.integrations.description'),
      color: 'from-pink-500 to-rose-500',
      bgColor: 'bg-pink-500/20',
    },
  ];

  useEffect(() => {
    if (isPaused) return;
    
    const interval = setInterval(() => {
      setCurrentFeature((prev) => (prev + 1) % features.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [features.length, isPaused]);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left - rect.width / 2) / rect.width;
    const y = (e.clientY - rect.top - rect.height / 2) / rect.height;
    setMousePosition({ x: x * 20, y: y * 20 });
  };

  const handleFeatureClick = (index: number) => {
    setCurrentFeature(index);
    setIsPaused(true);
    setTimeout(() => setIsPaused(false), 8000);
  };

  const current = features[currentFeature];

  return (
    <div 
      ref={containerRef}
      className="relative h-full w-full overflow-hidden"
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Animated background gradient */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentFeature}
          initial={{ opacity: 0, scale: 1.1 }}
          animate={{ opacity: 0.4, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.8, ease: "easeInOut" }}
          className={`absolute inset-0 bg-gradient-to-br ${current.color}`}
          style={{
            transform: `translate(${mousePosition.x}px, ${mousePosition.y}px)`,
          }}
        />
      </AnimatePresence>

      {/* Floating icons with interactivity */}
      <div className="absolute inset-0">
        {features.map((feature, index) => {
          const Icon = feature.icon;
          const angle = (index * 72 - 90) * (Math.PI / 180);
          const radius = 180;
          const x = Math.cos(angle) * radius;
          const y = Math.sin(angle) * radius;
          const isActive = index === currentFeature;
          
          return (
            <motion.div
              key={index}
              className="absolute left-1/2 top-1/2 cursor-pointer group"
              initial={false}
              animate={{
                x: x + mousePosition.x * 0.5,
                y: y + mousePosition.y * 0.5,
                scale: isActive ? 1.3 : 1,
                opacity: isActive ? 1 : 0.5,
              }}
              whileHover={{ scale: isActive ? 1.4 : 1.2, opacity: 1 }}
              transition={{ 
                type: "spring", 
                stiffness: 300, 
                damping: 20,
                duration: 0.3
              }}
              onClick={() => handleFeatureClick(index)}
            >
              <motion.div
                className={`${feature.bgColor} p-4 rounded-2xl backdrop-blur-sm border border-white/10 relative`}
                animate={{
                  boxShadow: isActive 
                    ? '0 0 30px rgba(255,255,255,0.3)' 
                    : '0 0 10px rgba(255,255,255,0.1)',
                }}
              >
                <Icon className="w-8 h-8 text-white" />
                
                {/* Tooltip on hover */}
                <div className="absolute -bottom-12 left-1/2 -translate-x-1/2 bg-black/80 backdrop-blur-sm px-3 py-1.5 rounded-lg whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                  <span className="text-xs text-white font-medium">{feature.title}</span>
                </div>
              </motion.div>
              
              {/* Pulse animation for active icon */}
              {isActive && (
                <motion.div
                  className={`absolute inset-0 ${feature.bgColor} rounded-2xl`}
                  initial={{ scale: 1, opacity: 0.5 }}
                  animate={{ scale: 1.5, opacity: 0 }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                />
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Center content with parallax */}
      <motion.div 
        className="absolute inset-0 flex flex-col items-center justify-center p-8"
        style={{
          transform: `translate(${mousePosition.x * 0.3}px, ${mousePosition.y * 0.3}px)`,
        }}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={currentFeature}
            initial={{ opacity: 0, y: 30, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -30, scale: 0.9 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="text-center max-w-md"
          >
            <motion.div
              className={`inline-flex p-5 rounded-3xl bg-gradient-to-br ${current.color} mb-6 shadow-2xl`}
              whileHover={{ scale: 1.1, rotate: 5 }}
              transition={{ type: "spring", stiffness: 400 }}
            >
              <current.icon className="w-12 h-12 text-white" />
            </motion.div>
            
            <motion.h3 
              className="text-2xl font-bold text-white mb-3"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
            >
              {current.title}
            </motion.h3>
            
            <motion.p 
              className="text-white/70 text-base leading-relaxed"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              {current.description}
            </motion.p>
          </motion.div>
        </AnimatePresence>
      </motion.div>

      {/* Progress indicators */}
      <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 flex gap-3">
        {features.map((_, index) => (
          <motion.button
            key={index}
            onClick={() => handleFeatureClick(index)}
            className={`relative h-2 rounded-full transition-all duration-300 ${
              index === currentFeature ? 'w-10 bg-white' : 'w-2 bg-white/30 hover:bg-white/50'
            }`}
            whileHover={{ scale: 1.2 }}
            whileTap={{ scale: 0.9 }}
          >
            {index === currentFeature && !isPaused && (
              <motion.div
                className="absolute inset-0 bg-white/50 rounded-full"
                initial={{ scaleX: 0, originX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 4, ease: "linear" }}
              />
            )}
          </motion.button>
        ))}
      </div>

      {/* Bottom stats */}
      <div className="absolute bottom-20 left-1/2 transform -translate-x-1/2 flex gap-8">
        {[
          { icon: Shield, label: t('auth.features.stats.secure') },
          { icon: Zap, label: t('auth.features.stats.fast') },
          { icon: TrendingUp, label: t('auth.features.stats.scalable') },
        ].map((stat, index) => (
          <motion.div
            key={index}
            className="flex items-center gap-2 text-white/60 hover:text-white/90 transition-colors cursor-default"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 + index * 0.1 }}
            whileHover={{ scale: 1.1 }}
          >
            <stat.icon className="w-4 h-4" />
            <span className="text-sm font-medium">{stat.label}</span>
          </motion.div>
        ))}
      </div>

      {/* Pause indicator */}
      <AnimatePresence>
        {isPaused && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute top-4 right-4 text-white/40 text-xs flex items-center gap-1"
          >
            <div className="w-1.5 h-1.5 bg-white/40 rounded-full" />
            <div className="w-1.5 h-1.5 bg-white/40 rounded-full" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
