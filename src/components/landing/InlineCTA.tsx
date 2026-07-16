import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface InlineCTAProps {
  title: string;
  buttonLabel: string;
  to?: string;
}

export const InlineCTA = ({ title, buttonLabel, to = "/demo-request" }: InlineCTAProps) => {
  const navigate = useNavigate();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="py-12"
    >
      <div className="container mx-auto px-6">
        <div className="relative rounded-3xl overflow-hidden">
          {/* Gradient background */}
          <div className="absolute inset-0 bg-gradient-to-r from-primary/15 via-secondary/10 to-accent/15" />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-background/30" />

          <div className="relative flex flex-col sm:flex-row items-center justify-between gap-6 px-8 md:px-12 py-8">
            <h3 className="text-xl md:text-2xl font-bold text-center sm:text-left max-w-xl">
              {title}
            </h3>
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="shrink-0">
              <Button
                size="lg"
                className="h-12 px-8 font-semibold bg-gradient-to-r from-primary to-secondary hover:opacity-90 shadow-xl shadow-primary/25"
                onClick={() => navigate(to)}
              >
                {buttonLabel}
                <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </motion.div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
