import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";

export type GalleryImage = {
  url: string;
  alt: string;
  caption?: string;
};

type Props = {
  images: GalleryImage[];
  accent: string;
  titleFr?: string;
  titleEn?: string;
};

export const CaseStudyGallery = ({
  images,
  accent,
  titleFr = "Galerie visuelle",
  titleEn = "Visual gallery",
}: Props) => {
  const { language } = useLanguage();
  const isEn = language === "en";
  const [open, setOpen] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const stripRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setOpen(null);
    setZoom(1);
  }, []);

  const next = useCallback(() => {
    setOpen((i) => (i === null ? i : (i + 1) % images.length));
    setZoom(1);
  }, [images.length]);

  const prev = useCallback(() => {
    setOpen((i) => (i === null ? i : (i - 1 + images.length) % images.length));
    setZoom(1);
  }, [images.length]);

  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === "+" || e.key === "=") setZoom((z) => Math.min(3, z + 0.25));
      else if (e.key === "-" || e.key === "_") setZoom((z) => Math.max(1, z - 0.25));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close, next, prev]);

  useEffect(() => {
    if (open !== null) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [open]);

  const scrollStrip = (dir: 1 | -1) => {
    stripRef.current?.scrollBy({ left: dir * 320, behavior: "smooth" });
  };

  return (
    <section className="relative py-20">
      <div className="container mx-auto px-6">
        <div className="flex items-end justify-between mb-8">
          <h3 className="text-2xl md:text-4xl font-bold text-white">
            {isEn ? titleEn : titleFr}
          </h3>
          <div className="hidden md:flex gap-2">
            <button
              onClick={() => scrollStrip(-1)}
              aria-label="Previous"
              className="w-10 h-10 rounded-full flex items-center justify-center backdrop-blur-xl transition-colors hover:brightness-125"
              style={{ background: "rgba(13,31,53,0.6)", border: `1px solid ${accent}44` }}
            >
              <ChevronLeft className="w-5 h-5 text-white" />
            </button>
            <button
              onClick={() => scrollStrip(1)}
              aria-label="Next"
              className="w-10 h-10 rounded-full flex items-center justify-center backdrop-blur-xl transition-colors hover:brightness-125"
              style={{ background: "rgba(13,31,53,0.6)", border: `1px solid ${accent}44` }}
            >
              <ChevronRight className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>

        <div
          ref={stripRef}
          className="flex gap-5 overflow-x-auto snap-x snap-mandatory pb-4 -mx-6 px-6"
          style={{ scrollbarWidth: "thin" }}
        >
          {images.map((img, i) => (
            <motion.button
              key={img.url + i}
              onClick={() => setOpen(i)}
              whileHover={{ y: -6 }}
              className="relative flex-none w-[280px] md:w-[380px] snap-start rounded-2xl overflow-hidden group"
              style={{
                border: `1px solid ${accent}33`,
                boxShadow: `0 20px 60px -30px ${accent}66`,
              }}
            >
              <img
                src={img.url}
                alt={img.alt}
                loading="lazy"
                className="w-full h-64 md:h-72 object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <div
                className="absolute inset-0 flex items-end p-4 opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ background: "linear-gradient(0deg, rgba(0,0,0,0.7), transparent 60%)" }}
              >
                <div className="text-white text-sm font-semibold">
                  {img.caption ?? img.alt}
                </div>
              </div>
              <div
                className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center backdrop-blur-xl opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ background: "rgba(0,0,0,0.5)" }}
              >
                <ZoomIn className="w-4 h-4 text-white" />
              </div>
            </motion.button>
          ))}
        </div>
      </div>

      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {open !== null && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[9999] flex items-center justify-center"
                style={{ background: "rgba(0,0,0,0.9)" }}
                onClick={close}
              >
                <button
                  onClick={close}
                  aria-label="Close"
                  className="absolute top-4 right-4 w-11 h-11 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 text-white"
                >
                  <X className="w-5 h-5" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    prev();
                  }}
                  aria-label="Previous image"
                  className="absolute left-4 md:left-8 w-12 h-12 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 text-white"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    next();
                  }}
                  aria-label="Next image"
                  className="absolute right-4 md:right-8 w-12 h-12 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 text-white"
                >
                  <ChevronRight className="w-6 h-6" />
                </button>
                <div
                  className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => setZoom((z) => Math.max(1, z - 0.25))}
                    aria-label="Zoom out"
                    className="w-10 h-10 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 text-white"
                  >
                    <ZoomOut className="w-4 h-4" />
                  </button>
                  <div className="px-4 py-2 rounded-full bg-white/10 text-white text-xs font-semibold flex items-center">
                    {Math.round(zoom * 100)}%
                  </div>
                  <button
                    onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
                    aria-label="Zoom in"
                    className="w-10 h-10 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 text-white"
                  >
                    <ZoomIn className="w-4 h-4" />
                  </button>
                </div>
                <motion.img
                  key={open}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.25 }}
                  src={images[open].url}
                  alt={images[open].alt}
                  onClick={(e) => e.stopPropagation()}
                  className="max-h-[85vh] max-w-[92vw] object-contain rounded-lg select-none cursor-zoom-in"
                  style={{ transform: `scale(${zoom})`, transition: "transform 0.2s ease" }}
                />
                {images[open].caption && (
                  <div className="absolute top-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-white/10 text-white text-sm">
                    {images[open].caption}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </section>
  );
};
