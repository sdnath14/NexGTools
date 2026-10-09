import VoiceAgentPanel from '../components/VoiceAgentPanel';
import TaskTiming from '../components/TaskTiming';
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Edit3,
  Plus,
  Search,
  Send,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { API_BASE_URL, authHeaders } from '../auth';
import './WorkAssignments.css';

const emptyTask = { employeeId: '', title: '', quantity: 1, dueDate: '', priority: 'Medium', status: 'Pending', notes: '' };
const canRecordVoice = 'MediaRecorder' in window && navigator.mediaDevices?.getUserMedia;

const microphoneErrorDetails = (error) => {
  const name = error?.name || '';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return {
      state: 'missing',
      message: 'Windows has no microphone input available. Connect a headset with a microphone (USB, Bluetooth, or a 4-pole TRRS plug), select it in Settings > System > Sound > Input, then start voice mode again.',
    };
  }
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return {
      state: 'blocked',
      message: 'Microphone access is blocked. Allow microphone access for this site in the browser and in Windows Settings > Privacy & security > Microphone.',
    };
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return {
      state: 'busy',
      message: 'The microphone is busy or unavailable. Close other apps using it, reconnect the headset, and try again.',
    };
  }
  return { state: 'error', message: error?.message || 'The microphone could not be started.' };
};

const requestMicrophone = async () => {
  const constraints = {
    audio: {
      echoCancellation: { ideal: true },
      noiseSuppression: { ideal: true },
      autoGainControl: { ideal: true },
      channelCount: { ideal: 1 },
    },
  };
  try {
    return await navigator.mediaDevices.getUserMedia(constraints);
  } catch (error) {
    if (error?.name !== 'OverconstrainedError') throw error;
    return navigator.mediaDevices.getUserMedia({ audio: true });
  }
};

const uid = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const normalize = (value) => String(value || '').trim();
const emailDeliveryMessage = (status, task) => ({
  sent: `Email accepted for ${task.employeeEmail}.`,
  missing_email: 'Add an email address to this employee before sending the task.',
  not_configured: 'SMTP is not configured, so no email was sent.',
  rejected_spam: 'The mail server rejected this message as spam. Ask the mail administrator to allow assignment emails.',
  failed: 'Email delivery failed. Check the SMTP settings.',
}[status] || 'Email status is unavailable.');
const spokenDeliveryMessage = (task, employeeName) => {
  const email = {
    sent: `The email notification was accepted for ${employeeName}.`,
    missing_email: `I couldn't email ${employeeName} because their profile has no email address.`,
    not_configured: 'Email notifications are not set up yet.',
    rejected_spam: 'The mail server rejected the email notification.',
    failed: 'I could not send the email notification.',
  }[task.emailStatus] || '';
  const whatsapp = task.notifications?.whatsapp;
  const whatsappReply = whatsapp?.success ? 'I also sent a WhatsApp message.' : whatsapp?.error ? 'I could not send a WhatsApp message.' : '';
  return [email, whatsappReply].filter(Boolean).join(' ');
};
const welcomeMessage = { id: 'welcome', role: 'assistant', text: "Hi! I'm here to help with your team's work. Who should do what today?" };
const chatStorageKey = (userId) => `nexgtools_work_agent_chat_${userId}`;
const loadChatMessages = (userId) => {
  try {
    const saved = JSON.parse(localStorage.getItem(chatStorageKey(userId)) || '[]');
    if (Array.isArray(saved) && saved.length) return saved.filter((item) => ['user', 'assistant'].includes(item.role) && typeof item.text === 'string').slice(-30);
  } catch { /* Start a fresh conversation if saved data is invalid. */ }
  return [welcomeMessage];
};

const cleanTaskTitle = (value) => normalize(value)
  .replace(/^(?:a\s+)?task\s+(?:to\s+)?/i, '')
  .replace(/^(?:do|complete|finish|handle|work on|take care of)\s+/i, '')
  .replace(/\s+(?:by\s+)?(?:today|tomorrow|next week|in\s+\d+\s+days?)\s*$/i, '')
  .replace(/[.,!?]+$/g, '')
  .trim();

const realtimeTools = [
  {
    type: 'function',
    name: 'assign_task',
    description: 'Save a work assignment for an existing employee. Call this as soon as the employee and task are clear.',
    parameters: {
      type: 'object',
      properties: {
        employee_id: { type: 'string', description: 'The exact employee ID from the provided employee list.' },
        task_title: { type: 'string', description: 'A concise English description of the requested work.' },
        due_date: { type: 'string', description: 'Due date in YYYY-MM-DD format, or an empty string.' },
        quantity: { type: 'integer', minimum: 1 },
        priority: { type: 'string', enum: ['Low', 'Medium', 'High'] },
      },
      required: ['employee_id', 'task_title'],
    },
  },
  {
    type: 'function',
    name: 'update_task_status',
    description: 'Update the status of an existing task using its exact task ID.',
    parameters: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'The exact task ID from the provided task list.' },
        status: { type: 'string', enum: ['Pending', 'In Progress', 'Done'] },
      },
      required: ['task_id', 'status'],
    },
  },
];

export default function WorkAssignments({ userId, mode = 'tasks' }) {
  const isVoicePage = mode === 'voice';
  const [employees, setEmployees] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [taskDraft, setTaskDraft] = useState(emptyTask);
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [voiceText, setVoiceText] = useState('');
  const [chatMessages, setChatMessages] = useState(() => loadChatMessages(userId));
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [processingVoice, setProcessingVoice] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const [microphoneState, setMicrophoneState] = useState(canRecordVoice ? 'checking' : 'unsupported');
  const [syncError, setSyncError] = useState('');
  const [assignmentNotice, setAssignmentNotice] = useState('');
  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const audioContextRef = useRef(null);
  const replyAudioRef = useRef(null);
  const replyAudioUrlRef = useRef('');
  const voiceRequestRef = useRef(null);
  const silenceTimerRef = useRef(null);
  const captureTimeoutRef = useRef(null);
  const resumeTimeoutRef = useRef(null);
  const captureStartingRef = useRef(false);
  const forceSubmitRef = useRef(false);
  const voiceSessionRef = useRef(0);
  const voiceModeRef = useRef(false);
  const chatEndRef = useRef(null);
  const lastEmployeeRef = useRef('');
  const chatMessagesRef = useRef(chatMessages);
  const runAssistantCommandRef = useRef(null);
  const autoStartVoiceRef = useRef(null);
  const commandBusyRef = useRef(false);
  const pendingActionsRef = useRef([]);
  const pendingVoiceTurnRef = useRef(null);
  const finishingVoiceRef = useRef(false);
  const employeesRef = useRef(employees);
  const tasksRef = useRef(tasks);
  const realtimePeerRef = useRef(null);
  const realtimeDataChannelRef = useRef(null);
  const realtimeAudioRef = useRef(null);

  useEffect(() => {
    if (isVoicePage) localStorage.setItem(chatStorageKey(userId), JSON.stringify(chatMessages.slice(-30)));
  }, [chatMessages, userId, isVoicePage]);

  useEffect(() => {
    const loadAssignments = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/work-assignments`, { headers: authHeaders() });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || 'Could not load work assignments.');
        setEmployees(data.employees || []);
        setTasks(data.tasks || []);
        setSyncError('');
      } catch (error) {
        setSyncError(error.message || 'Could not load work assignments.');
      }
    };
    loadAssignments();
    const timer = window.setInterval(loadAssignments, 10000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => () => {
    if (!isVoicePage) return;
    window.speechSynthesis?.cancel();
    replyAudioRef.current?.pause();
    if (replyAudioUrlRef.current) URL.revokeObjectURL(replyAudioUrlRef.current);
    voiceRequestRef.current?.abort();
    voiceModeRef.current = false;
    voiceSessionRef.current += 1;
    window.clearTimeout(silenceTimerRef.current);
    window.clearTimeout(captureTimeoutRef.current);
    window.clearTimeout(resumeTimeoutRef.current);
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    audioContextRef.current?.close();
    realtimeDataChannelRef.current?.close();
    realtimePeerRef.current?.close();
    if (realtimeAudioRef.current) realtimeAudioRef.current.srcObject = null;
  }, [isVoicePage]);

  useEffect(() => {
    voiceModeRef.current = voiceMode;
  }, [voiceMode]);

  useLayoutEffect(() => {
    if (!isVoicePage) return undefined;
    let active = true;
    queueMicrotask(() => {
      if (active) autoStartVoiceRef.current?.();
    });
    return () => { active = false; };
  }, [isVoicePage]);

  useEffect(() => {
    if (!isVoicePage || !navigator.mediaDevices?.enumerateDevices) return undefined;
    let active = true;
    const refreshMicrophones = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (!active) return;
        setMicrophoneState(devices.some((device) => device.kind === 'audioinput') ? 'ready' : 'missing');
      } catch {
        if (active) setMicrophoneState('unknown');
      }
    };
    refreshMicrophones();
    navigator.mediaDevices.addEventListener?.('devicechange', refreshMicrophones);
    return () => {
      active = false;
      navigator.mediaDevices.removeEventListener?.('devicechange', refreshMicrophones);
    };
  }, [isVoicePage]);

  useEffect(() => {
    employeesRef.current = employees;
  }, [employees]);

  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [chatMessages]);

  const employeeById = useMemo(() => new Map(employees.map((employee) => [employee.id, employee])), [employees]);
  const filteredTasks = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return tasks.filter((task) => {
      const employee = employeeById.get(task.employeeId);
      const matchesStatus = statusFilter === 'all' || task.status === statusFilter;
      const matchesQuery = !needle || [task.title, task.notes, task.priority, employee?.name, employee?.phone]
        .some((value) => String(value || '').toLowerCase().includes(needle));
      return matchesStatus && matchesQuery;
    });
  }, [employeeById, query, statusFilter, tasks]);

  const summary = useMemo(() => ({
    pending: tasks.filter((task) => task.status === 'Pending').length,
    progress: tasks.filter((task) => task.status === 'In Progress').length,
    done: tasks.filter((task) => task.status === 'Done').length,
  }), [tasks]);

  const resetTaskDraft = () => {
    setTaskDraft(emptyTask);
    setEditingTaskId(null);
  };

  const createTaskOnServer = async (task) => {
    const response = await fetch(`${API_BASE_URL}/api/work-assignments/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({
        employee_id: Number(task.employeeId),
        title: task.title,
        quantity: task.quantity,
        due_date: task.dueDate,
        priority: task.priority,
        status: task.status,
        notes: task.notes,
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || 'Could not assign task.');
    setTasks((current) => [data.task, ...current]);
    const whatsapp = data.notifications?.whatsapp;
    const whatsappMessage = whatsapp?.success ? ' WhatsApp sent.' : whatsapp?.error ? ` WhatsApp: ${whatsapp.error}.` : '';
    const delivery = `Assignment saved. ${emailDeliveryMessage(data.email_status, data.task)}${whatsappMessage}`;
    setAssignmentNotice(delivery);
    setSyncError('');
    return { ...data.task, emailStatus: data.email_status, notifications: data.notifications, deliveryMessage: delivery };
  };

  const saveTask = async (event) => {
    event.preventDefault();
    if (!taskDraft.employeeId || !normalize(taskDraft.title)) return;
    const nextTask = { ...taskDraft, title: normalize(taskDraft.title), quantity: Math.max(1, Number(taskDraft.quantity) || 1), notes: normalize(taskDraft.notes) };
    if (editingTaskId) {
      setTasks((current) => current.map((task) => task.id === editingTaskId ? { ...task, ...nextTask } : task));
    } else {
      try {
        const savedTask = await createTaskOnServer(nextTask);
        const failures = Object.entries(savedTask.notifications || {}).filter(([, result]) => !result.success).map(([channel, result]) => `${channel}: ${result.error}`);
        if (failures.length) setSyncError(`Task saved. ${failures.join('; ')}`);
      } catch (error) {
        setSyncError(error.message || 'Could not assign task.');
        return;
      }
    }
    resetTaskDraft();
  };

  const removeTask = async (taskId) => {
    if (!window.confirm('Delete this assignment? Any email already sent cannot be recalled.')) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/work-assignments/tasks/${taskId}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || 'Could not delete task.');
      setTasks((current) => current.filter((task) => task.id !== taskId));
      setSyncError('');
    } catch (error) {
      setSyncError(error.message || 'Could not delete task.');
    }
  };

  const resendTaskEmail = async (task) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/work-assignments/tasks/${task.id}/email`, {
        method: 'POST',
        headers: authHeaders(),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || 'Could not send task email.');
      setAssignmentNotice(emailDeliveryMessage(data.email_status, task));
      setSyncError('');
    } catch (error) {
      setSyncError(error.message || 'Could not send task email.');
    }
  };

  const editTask = (task) => {
    setTaskDraft({ employeeId: task.employeeId, title: task.title, quantity: task.quantity, dueDate: task.dueDate || '', priority: task.priority, status: task.status, notes: task.notes || '' });
    setEditingTaskId(task.id);
  };

  const updateTaskStatus = async (taskId, status) => {
    setTasks((current) => current.map((task) => task.id === taskId ? { ...task, status } : task));
    try {
      const response = await fetch(`${API_BASE_URL}/api/work-assignments/tasks/${taskId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ status }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || 'Could not update task status.');
      setTasks((current) => current.map((task) => task.id === taskId ? { ...task, ...data.task } : task));
      setSyncError('');
    } catch (error) {
      setSyncError(error.message || 'Could not update task status.');
    }
  };

  const addChatMessage = (role, text) => {
    const next = [...chatMessagesRef.current, { id: uid(), role, text }].slice(-30);
    chatMessagesRef.current = next;
    setChatMessages(next);
  };

  const executeRealtimeTool = async (call) => {
    let args;
    try {
      args = JSON.parse(call.arguments || '{}');
    } catch {
      return { success: false, error: 'The tool arguments were not valid JSON.' };
    }

    try {
      if (call.name === 'assign_task') {
        const employee = employeesRef.current.find((item) => String(item.id) === String(args.employee_id));
        const title = cleanTaskTitle(args.task_title);
        if (!employee) return { success: false, error: 'Employee not found. Ask the user which employee they mean.' };
        if (!title) return { success: false, error: 'A clear task description is required.' };
        const savedTask = await createTaskOnServer({
          employeeId: employee.id,
          title,
          quantity: Math.max(1, Number(args.quantity) || 1),
          dueDate: normalize(args.due_date),
          priority: ['Low', 'Medium', 'High'].includes(args.priority) ? args.priority : 'Medium',
          status: 'Pending',
          notes: 'Created by the OpenAI Realtime voice assistant.',
        });
        lastEmployeeRef.current = employee.id;
        return { success: true, message: `${savedTask.title} was assigned to ${employee.name}. ${savedTask.deliveryMessage}` };
      }

      if (call.name === 'update_task_status') {
        const task = tasksRef.current.find((item) => String(item.id) === String(args.task_id));
        const status = ['Pending', 'In Progress', 'Done'].includes(args.status) ? args.status : '';
        if (!task) return { success: false, error: 'Task not found. Ask the user which task they mean.' };
        if (!status) return { success: false, error: 'The requested task status is invalid.' };
        const response = await fetch(`${API_BASE_URL}/api/work-assignments/tasks/${task.id}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ status }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.detail || 'Could not update task status.');
        setTasks((current) => current.map((item) => item.id === task.id ? { ...item, ...data.task } : item));
        return { success: true, message: `${task.title} is now ${status}.` };
      }

      return { success: false, error: `Unknown tool: ${call.name}` };
    } catch (error) {
      setSyncError(error.message || 'The realtime voice action failed.');
      return { success: false, error: error.message || 'The requested action could not be completed.' };
    }
  };

  const handleRealtimeEvent = async (message) => {
    let event;
    try {
      event = JSON.parse(message.data);
    } catch {
      return;
    }

    if (event.type === 'input_audio_buffer.speech_started') {
      setListening(true);
      setSpeaking(false);
      return;
    }
    if (event.type === 'input_audio_buffer.speech_stopped') {
      setListening(false);
      setProcessingVoice(true);
      return;
    }
    if (event.type === 'conversation.item.input_audio_transcription.completed') {
      const transcript = normalize(event.transcript);
      if (transcript) {
        setVoiceText(transcript);
        addChatMessage('user', transcript);
      }
      return;
    }
    if (event.type === 'response.output_audio_transcript.delta') {
      setProcessingVoice(false);
      setSpeaking(true);
      return;
    }
    if (event.type === 'response.output_audio_transcript.done') {
      const transcript = normalize(event.transcript);
      if (transcript) addChatMessage('assistant', transcript);
      return;
    }
    if (event.type === 'response.done') {
      const calls = (event.response?.output || []).filter((item) => item.type === 'function_call');
      if (calls.length) {
        setProcessingVoice(true);
        for (const call of calls) {
          const result = await executeRealtimeTool(call);
          realtimeDataChannelRef.current?.send(JSON.stringify({
            type: 'conversation.item.create',
            item: {
              type: 'function_call_output',
              call_id: call.call_id,
              output: JSON.stringify(result),
            },
          }));
        }
        realtimeDataChannelRef.current?.send(JSON.stringify({ type: 'response.create' }));
        return;
      }
      setProcessingVoice(false);
      setSpeaking(false);
      return;
    }
    if (event.type === 'error') {
      setProcessingVoice(false);
      setSpeaking(false);
      setVoiceError(event.error?.message || 'The realtime voice session reported an error.');
    }
  };

  const stopVoiceCapture = (manual = false) => {
    window.clearTimeout(silenceTimerRef.current);
    window.clearTimeout(captureTimeoutRef.current);
    silenceTimerRef.current = null;
    captureTimeoutRef.current = null;
    if (manual) forceSubmitRef.current = true;
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
  };

  const stopVoiceMode = () => {
    voiceSessionRef.current += 1;
    voiceModeRef.current = false;
    forceSubmitRef.current = false;
    window.clearTimeout(resumeTimeoutRef.current);
    resumeTimeoutRef.current = null;
    setVoiceMode(false);
    setListening(false);
    setSpeaking(false);
    setProcessingVoice(false);
    stopVoiceCapture();
    try {
      if (realtimeDataChannelRef.current?.readyState === 'open') {
        realtimeDataChannelRef.current.send(JSON.stringify({ type: 'session.close' }));
      }
    } catch { /* The peer may already be closed. */ }
    realtimeDataChannelRef.current?.close();
    realtimePeerRef.current?.close();
    realtimeDataChannelRef.current = null;
    realtimePeerRef.current = null;
    if (realtimeAudioRef.current) {
      realtimeAudioRef.current.pause();
      realtimeAudioRef.current.srcObject = null;
      realtimeAudioRef.current = null;
    }
    replyAudioRef.current?.pause();
    window.speechSynthesis?.cancel();
    voiceRequestRef.current?.abort();
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    audioContextRef.current?.close();
    audioContextRef.current = null;
  };

  const resumeVoiceCapture = (sessionId, delay = 350) => {
    if (!voiceModeRef.current || finishingVoiceRef.current || voiceSessionRef.current !== sessionId) return;
    window.clearTimeout(resumeTimeoutRef.current);
    resumeTimeoutRef.current = window.setTimeout(() => {
      resumeTimeoutRef.current = null;
      if (voiceModeRef.current && !finishingVoiceRef.current && voiceSessionRef.current === sessionId) startVoiceCapture();
    }, delay);
  };

  const speak = async (message, { resumeAfter = true, addMessage = true } = {}) => {
    if (finishingVoiceRef.current) return;
    const sessionId = voiceSessionRef.current;
    const controller = new AbortController();
    if (addMessage) addChatMessage('assistant', message);
    try {
      window.speechSynthesis?.cancel();
      replyAudioRef.current?.pause();
      if (replyAudioUrlRef.current) URL.revokeObjectURL(replyAudioUrlRef.current);
      setSpeaking(true);
      voiceRequestRef.current = controller;
      const response = await fetch(`${API_BASE_URL}/api/work-assignments/voice/speak`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ text: message }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.detail || 'Voice generation failed.');
      }
      const audioBlob = await response.blob();
      if (voiceRequestRef.current === controller) voiceRequestRef.current = null;
      if (voiceSessionRef.current !== sessionId) {
        setSpeaking(false);
        return;
      }
      const audioUrl = URL.createObjectURL(audioBlob);
      replyAudioUrlRef.current = audioUrl;
      const audio = new Audio(audioUrl);
      replyAudioRef.current = audio;
      await new Promise((resolve, reject) => {
        audio.onended = () => {
          setSpeaking(false);
          URL.revokeObjectURL(audioUrl);
          if (replyAudioUrlRef.current === audioUrl) replyAudioUrlRef.current = '';
          if (resumeAfter) resumeVoiceCapture(sessionId);
          resolve();
        };
        audio.onerror = () => {
          setSpeaking(false);
          URL.revokeObjectURL(audioUrl);
          if (replyAudioUrlRef.current === audioUrl) replyAudioUrlRef.current = '';
          reject(new Error('The generated voice response could not be played.'));
        };
        audio.play().catch(reject);
      });
    } catch (error) {
      setSpeaking(false);
      if (voiceRequestRef.current === controller) voiceRequestRef.current = null;
      if (error.name === 'AbortError') return;
      setVoiceError(error.name === 'NotAllowedError'
        ? 'Your browser blocked automatic audio. Allow sound for this site; I am still listening.'
        : error.message || 'ElevenLabs voice generation failed.');
      if (resumeAfter) resumeVoiceCapture(sessionId);
    }
  };

  const applyAiAction = async (command, action) => {
    if (!action) return false;
    if (isVoicePage && ['assign_task', 'update_status', 'cancel_pending'].includes(action.action)) {
      if (action.action === 'assign_task') {
        const employee = employeesRef.current.find((item) => String(item.id) === String(action.employeeId));
        const title = cleanTaskTitle(action.taskTitle);
        if (!employee || !title) {
          speak('I need the person and the work to be clear. Who should do what?');
          return true;
        }
        const next = { ...action, employeeId: employee.id, taskTitle: title, command };
        if (action.replacesPrevious === true) {
          pendingActionsRef.current = pendingActionsRef.current.filter((item) => item.action !== 'assign_task' || String(item.employeeId) !== String(employee.id));
        }
        const existing = pendingActionsRef.current.findIndex((item) => item.action === 'assign_task'
          && String(item.employeeId) === String(employee.id) && item.taskTitle.toLowerCase() === title.toLowerCase());
        if (existing >= 0) pendingActionsRef.current[existing] = next;
        else pendingActionsRef.current.push(next);
        lastEmployeeRef.current = employee.id;
        speak(`I've noted ${title} for ${employee.name}. What else?`);
      } else if (action.action === 'cancel_pending') {
        const employeeId = normalize(action.employeeId);
        const index = employeeId
          ? pendingActionsRef.current.findLastIndex((item) => item.action === 'assign_task' && String(item.employeeId) === employeeId)
          : pendingActionsRef.current.length - 1;
        if (index >= 0) pendingActionsRef.current.splice(index, 1);
        speak(index >= 0 ? 'Okay, I removed that planned work. What else?' : 'There is no planned work to remove. What else?');
      } else {
        const task = tasksRef.current.find((item) => String(item.id) === String(action.taskId));
        if (!task || !['Pending', 'In Progress', 'Done'].includes(action.status)) {
          speak('Which task and status did you mean?');
          return true;
        }
        pendingActionsRef.current = pendingActionsRef.current.filter((item) => item.action !== 'update_status' || String(item.taskId) !== String(task.id));
        pendingActionsRef.current.push({ action: 'update_status', taskId: task.id, status: action.status });
        speak(`Got it. I will mark ${task.title} as ${action.status} when we finish. What else?`);
      }
      return true;
    }
    if (action.action === 'none') {
      if (normalize(action.reply)) {
        speak(action.reply);
        return true;
      }
      return false;
    }

    if (action.action === 'update_status') {
      const status = ['Pending', 'In Progress', 'Done'].find((value) => value.toLowerCase() === normalize(action.status).toLowerCase()) || '';
      const taskId = normalize(action.taskId);
      const taskNeedle = normalize(action.taskTitle).toLowerCase();
      const exactTask = tasksRef.current.find((task) => String(task.id) === taskId);
      const matchingTasks = taskNeedle ? tasksRef.current.filter((task) => task.title.toLowerCase().includes(taskNeedle)) : [];
      if (!status) {
        speak('Sure. Should I mark that task as pending, in progress, or done?');
        return true;
      }
      if (!exactTask && matchingTasks.length > 1) {
        speak('I found a few tasks with that name. Which one do you mean?');
        return true;
      }
      const target = exactTask || matchingTasks[0];
      if (!target) {
        speak('I could not find that task. Could you tell me a few words from its title?');
        return true;
      }
      try {
        const response = await fetch(`${API_BASE_URL}/api/work-assignments/tasks/${target.id}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ status }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.detail || 'Could not update the task.');
        setTasks((current) => current.map((task) => task.id === target.id ? { ...task, ...data.task } : task));
        speak(`Done, ${target.title} is now ${status}. What else can I help with?`);
      } catch (error) {
        setSyncError(error.message || 'Could not update the task.');
        speak('Sorry, I found the task but could not save the status change. Please try again.');
      }
      return true;
    }

    if (action.action === 'assign_task') {
      const employee = employees.find((item) => String(item.id) === String(action.employeeId));
      const title = cleanTaskTitle(action.taskTitle || '');
      if (!employee || !title || /^(?:task|work|do it|something)$/i.test(title)) {
        speak('I can help with that. Who should do what?');
        return true;
      }
      const task = {
        employeeId: employee.id,
        title,
        quantity: Math.max(1, Number(action.quantity) || 1),
        dueDate: normalize(action.dueDate),
        priority: ['Low', 'Medium', 'High'].includes(action.priority) ? action.priority : 'Medium',
        status: 'Pending',
        notes: `Created by voice agent from: "${command}"`,
      };
      try {
        const savedTask = await createTaskOnServer(task);
        lastEmployeeRef.current = employee.id;
        const delivery = spokenDeliveryMessage(savedTask, employee.name);
        speak([`Done! I assigned ${savedTask.title} to ${employee.name}.`, delivery, 'What else can I help with?'].filter(Boolean).join(' '));
      } catch (error) {
        setSyncError(error.message || 'Could not save task.');
        speak('Sorry, I understood the task but could not save it. Please try again.');
      }
      return true;
    }

    if (action.action === 'clarify') {
      speak(action.reply || 'Of course. Could you tell me who should do what?');
      return true;
    }

    return false;
  };

  const parseCommandWithOpenAi = async (command, history) => {
    const response = await fetch(`${API_BASE_URL}/api/work-assignments/voice/parse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({
        transcript: command,
        employees,
        tasks,
        last_employee_id: lastEmployeeRef.current,
        history: history.filter((item) => item.id !== 'welcome').slice(-12).map(({ role, text }) => ({ role, text })),
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || 'OpenAI could not analyze the command.');
    return data;
  };

  const runAssistantCommand = async (commandText = voiceText, { addUserMessage = true, sessionId = null } = {}) => {
    const command = normalize(commandText);
    if (!command) {
      speak('Please say or type a command first.');
      return;
    }
    if (commandBusyRef.current) return false;
    commandBusyRef.current = true;

    const history = chatMessagesRef.current;
    if (addUserMessage) addChatMessage('user', command);
    setVoiceText('');
    try {
      const action = await parseCommandWithOpenAi(command, history);
      if (sessionId !== null && voiceSessionRef.current !== sessionId) return false;
      if (await applyAiAction(command, action)) return true;
      speak('I can help assign work or update a task. What would you like me to do?');
      return true;
    } catch (error) {
      if (sessionId !== null && voiceSessionRef.current !== sessionId) return false;
      setVoiceError(error.message || 'Could not analyze the command.');
      speak('Sorry, I had trouble with that request. Could you try again?');
      return true;
    } finally {
      commandBusyRef.current = false;
    }
  };
  runAssistantCommandRef.current = runAssistantCommand;

  const clearConversation = () => {
    chatMessagesRef.current = [welcomeMessage];
    setChatMessages([welcomeMessage]);
    lastEmployeeRef.current = '';
    pendingActionsRef.current = [];
    localStorage.removeItem(chatStorageKey(userId));
  };

  const submitVoiceAudio = async (audioBlob, sessionId) => {
    if (!audioBlob.size) {
      resumeVoiceCapture(sessionId, 150);
      return;
    }
    setProcessingVoice(true);
    setVoiceError('');
    try {
      const formData = new FormData();
      formData.append('file', audioBlob, 'work-command.webm');
      const response = await fetch(`${API_BASE_URL}/api/work-assignments/voice/transcribe`, { method: 'POST', headers: authHeaders(), body: formData });
      const data = await response.json();
      if (voiceSessionRef.current !== sessionId) return;
      if (!response.ok) throw new Error(data.detail || 'Could not transcribe the voice command.');
      const transcript = normalize(data.text);
      if (!transcript) {
        setVoiceError('I could not hear any words. I am still listening.');
        resumeVoiceCapture(sessionId, 200);
        return;
      }
      setVoiceText(transcript);
      addChatMessage('user', transcript);
      const handled = await runAssistantCommandRef.current(transcript, { addUserMessage: false, sessionId });
      if (!handled) resumeVoiceCapture(sessionId);
    } catch (error) {
      if (voiceSessionRef.current === sessionId) {
        setVoiceError(error.message || 'Could not process the voice command. I am still listening.');
        resumeVoiceCapture(sessionId, 700);
      }
    } finally {
      setProcessingVoice(false);
    }
  };

  const startVoiceCapture = async () => {
    if (!voiceModeRef.current || captureStartingRef.current || mediaRecorderRef.current?.state === 'recording') return;
    const sessionId = voiceSessionRef.current;
    captureStartingRef.current = true;
    if (!canRecordVoice) {
      setVoiceError('Voice mode needs microphone recording support in this browser. You can still type the command.');
      setVoiceMode(false);
      voiceModeRef.current = false;
      captureStartingRef.current = false;
      return;
    }
    try {
      window.speechSynthesis?.cancel();
      const stream = mediaStreamRef.current?.getAudioTracks().some((track) => track.readyState === 'live')
        ? mediaStreamRef.current : await requestMicrophone();
      if (!voiceModeRef.current || voiceSessionRef.current !== sessionId) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      mediaStreamRef.current = stream;
      setMicrophoneState('ready');
      const chunks = [];
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      forceSubmitRef.current = false;
      let heardSpeech = false;
      let source;
      recorder.ondataavailable = (event) => {
        if (event.data?.size) chunks.push(event.data);
      };
      recorder.onstop = () => {
        setListening(false);
        window.clearTimeout(silenceTimerRef.current);
        window.clearTimeout(captureTimeoutRef.current);
        silenceTimerRef.current = null;
        captureTimeoutRef.current = null;
        source?.disconnect();
        if (mediaRecorderRef.current === recorder) mediaRecorderRef.current = null;
        if (!voiceModeRef.current || voiceSessionRef.current !== sessionId) return;
        const shouldSubmit = heardSpeech || forceSubmitRef.current;
        forceSubmitRef.current = false;
        if (shouldSubmit) pendingVoiceTurnRef.current = submitVoiceAudio(new Blob(chunks, { type: mimeType }), sessionId);
        else resumeVoiceCapture(sessionId, 150);
      };

      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const audioContext = audioContextRef.current || new AudioContextClass();
      audioContextRef.current = audioContext;
      if (audioContext.state === 'suspended') await audioContext.resume();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 1024;
      source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);
      if (!voiceModeRef.current || voiceSessionRef.current !== sessionId) {
        source.disconnect();
        if (mediaRecorderRef.current === recorder) mediaRecorderRef.current = null;
        return;
      }
      const watchSilence = () => {
        if (!voiceModeRef.current || recorder.state !== 'recording') return;
        analyser.getByteTimeDomainData(samples);
        const volume = samples.reduce((total, sample) => total + Math.abs(sample - 128), 0) / samples.length;
        if (volume >= 2.8) heardSpeech = true;
        if (heardSpeech && volume < 2.8) {
          if (!silenceTimerRef.current) silenceTimerRef.current = window.setTimeout(() => stopVoiceCapture(), 900);
        } else {
          window.clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = null;
        }
        window.requestAnimationFrame(watchSilence);
      };

      setListening(true);
      recorder.start();
      captureTimeoutRef.current = window.setTimeout(() => {
        if (recorder.state === 'recording') stopVoiceCapture();
      }, 10000);
      window.requestAnimationFrame(watchSilence);
    } catch (error) {
      if (voiceSessionRef.current !== sessionId) return;
      const details = microphoneErrorDetails(error);
      stopVoiceMode();
      setMicrophoneState(details.state);
      setVoiceError(details.message);
    } finally {
      captureStartingRef.current = false;
    }
  };

  const _startRealtimeVoiceMode = async () => {
    if (!window.RTCPeerConnection || !navigator.mediaDevices?.getUserMedia) {
      setVoiceError('Realtime voice is unavailable in this browser. Using standard voice mode.');
      startVoiceCapture();
      return;
    }

    setProcessingVoice(true);
    let stream;
    try {
      window.speechSynthesis?.cancel();
      replyAudioRef.current?.pause();
      stream = await requestMicrophone();
      mediaStreamRef.current = stream;
      setMicrophoneState('ready');
      stream.getAudioTracks().forEach((track) => { track.enabled = false; });

      const peer = new RTCPeerConnection();
      realtimePeerRef.current = peer;
      const remoteAudio = new Audio();
      remoteAudio.autoplay = true;
      remoteAudio.playsInline = true;
      realtimeAudioRef.current = remoteAudio;
      peer.ontrack = (event) => {
        remoteAudio.srcObject = event.streams[0];
        remoteAudio.play().catch(() => setVoiceError('Allow audio playback to hear the assistant.'));
      };
      stream.getTracks().forEach((track) => peer.addTrack(track, stream));

      const dataChannel = peer.createDataChannel('oai-events');
      realtimeDataChannelRef.current = dataChannel;
      dataChannel.addEventListener('message', handleRealtimeEvent);
      dataChannel.addEventListener('open', () => {
        const employeeContext = employeesRef.current.slice(0, 80).map(({ id, name, role }) => ({ id, name, role }));
        const taskContext = tasksRef.current.slice(0, 120).map(({ id, title, employeeId, status }) => ({ id, title, employeeId, status }));
        dataChannel.send(JSON.stringify({
          type: 'session.update',
          session: {
            type: 'realtime',
            instructions: [
              'You are the NexGTools Work Assignment voice assistant.',
              'Speak briefly, naturally, and in the user\'s language.',
              'Use assign_task or update_task_status whenever the user requests one of those actions.',
              'For an assignment, match the spoken employee name to the employee list, preserve the requested task wording accurately, and call assign_task immediately when both are clear.',
              'The assign_task result includes the real email delivery status. State that result clearly after the tool finishes.',
              'Do not only explain how to assign a task; perform the tool call.',
              'Never say an action succeeded before its tool result confirms success.',
              'If the employee is not in the provided list, tell the user to create that employee as an Admin user first.',
              'Ask one short clarification when the employee, task, or status is ambiguous.',
              `Today is ${new Date().toISOString().slice(0, 10)}.`,
              `Employees: ${JSON.stringify(employeeContext)}`,
              `Tasks: ${JSON.stringify(taskContext)}`,
            ].join(' '),
            audio: {
              input: {
                transcription: {
                  prompt: `Employee names and roles: ${employeeContext.map((employee) => `${employee.name}${employee.role ? ` (${employee.role})` : ''}`).join(', ')}. Preserve names, task details, quantities, and dates exactly as spoken. The speaker may use English, Hindi, Bengali, Hinglish, or Banglish.`,
                },
              },
            },
            tools: realtimeTools,
            tool_choice: 'auto',
          },
        }));
        stream.getAudioTracks().forEach((track) => { track.enabled = true; });
        setProcessingVoice(false);
        setAssignmentNotice('Realtime voice connected. Speak naturally; you can interrupt the assistant while it responds.');
      });
      dataChannel.addEventListener('close', () => {
        setListening(false);
        setSpeaking(false);
        setProcessingVoice(false);
      });
      peer.addEventListener('connectionstatechange', () => {
        if (['failed', 'disconnected'].includes(peer.connectionState) && voiceModeRef.current) {
          setVoiceError('The realtime voice connection was interrupted. Stop and restart voice mode to reconnect.');
        }
      });

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      const response = await fetch(`${API_BASE_URL}/api/work-assignments/voice/realtime/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/sdp', ...authHeaders() },
        body: peer.localDescription?.sdp || offer.sdp,
      });
      const answerSdp = await response.text();
      if (!response.ok) {
        let detail = answerSdp;
        try { detail = JSON.parse(answerSdp).error?.message || JSON.parse(answerSdp).detail || answerSdp; } catch { /* Use response text. */ }
        throw new Error(detail || 'Could not create the realtime voice session.');
      }
      await peer.setRemoteDescription({ type: 'answer', sdp: answerSdp });
    } catch (error) {
      const microphoneFailure = ['NotFoundError', 'DevicesNotFoundError', 'NotAllowedError', 'PermissionDeniedError', 'NotReadableError', 'TrackStartError'].includes(error?.name);
      realtimeDataChannelRef.current?.close();
      realtimePeerRef.current?.close();
      realtimeDataChannelRef.current = null;
      realtimePeerRef.current = null;
      mediaStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = true; });
      setProcessingVoice(false);
      if (microphoneFailure) {
        const details = microphoneErrorDetails(error);
        mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
        voiceModeRef.current = false;
        setVoiceMode(false);
        setMicrophoneState(details.state);
        setVoiceError(details.message);
        return;
      }
      setVoiceError(`${error.message || 'Realtime voice could not start.'} Using standard voice mode.`);
      if (voiceModeRef.current && stream) startVoiceCapture();
    }
  };

  const startVoiceSessionOnEntry = async () => {
    if (voiceModeRef.current) return;
    if (!canRecordVoice) {
      setMicrophoneState('unsupported');
      setVoiceError('Voice mode needs microphone recording support in this browser.');
      return;
    }
    const sessionId = ++voiceSessionRef.current;
    finishingVoiceRef.current = false;
    setVoiceError('');
    voiceModeRef.current = true;
    setVoiceMode(true);
    try {
      const stream = await requestMicrophone();
      if (!voiceModeRef.current || voiceSessionRef.current !== sessionId) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      mediaStreamRef.current = stream;
      setMicrophoneState('ready');
      await speak(welcomeMessage.text, { addMessage: false });
    } catch (error) {
      if (voiceSessionRef.current !== sessionId) return;
      const details = microphoneErrorDetails(error);
      stopVoiceMode();
      setMicrophoneState(details.state);
      setVoiceError(details.message);
    }
  };
  autoStartVoiceRef.current = startVoiceSessionOnEntry;

  const finishVoiceSession = async () => {
    if (finishingVoiceRef.current) return;
    finishingVoiceRef.current = true;
    window.clearTimeout(resumeTimeoutRef.current);
    replyAudioRef.current?.pause();
    voiceRequestRef.current?.abort();
    setSpeaking(false);
    setProcessingVoice(true);
    setAssignmentNotice('Analyzing the conversation and saving your work...');
    const recorder = mediaRecorderRef.current;
    if (recorder?.state === 'recording') {
      const stopped = new Promise((resolve) => recorder.addEventListener('stop', resolve, { once: true }));
      stopVoiceCapture(true);
      await stopped;
    }
    if (pendingVoiceTurnRef.current) await pendingVoiceTurnRef.current;
    stopVoiceMode();
    const actions = [...pendingActionsRef.current];
    pendingActionsRef.current = [];
    if (!actions.length) {
      setAssignmentNotice('Conversation finished. No assignments were ready to save.');
      finishingVoiceRef.current = false;
      return;
    }
    setProcessingVoice(true);
    let saved = 0;
    const failures = [];
    for (const action of actions) {
      try {
        if (action.action === 'assign_task') {
          await createTaskOnServer({
            employeeId: action.employeeId,
            title: action.taskTitle,
            quantity: Math.max(1, Number(action.quantity) || 1),
            dueDate: normalize(action.dueDate),
            priority: ['Low', 'Medium', 'High'].includes(action.priority) ? action.priority : 'Medium',
            status: 'Pending',
            notes: `Created after voice conversation from: "${action.command}"`,
          });
        } else {
          const response = await fetch(`${API_BASE_URL}/api/work-assignments/tasks/${action.taskId}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({ status: action.status }),
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(data.detail || 'Could not update a task.');
          setTasks((current) => current.map((task) => String(task.id) === String(action.taskId) ? { ...task, ...data.task } : task));
        }
        saved += 1;
      } catch (error) {
        failures.push(`${action.taskTitle || action.taskId}: ${error.message}`);
        pendingActionsRef.current.push(action);
      }
    }
    const message = `${saved} work ${saved === 1 ? 'change' : 'changes'} saved after the conversation.${failures.length ? ` ${failures.length} could not be saved: ${failures.join('; ')}` : ''}`;
    setAssignmentNotice(message);
    addChatMessage('assistant', message);
    setProcessingVoice(false);
    finishingVoiceRef.current = false;
  };

  const toggleListening = () => {
    setVoiceError('');
    if (listening) {
      stopVoiceCapture(true);
      return;
    }
    if (voiceModeRef.current) {
      finishVoiceSession();
      return;
    }
    voiceModeRef.current = true;
    setVoiceMode(true);
    startVoiceCapture();
  };

  return (
    <div className={`work-page ${isVoicePage ? 'voice-agent-page' : 'work-management-page'}`}>
      {!isVoicePage && <header className="work-hero">
        <div>
          <span>Team Workboard</span>
          <h1>Work Assignments</h1>
          <p>Review your employees, type new assignments, and track every task from start to completion.</p>
        </div>
        <div className="work-hero-stats">
          <div><Users size={18} /><strong>{employees.length}</strong><small>Employees</small></div>
          <div><ClipboardList size={18} /><strong>{tasks.length}</strong><small>Tasks</small></div>
          <div><CheckCircle2 size={18} /><strong>{summary.done}</strong><small>Done</small></div>
        </div>
      </header>}
      {!isVoicePage && syncError && <p className="work-inline-error" role="alert"><AlertCircle size={15} /> {syncError}</p>}
      {!isVoicePage && assignmentNotice && <p className="work-assignment-notice" role="status">{assignmentNotice}</p>}

      {isVoicePage && <section className="work-assistant" aria-label="Voice Agent">
        <VoiceAgentPanel listening={listening} speaking={speaking} processing={processingVoice} voiceMode={voiceMode}
          messages={chatMessages} chatEndRef={chatEndRef} text={voiceText} setText={setVoiceText}
          onSend={() => runAssistantCommand()} onToggle={toggleListening} onStop={finishVoiceSession} onClear={clearConversation} />
        {microphoneState === 'missing' && !voiceError && <p className="work-inline-error"><AlertCircle size={15} /> No microphone input is detected. Connect or enable a microphone in Windows Sound settings before starting voice mode.</p>}
        {voiceError && <p className="work-inline-error"><AlertCircle size={15} /> {voiceError}</p>}
        {syncError && <p className="work-inline-error"><AlertCircle size={15} /> {syncError}</p>}
        {assignmentNotice && <p className="work-voice-state">{assignmentNotice}</p>}
      </section>}

      {!isVoicePage && <>
      <div className="work-grid">
        <section className="work-panel">
          <div className="work-panel-head"><h2><Users size={19} /> Employees</h2></div>
          <p className="work-whatsapp-note">Employees are admin-created login users. Add or edit employees from Admin, then assign tasks here.</p>
          <div className="work-employee-list">
            {employees.map((employee) => <div key={employee.id} className="work-employee-item"><span><strong>{employee.name}</strong>{employee.email && <small>{employee.email}</small>}{employee.role && <em>{employee.role}</em>}</span></div>)}
            {!employees.length && <div className="work-empty">No employee users are available. Create users from Admin first.</div>}
          </div>
        </section>

        <form className="work-panel work-task-form" onSubmit={saveTask}>
          <div className="work-panel-head"><h2><ClipboardList size={19} /> Task Details</h2>{editingTaskId && <button type="button" onClick={resetTaskDraft} title="Cancel task edit"><X size={16} /></button>}</div>
          <div className="work-form-row">
            <label>Employee<select value={taskDraft.employeeId} onChange={(event) => setTaskDraft((draft) => ({ ...draft, employeeId: event.target.value }))} required><option value="">Select employee</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></label>
            <label>Number<input type="number" min="1" value={taskDraft.quantity} onChange={(event) => setTaskDraft((draft) => ({ ...draft, quantity: event.target.value }))} /></label>
          </div>
          <label>Task<textarea value={taskDraft.title} onChange={(event) => setTaskDraft((draft) => ({ ...draft, title: event.target.value }))} placeholder="Describe the work" required /></label>
          <div className="work-form-row">
            <label>Due date<input type="date" value={taskDraft.dueDate} onChange={(event) => setTaskDraft((draft) => ({ ...draft, dueDate: event.target.value }))} /></label>
            <label>Priority<select value={taskDraft.priority} onChange={(event) => setTaskDraft((draft) => ({ ...draft, priority: event.target.value }))}><option>Low</option><option>Medium</option><option>High</option></select></label>
            <label>Status<select value={taskDraft.status} onChange={(event) => setTaskDraft((draft) => ({ ...draft, status: event.target.value }))}><option>Pending</option><option>In Progress</option><option>Done</option></select></label>
          </div>
          <label>Notes<textarea value={taskDraft.notes} onChange={(event) => setTaskDraft((draft) => ({ ...draft, notes: event.target.value }))} placeholder="Extra instructions, customer details, route, etc." /></label>
          <button className="work-primary-btn" type="submit"><Plus size={17} /> {editingTaskId ? 'Save Task' : 'Assign Task'}</button>
        </form>
      </div>

      <section className="work-table-panel">
        <div className="work-table-toolbar">
          <div><h2>Assigned Work</h2><p>{summary.pending} pending · {summary.progress} in progress · {summary.done} done</p></div>
          <div className="work-table-filters"><span><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tasks or employees" /></span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All status</option><option>Pending</option><option>In Progress</option><option>Done</option></select></div>
        </div>
        <div className="work-table-scroll">
          <table className="work-table">
            <thead><tr><th>Employee</th><th>Email</th><th>Task</th><th>Qty</th><th>Due</th><th>Priority</th><th>Status</th><th>Time / Seen</th><th>Actions</th></tr></thead>
            <tbody>
              {filteredTasks.map((task) => {
                const employee = employeeById.get(task.employeeId);
                return <tr key={task.id}><td><strong>{employee?.name || task.employeeName || 'Unassigned'}</strong></td><td>{employee?.email || task.employeeEmail || '-'}</td><td><span>{task.title}</span>{task.notes && <small>{task.notes}</small>}</td><td>{task.quantity}</td><td><CalendarDays size={14} /> {task.dueDate || '-'}</td><td><em className={`work-priority work-priority-${task.priority.toLowerCase()}`}>{task.priority}</em></td><td><select value={task.status} onChange={(event) => updateTaskStatus(task.id, event.target.value)}><option>Pending</option><option>In Progress</option><option>Done</option></select></td><td><TaskTiming task={task} /></td><td><div className="work-row-actions"><button type="button" onClick={() => resendTaskEmail(task)} title="Send task email"><Send size={15} /></button><button type="button" onClick={() => editTask(task)} title="Edit task"><Edit3 size={15} /></button><button type="button" onClick={() => removeTask(task.id)} title="Delete task"><Trash2 size={15} /></button></div></td></tr>;
              })}
            </tbody>
          </table>
          {!filteredTasks.length && <div className="work-empty">No assigned work matches this view.</div>}
        </div>
        <div className="work-whatsapp-note">New task alerts are sent to the selected employee's logged-in Android device when push notifications are enabled.</div>
      </section>
      </>}
    </div>
  );
}
