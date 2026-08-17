export type SmsLike = Record<string, unknown>;

const invisibleSpacing = /[\u00a0\u2000-\u200d\u202f\u2060\ufeff]/g;

export const normalizeSmsBody = (value: unknown) =>
  String(value ?? "")
    .normalize("NFKC")
    .replace(invisibleSpacing, " ")
    .replace(/\s+/g, " ")
    .trim();

const smsBody = (message: SmsLike) =>
  message.body ?? message.message ?? message.text ?? message["message-text"] ?? "";

const smsTime = (message: SmsLike) => {
  const raw = message.timestamp ?? message.created_at ?? message.sent_at ?? message["message-datetime"];
  if (!raw) return Number.NaN;
  const normalized = typeof raw === "string" && !raw.includes("T")
    ? `${raw.replace(" ", "T")}Z`
    : raw;
  return new Date(normalized as string | number | Date).getTime();
};

const direction = (message: SmsLike, myExtension: string) => {
  const raw = String(message.direction ?? "").toLowerCase();
  if (["outbound", "out", "sent", "orig"].includes(raw)) return "out";
  if (["inbound", "in", "received", "term"].includes(raw)) return "in";
  const from = String(message.from ?? message.source ?? message["from-user-id"] ?? message["from-number"] ?? "");
  return from === myExtension || from.startsWith(`${myExtension}@`) ? "out" : "in";
};

const sourceKind = (message: SmsLike) => {
  const id = String(message.id ?? "");
  if (id.startsWith("tmp-")) return "optimistic";
  if (message.source === "local") return "local";
  return "remote";
};

const preferredMessage = (left: SmsLike, right: SmsLike, myExtension: string) => {
  const rank = (message: SmsLike) => {
    const source = sourceKind(message);
    if (source === "local" && direction(message, myExtension) === "out") return 4;
    if (source === "remote" && direction(message, myExtension) === "out") return 3;
    if (source === "local") return 2;
    if (source === "remote") return 1;
    return 0;
  };
  return rank(right) > rank(left) ? right : left;
};

const areCopies = (left: SmsLike, right: SmsLike, myExtension: string) => {
  const leftBody = normalizeSmsBody(smsBody(left));
  const rightBody = normalizeSmsBody(smsBody(right));
  if (!leftBody || leftBody !== rightBody) return false;

  const leftTime = smsTime(left);
  const rightTime = smsTime(right);
  if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime) || Math.abs(leftTime - rightTime) >= 5 * 60_000) return false;

  const leftSource = sourceKind(left);
  const rightSource = sourceKind(right);
  if (leftSource !== rightSource && (leftSource !== "remote" || rightSource !== "remote")) return true;

  // NetSapiens exposes the same outbound SMS as an `orig` row and a `term` echo.
  return direction(left, myExtension) !== direction(right, myExtension);
};

export const dedupeSmsMessages = <T extends SmsLike>(messages: T[], myExtension: string): T[] => {
  const kept: T[] = [];
  for (const message of messages) {
    const index = kept.findIndex((candidate) => areCopies(candidate, message, myExtension));
    if (index === -1) kept.push(message);
    else kept[index] = preferredMessage(kept[index], message, myExtension) as T;
  }
  return kept;
};