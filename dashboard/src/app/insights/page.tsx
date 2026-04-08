'use client';

import { useState, useRef, useEffect } from 'react';
import { ChatMessage } from '@/types';
import { Send, Bot, User, Loader2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

const QUICK_PROMPTS = [
  'Gimana kondisi keuangan bulan ini?',
  'Di mana pengeluaran terbesar saya?',
  'Berikan tips hemat berdasarkan data saya',
  'Bandingkan pemasukan vs pengeluaran',
  'Kategori mana yang paling boros?',
  'Apakah saya sudah on track dengan budget?',
];

export default function InsightsPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: 'Halo! Saya asisten keuangan kamu 👋\n\nSaya sudah punya akses ke data transaksi, saldo, dan kategori pengeluaran bulan ini. Mau tanya apa?',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;

    const userMessage: ChatMessage = { role: 'user', content: text.trim() };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
        }),
      });

      const data = await res.json();
      if (data.message) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.message }]);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: 'Maaf, terjadi kesalahan. Coba lagi ya.' }]);
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Gagal terhubung ke server. Pastikan koneksi internet kamu.' }]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="px-6 py-5 border-b border-border bg-background flex-shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-violet-500" />
          <h1 className="text-xl font-bold text-foreground">Insights AI</h1>
        </div>
        <p className="text-muted-foreground text-sm mt-1">Tanya apa saja tentang keuangan kamu</p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {/* Quick prompts — show only when only 1 message */}
        {messages.length === 1 && (
          <div className="grid grid-cols-2 gap-2 mb-4">
            {QUICK_PROMPTS.map((prompt) => (
              <Button
                key={prompt}
                variant="outline"
                size="sm"
                onClick={() => sendMessage(prompt)}
                className="text-left text-xs h-auto py-2.5 justify-start whitespace-normal"
              >
                {prompt}
              </Button>
            ))}
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={cn(
              'flex gap-3 max-w-3xl',
              msg.role === 'user' ? 'ml-auto flex-row-reverse' : ''
            )}
          >
            {/* Avatar */}
            <div className={cn(
              'w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5',
              msg.role === 'user' ? 'bg-blue-600' : 'bg-violet-100'
            )}>
              {msg.role === 'user'
                ? <User className="h-3.5 w-3.5 text-white" />
                : <Bot className="h-3.5 w-3.5 text-violet-600" />
              }
            </div>

            {/* Bubble */}
            <div
              className={cn(
                'rounded-2xl px-4 py-3 text-sm leading-relaxed max-w-lg whitespace-pre-wrap',
                msg.role === 'user'
                  ? 'bg-blue-600 text-white rounded-tr-sm'
                  : 'bg-card border border-border text-foreground rounded-tl-sm'
              )}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {/* Loading indicator */}
        {loading && (
          <div className="flex gap-3 max-w-3xl">
            <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 bg-violet-100">
              <Bot className="h-3.5 w-3.5 text-violet-600" />
            </div>
            <Card className="rounded-2xl rounded-tl-sm px-4 py-3">
              <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />
            </Card>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex-shrink-0 border-t border-border bg-background px-6 py-4">
        <form onSubmit={handleSubmit} className="flex items-end gap-3">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Tanya tentang keuangan kamu... (Enter untuk kirim)"
            rows={1}
            className="flex-1 resize-none rounded-xl border border-input bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring max-h-32 text-foreground placeholder:text-muted-foreground"
            style={{ minHeight: '44px' }}
            disabled={loading}
          />
          <Button
            type="submit"
            disabled={!input.trim() || loading}
            className="p-3 bg-violet-600 hover:bg-violet-700 text-white rounded-xl flex-shrink-0 h-auto"
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
        <p className="text-xs text-muted-foreground mt-2 text-center">
          Powered by GPT-4o Mini · Data diambil real-time dari Supabase
        </p>
      </div>
    </div>
  );
}
