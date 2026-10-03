import { describe, it, expect, vi } from "vitest";
import { createRefreshRegistry } from "@/lib/planipret/refreshRegistry";

describe("refreshRegistry — rafraîchissement contextuel", () => {
  it("le dernier onglet visible possède seul le geste", () => {
    const registry = createRefreshRegistry();
    const recent = vi.fn();
    const recordings = vi.fn();

    registry.register(recent);
    registry.register(recordings);
    registry.current()?.();

    expect(recordings).toHaveBeenCalledOnce();
    expect(recent).not.toHaveBeenCalled();
  });

  it("SMS → Teams → Courriels → SMS ne laisse aucun ancien callback", () => {
    const registry = createRefreshRegistry();
    const sms = vi.fn();

    let unregister = registry.register(sms);
    unregister(); // SMS becomes hidden when Teams opens.
    expect(registry.current()).toBeNull();

    // Teams and email intentionally have no pull-to-refresh owner.
    expect(registry.current()).toBeNull();

    unregister = registry.register(sms); // SMS is visible again.
    registry.current()?.();
    expect(sms).toHaveBeenCalledOnce();
    unregister();
    expect(registry.current()).toBeNull();
  });

  it("une désinscription d’onglet caché ne supprime jamais l’onglet courant", () => {
    const registry = createRefreshRegistry();
    const parent = vi.fn();
    const child = vi.fn();
    const unregisterParent = registry.register(parent);
    const unregisterChild = registry.register(child);

    unregisterParent();
    registry.current()?.();
    expect(child).toHaveBeenCalledOnce();
    expect(parent).not.toHaveBeenCalled();

    unregisterChild();
    unregisterChild();
    expect(registry.current()).toBeNull();
  });

  it("tout changement de propriétaire incrémente la génération pour libérer le spinner", () => {
    const registry = createRefreshRegistry();
    const initial = registry.generation;
    const unregister = registry.register(vi.fn());
    unregister();
    expect(registry.generation).toBe(initial + 2);
  });
});
