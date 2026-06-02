import type { Message } from "../shared";
import { Bot, User } from "lucide-react";
import { motion } from "framer-motion";

export function MessageBubble({ message }: { message: Message }) {
  const isAssistant = message.role === "assistant";

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`group flex gap-3 ${isAssistant ? "" : "flex-row-reverse"}`}
    >
      <div
        className={`grid size-8 shrink-0 place-items-center rounded-full text-xs font-semibold shadow-sm ${
          isAssistant
            ? "bg-gradient-to-br from-primary to-primary/70 text-primary-foreground ring-1 ring-primary/20"
            : "bg-muted text-foreground ring-1 ring-border"
        }`}
      >
        {isAssistant ? <Bot className="size-4" /> : <User className="size-4" />}
      </div>

      <div className={`flex min-w-0 max-w-[calc(100%-3rem)] flex-col gap-1 ${isAssistant ? "items-start" : "items-end"}`}>
        <div
          className={`mp-text-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
            isAssistant
              ? "rounded-tl-sm bg-muted/60 text-foreground"
              : "rounded-tr-sm bg-primary text-primary-foreground shadow-soft"
          }`}
        >
          <div className="whitespace-pre-line">{message.content}</div>
        </div>
        <span className="px-1 text-[10px] text-muted-foreground opacity-0 transition group-hover:opacity-100">
          {new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
    </motion.div>
  );
}
