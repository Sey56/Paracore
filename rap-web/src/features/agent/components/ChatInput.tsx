import React, { useRef, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPaperPlane } from '@fortawesome/free-solid-svg-icons';

interface ChatInputProps {
  input: string;
  setInput: (val: string) => void;
  onSend: () => void;
}

export const ChatInput: React.FC<ChatInputProps> = ({ input, setInput, onSend }) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`;
    }
  }, [input]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <div className="px-4 py-2 bg-transparent z-20 max-w-4xl mx-auto w-full">
      <form onSubmit={(e) => { e.preventDefault(); onSend(); }} className="flex items-end space-x-3">
        <div className="flex-1 bg-[var(--bg-panel)] rounded-2xl border border-[var(--border)]/30 focus-within:border-[var(--accent)]/50 transition-colors shadow-sm overflow-hidden flex items-center">
          <textarea ref={textareaRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown}
            placeholder="What do you want to automate today?"
            className="w-full bg-transparent px-4 py-3 text-[13.5px] focus:outline-none text-[var(--text-primary)] placeholder-[var(--text-secondary)]/50 font-medium resize-none min-h-[44px] max-h-[250px] custom-scrollbar leading-relaxed"
            disabled={false} rows={1} />
        </div>
        <button type="submit" disabled={!input.trim()}
          className="w-[46px] h-[46px] shrink-0 bg-[var(--accent)] text-white rounded-[14px] hover:opacity-90 transition-all disabled:opacity-30 disabled:hover:opacity-30 flex items-center justify-center shadow-lg active:scale-95">
          <FontAwesomeIcon icon={faPaperPlane} className="text-sm shadow-sm" />
        </button>
      </form>
      <div className="text-center mt-2 opacity-50 text-[10px] text-[var(--text-secondary)]">
        Shift+Enter for new line • Press Enter to send
      </div>
    </div>
  );
};
