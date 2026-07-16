import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Play, 
  Pause, 
  ChevronLeft, 
  ChevronRight,
  RotateCcw
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export interface Slide {
  title: string;
  description: string;
  icon: React.ReactNode;
  highlights?: string[];
}

interface InteractiveSlideshowProps {
  slides: Slide[];
  autoPlayInterval?: number;
  title?: string;
}

export const InteractiveSlideshow = ({ 
  slides, 
  autoPlayInterval = 4000,
  title 
}: InteractiveSlideshowProps) => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  const nextSlide = useCallback(() => {
    setCurrentSlide((prev) => (prev + 1) % slides.length);
    setProgress(0);
  }, [slides.length]);

  const prevSlide = () => {
    setCurrentSlide((prev) => (prev - 1 + slides.length) % slides.length);
    setProgress(0);
  };

  const goToSlide = (index: number) => {
    setCurrentSlide(index);
    setProgress(0);
  };

  const restart = () => {
    setCurrentSlide(0);
    setProgress(0);
    setIsPlaying(true);
  };

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    let progressInterval: ReturnType<typeof setInterval>;

    if (isPlaying) {
      progressInterval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 100) return 0;
          return prev + (100 / (autoPlayInterval / 100));
        });
      }, 100);

      interval = setInterval(() => {
        nextSlide();
      }, autoPlayInterval);
    }

    return () => {
      clearInterval(interval);
      clearInterval(progressInterval);
    };
  }, [isPlaying, autoPlayInterval, nextSlide]);

  const slide = slides[currentSlide];

  return (
    <div className="bg-card rounded-xl border overflow-hidden">
      {/* Header with controls */}
      <div className="flex items-center justify-between p-3 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setIsPlaying(!isPlaying)}
          >
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={restart}
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
          {title && (
            <span className="text-sm font-medium text-muted-foreground ml-2">{title}</span>
          )}
        </div>
        <Badge variant="secondary" className="text-xs">
          {currentSlide + 1} / {slides.length}
        </Badge>
      </div>

      {/* Progress bar */}
      <Progress value={progress} className="h-1 rounded-none" />

      {/* Slide content */}
      <div className="relative min-h-[280px] p-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentSlide}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
            className="space-y-4"
          >
            {/* Icon */}
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
              {slide.icon}
            </div>

            {/* Title */}
            <h3 className="text-xl font-semibold">{slide.title}</h3>

            {/* Description */}
            <p className="text-muted-foreground leading-relaxed">
              {slide.description}
            </p>

            {/* Highlights */}
            {slide.highlights && slide.highlights.length > 0 && (
              <ul className="space-y-2 pt-2">
                {slide.highlights.map((highlight, idx) => (
                  <motion.li
                    key={idx}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    className="flex items-center gap-2 text-sm"
                  >
                    <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                    <span>{highlight}</span>
                  </motion.li>
                ))}
              </ul>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Navigation arrows */}
        <Button
          variant="ghost"
          size="icon"
          className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8 opacity-70 hover:opacity-100"
          onClick={prevSlide}
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 opacity-70 hover:opacity-100"
          onClick={nextSlide}
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {/* Slide indicators */}
      <div className="flex items-center justify-center gap-2 pb-4">
        {slides.map((_, index) => (
          <button
            key={index}
            onClick={() => goToSlide(index)}
            className={`w-2 h-2 rounded-full transition-all ${
              index === currentSlide 
                ? "bg-primary w-6" 
                : "bg-muted-foreground/30 hover:bg-muted-foreground/50"
            }`}
          />
        ))}
      </div>
    </div>
  );
};
