import { type ReactNode } from "react";
import "./transcriptConversation.css";
import { parseSipSpeaker, resolveSpeakerName, unescapeTranscript, useSpeakerCtx } from "./transcriptSpeakers";

export type TranscriptTurn = { speaker?: string | null; text: string; start?: number | null };

export function normalizeTranscriptTurns(segments: TranscriptTurn[] | null | undefined, transcript?: string | null): TranscriptTurn[] {
  const source = segments?.length ? segments : (transcript ?? "").split(/\r?\n/).filter((line) => line.trim()).map((line) => {
    const sip = line.match(/^\s*(<?sips?:[^\s:]+(?::\d+)?>?):\s*(.+)$/i);
    if (sip) return { speaker: sip[1], text: sip[2] };
    const match = line.match(/^\s*((?:speaker|intervenant|locuteur)[ _-]*\d+|agent|broker|courtier|client|customer|[AB]):\s*(.+)$/i);
    return match ? { speaker: match[1], text: match[2] } : { speaker: null, text: line };
  });
  return source.filter((s) => typeof s?.text === "string" && s.text.trim()).map((s) => ({ ...s, text: unescapeTranscript(s.text.trim()) }));
}

const speakerKey = (speaker?: string | null) => {
  const key = (speaker ?? "").trim().toLowerCase().replace(/[_-]/g, " ");
  return /^(speaker|intervenant|locuteur)?$/.test(key) || !key ? null : key;
};

export function TranscriptConversation({ turns, english = false, query = "", renderText }: {
  turns: TranscriptTurn[]; english?: boolean; query?: string; renderText?: (text: string) => ReactNode;
}) {
  const speakers = [...new Set(turns.map((s) => speakerKey(s.speaker)).filter((s): s is string => !!s))];
  const ctx = useSpeakerCtx(turns.some((t) => !!parseSipSpeaker(t.speaker)));
  const label = (turn: TranscriptTurn) => {
    const key = speakerKey(turn.speaker);
    if (!key) return english ? "Unidentified speaker" : "Intervenant non identifié";
    if (/^(agent|broker|courtier)$/.test(key)) return english ? "Broker" : "Courtier";
    if (/^(client|customer)$/.test(key)) return "Client";
    if (/^(speaker|intervenant|locuteur)[ ]*\d+$/.test(key) || /^[ab]$/.test(key)) {
      return `${english ? "Speaker" : "Intervenant"} ${speakers.indexOf(key) + 1}`;
    }
    const sipName = resolveSpeakerName(turn.speaker, ctx);
    if (sipName) return english ? sipName.replace(/^Poste /, "Ext. ") : sipName;
    return turn.speaker;
  };
  return (
    <div className="pp-transcript-conversation">
      {speakers.length < 2 && <p className="pp-transcript-notice" role="status">
        {english ? "The source does not distinguish both speakers." : "La source ne distingue pas les deux intervenants."}
      </p>}
      <ol className="pp-transcript-messages" aria-label={english ? "Call transcript" : "Transcription de l’appel"}>
        {turns.filter((s) => !query || s.text.toLowerCase().includes(query.toLowerCase())).map((turn, i) => {
          const key = speakerKey(turn.speaker);
          const index = key ? speakers.indexOf(key) : -1;
          const right = index >= 0 && index % 2 === 1;
          const time = typeof turn.start === "number" && Number.isFinite(turn.start) && turn.start >= 0
            ? `${Math.floor(turn.start / 60)}:${String(Math.floor(turn.start % 60)).padStart(2, "0")}` : null;
          const text = unescapeTranscript(turn.text);
          return <li key={i} className={`pp-transcript-message ${right ? "pp-transcript-message-right" : ""}`} data-speaker={key ?? "unknown"}>
            <div className="pp-transcript-speaker"><span className="pp-transcript-avatar" aria-hidden="true">{index < 0 ? "?" : index + 1}</span>
              <span className="pp-transcript-speaker-name">{label(turn)}</span>
              {time && <time>{time}</time>}
            </div>
            <div className="pp-transcript-bubble">{renderText ? renderText(text) : text}</div>
          </li>;
        })}
      </ol>
    </div>
  );
}
