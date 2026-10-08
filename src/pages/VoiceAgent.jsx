import React from 'react';
import WorkAssignments from './WorkAssignments';
import './VoiceAgent.css';

export default function VoiceAgent({ userId }) {
  return <WorkAssignments userId={userId} mode="voice" />;
}
