import type { Message } from "../shared";
import { Bot, UserRound } from "lucide-react";

export function MessageBubble({ message }: { message: Message }) {
  const assistant = message.role === "assistant";
  return (
    <div className={`flex ${assistant ? "justify-start" : "justify-end"}`}>
      <div className={`max-w-full rounded-mp px-4 py-3 text-sm leading-6 shadow-sm sm:max-w-[84%] ${assistant ? "border border-slate-200 bg-white text-slate-800" : "bg-mp-navy text-white"}`}>
        <div className={`mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide ${assistant ? "text-slate-400" : "text-cyan-100"}`}>
          <span className="grid h-5 w-5 place-items-center rounded-full bg-white/10">
            {assistant ? <Bot size={12} /> : <UserRound size={12} />}
          </span>
          <span>{assistant ? "Assistant" : "Vous"}</span>
        </div>
        <p className="mp-text-wrap whitespace-pre-line">{message.content}</p>
        <p className={`mt-2 text-[11px] ${assistant ? "text-slate-400" : "text-blue-100"}`}>{new Date(message.createdAt).toLocaleTimeString()}</p>
      </div>
    </div>
  );
}
