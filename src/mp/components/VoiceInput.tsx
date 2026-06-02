import { Mic } from "lucide-react";

export function VoiceInput({ onTranscript }: { onTranscript: (text: string) => void }) {
  function start() {
    const SpeechRecognition = (window as unknown as { webkitSpeechRecognition?: new () => MpSpeechRecognition }).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      onTranscript("La saisie vocale n'est pas disponible dans ce navigateur.");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = navigator.language || "fr-FR";
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? "")
        .join(" ");
      onTranscript(transcript);
    };
    recognition.start();
  }

  return (
    <button className="grid h-10 w-10 place-items-center rounded-mp border border-slate-200 bg-white text-slate-600 hover:text-mp-blue" title="Dicter une question" onClick={start}>
      <Mic size={18} />
    </button>
  );
}

interface MpSpeechRecognition extends EventTarget {
  lang: string;
  onresult: ((event: MpSpeechRecognitionEvent) => void) | null;
  start(): void;
}

interface MpSpeechRecognitionEvent {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
}
