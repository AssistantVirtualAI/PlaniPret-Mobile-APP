/**
 * MobileEmbed — stub pour planipret-standalone
 * Dans le monorepo Lovable, cette page monte apps/ava-softphone-mobile.
 * Dans planipret-standalone, l'app mobile est le projet entier — redirection vers /mplanipret.
 */
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function MobileEmbed() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate("/mplanipret", { replace: true });
  }, [navigate]);
  return null;
}
