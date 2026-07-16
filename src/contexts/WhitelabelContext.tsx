import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  WhitelabelConfig,
  applyWhitelabel,
  getDefaultWhitelabel,
  loadWhitelabel,
} from "@/lib/whitelabel";

interface Ctx {
  config: WhitelabelConfig;
  loading: boolean;
  refresh: () => Promise<void>;
}

const WhitelabelContext = createContext<Ctx>({
  config: getDefaultWhitelabel(),
  loading: false,
  refresh: async () => {},
});

export const WhitelabelProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { slug } = useParams();
  const [config, setConfig] = useState<WhitelabelConfig>(getDefaultWhitelabel());
  const [loading, setLoading] = useState(false);

  const load = async () => {
    const host = window.location.hostname;
    let resolved = slug || "";
    // Custom domain resolution: lookup org by brand_portal_domain
    if (!resolved && host && !/^(localhost|.*\.lovable\.app|.*\.lovable\.dev|avastatistic\.ca)$/i.test(host)) {
      try {
        const { supabase } = await import("@/integrations/supabase/client");
        const { data } = await supabase
          .from("organizations")
          .select("slug")
          .eq("brand_portal_domain", host)
          .maybeSingle();
        if (data?.slug) resolved = data.slug;
      } catch {}
    }
    if (!resolved) {
      const def = getDefaultWhitelabel();
      setConfig(def);
      applyWhitelabel(def);
      return;
    }
    setLoading(true);
    try {
      const cfg = await loadWhitelabel(resolved);
      setConfig(cfg);
      applyWhitelabel(cfg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const value = useMemo(() => ({ config, loading, refresh: load }), [config, loading]);
  return <WhitelabelContext.Provider value={value}>{children}</WhitelabelContext.Provider>;
};

export const useWhitelabel = () => useContext(WhitelabelContext);

export const useFeatureFlag = (key: keyof WhitelabelConfig["features"]): boolean => {
  const { config } = useWhitelabel();
  return Boolean(config.features?.[key]);
};
