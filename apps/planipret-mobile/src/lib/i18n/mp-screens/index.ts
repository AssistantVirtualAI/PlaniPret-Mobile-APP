import { connectionsFr, connectionsEn } from "./connections";
import { sipFr, sipEn } from "./sip";
import { avaFr, avaEn } from "./ava";
import { insightsFr, insightsEn } from "./insights";
import { coreFr, coreEn } from "./core";

export const SCREENS_FR = {
  ...connectionsFr,
  ...sipFr,
  ...avaFr,
  ...insightsFr,
  ...coreFr,
} as Record<string, any>;

export const SCREENS_EN = {
  ...connectionsEn,
  ...sipEn,
  ...avaEn,
  ...insightsEn,
  ...coreEn,
} as Record<string, any>;
