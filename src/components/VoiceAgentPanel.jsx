import React, { useState } from 'react';
import { ArrowUp, MessageSquare, Mic, MicOff, Plus, X } from 'lucide-react';

export default function VoiceAgentPanel({ listening, speaking, processing, voiceMode, messages, chatEndRef, text, setText, onSend, onToggle, onStop, onClear }) {
  const [showConversation, setShowConversation] = useState(false);
  const state = processing ? 'thinking' : speaking ? 'speaking' : listening ? 'listening' : voiceMode ? 'starting' : 'idle';
  const active = listening || voiceMode;
  const label = { idle: 'Ready when you are', starting: 'Opening your microphone', listening: "I'm listening", thinking: 'Thinking it through', speaking: 'Speaking to you' }[state];
  const hint = { idle: 'Voice starts when you open this tab. Tap the microphone to restart it.', starting: 'Your conversation will begin in a moment.', listening: 'Tell me the work to plan. End the session when you are done.', thinking: 'Working on your request. One moment.', speaking: 'I will listen again after this response.' }[state];

  return <div className={`gold-voice gold-voice-${state}`}>
    <header className="gold-voice-header">
      <div><span className="gold-voice-eyebrow">YOUR WORK ASSISTANT</span><h1>Voice Agent</h1></div>
      <button type="button" className="gold-voice-new" onClick={onClear} disabled={active || speaking || processing}><Plus size={16} /> New conversation</button>
    </header>
    <div className="gold-voice-stage">
      <div className="gold-orb-space" aria-hidden="true">
        <div className="gold-orb-aura" />
        <div className="gold-orb"><div className="gold-orb-flow gold-orb-flow-one" /><div className="gold-orb-flow gold-orb-flow-two" /><div className="gold-orb-flow gold-orb-flow-three" /><div className="gold-orb-light" /></div>
        <div className="gold-orb-shadow" />
      </div>
      <div className="gold-voice-caption" role="status" aria-live="polite"><h2>{label}</h2><p>{hint}</p></div>
    </div>
    <footer className="gold-voice-footer">
      <div className="gold-voice-controls">
        <button type="button" className={`gold-voice-control ${showConversation ? 'is-selected' : ''}`} aria-label="Show conversation and type a message" aria-expanded={showConversation} aria-controls="voice-conversation" onClick={() => setShowConversation((value) => !value)}><MessageSquare size={21} /></button>
        <button type="button" className={`gold-voice-mic ${active ? 'is-active' : ''}`} onClick={onToggle} disabled={processing || speaking} aria-label={active ? 'Stop listening and respond' : 'Start voice conversation'} aria-pressed={Boolean(active)}>{active ? <MicOff size={26} /> : <Mic size={26} />}</button>
        <button type="button" className="gold-voice-control" onClick={onStop} disabled={!active && !speaking} aria-label="End voice session and save assignments"><X size={23} /></button>
      </div>
      <span className="gold-voice-control-hint">{speaking ? 'Tap close to finish and assign the work' : processing ? 'Preparing your response' : listening ? 'Tap the microphone to send this turn' : active ? 'Tap close to finish and assign the work' : 'Start talking'}</span>
    </footer>
    {showConversation && <aside className="gold-conversation" id="voice-conversation" aria-label="Conversation">
      <div className="gold-conversation-head"><h2>Conversation</h2><button type="button" aria-label="Close conversation" onClick={() => setShowConversation(false)}><X size={19} /></button></div>
      <div className="gold-conversation-messages" aria-live="polite">{messages.map((message) => <div key={message.id} className={`gold-message gold-message-${message.role}`}><span>{message.role === 'assistant' ? 'Voice Agent' : 'You'}</span><p>{message.text}</p></div>)}<div ref={chatEndRef} /></div>
      <form className="gold-conversation-input" onSubmit={(event) => { event.preventDefault(); if (text.trim() && !processing) onSend(); }}><input aria-label="Message the voice agent" value={text} onChange={(event) => setText(event.target.value)} placeholder="Type a message..." /><button type="submit" aria-label="Send message" disabled={!text.trim() || processing}><ArrowUp size={20} /></button></form>
    </aside>}
  </div>;
}
