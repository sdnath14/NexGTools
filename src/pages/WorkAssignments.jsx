import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Bot,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Edit3,
  LoaderCircle,
  Mic,
  MicOff,
  Phone,
  Plus,
  Search,
  Send,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
  Volume2,
  X,
} from 'lucide-react';
import { API_BASE_URL, authHeaders } from '../auth';
import './WorkAssignments.css';

const emptyEmployee = { name: '', phone: '', whatsapp_number: '', role: '', email: '' };
const emptyTask = { employeeId: '', title: '', quantity: 1, dueDate: '', priority: 'Medium', status: 'Pending', notes: '' };
const canRecordVoice = 'MediaRecorder' in window && navigator.mediaDevices?.getUserMedia;
const canSpeak = 'speechSynthesis' in window;

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

const femaleVoiceNames = [
  'Microsoft Neerja',
  'Microsoft Heera',
  'Google UK English Female',
  'Google US English',
  'Google हिन्दी',
  'Samantha',
  'Karen',
  'Moira',
  'Tessa',
  'Veena',
  'Serena',
  'Victoria',
  'Allison',
  'Ava',
  'Susan',
  'Zira',
  'Hazel',
];

const maleVoicePattern = /alex|daniel|david|fred|george|mark|rishi|ryan|tom|male|man/i;
const femaleVoicePattern = /female|woman|samantha|karen|moira|tessa|veena|neerja|heera|serena|victoria|allison|ava|susan|zira|hazel/i;

const uid = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const normalize = (value) => String(value || '').trim();
const emailDeliveryMessage = (status, task) => ({
  sent: `Email accepted for ${task.employeeEmail}.`,
  missing_email: 'Add an email address to this employee before sending the task.',
  not_configured: 'SMTP is not configured, so no email was sent.',
  rejected_spam: 'The mail server rejected this message as spam. Ask the mail administrator to allow assignment emails.',
  failed: 'Email delivery failed. Check the SMTP settings.',
}[status] || 'Email status is unavailable.');
const welcomeMessage = { id: 'welcome', role: 'assistant', text: 'Hi. Tell me the employee name and task in your language. I will assign it and notify the employee.' };
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

const chooseFemaleVoice = (voices) => {
  if (!voices.length) return null;
  const englishVoices = voices.filter((voice) => voice.lang?.toLowerCase().startsWith('en'));
  const indianEnglishVoices = englishVoices.filter((voice) => voice.lang?.toLowerCase() === 'en-in');
  const voicePool = [
    ...indianEnglishVoices,
    ...englishVoices.filter((voice) => !indianEnglishVoices.includes(voice)),
    ...voices.filter((voice) => !englishVoices.includes(voice)),
  ].filter((voice) => !maleVoicePattern.test(voice.name));
  return (
    femaleVoiceNames
      .map((name) => voicePool.find((voice) => voice.name.toLowerCase().includes(name.toLowerCase())))
      .find(Boolean)
    || voicePool.find((voice) => femaleVoicePattern.test(voice.name))
    || voicePool[0]
    || null
  );
};

const getBrowserVoices = () => new Promise((resolve) => {
  const voices = window.speechSynthesis.getVoices();
  if (voices.length) {
    resolve(voices);
    return;
  }
  const timeout = window.setTimeout(() => {
    window.speechSynthesis.removeEventListener('voiceschanged', handleVoicesChanged);
    resolve(window.speechSynthesis.getVoices());
  }, 600);
  function handleVoicesChanged() {
    window.clearTimeout(timeout);
    window.speechSynthesis.removeEventListener('voiceschanged', handleVoicesChanged);
    resolve(window.speechSynthesis.getVoices());
  }
  window.speechSynthesis.addEventListener('voiceschanged', handleVoicesChanged);
});

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
    name: 'add_employee',
    description: 'Add an employee after the user provides both a name and phone number.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        phone: { type: 'string' },
        email: { type: 'string' },
        role: { type: 'string' },
      },
      required: ['name', 'phone'],
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

export default function WorkAssignments({ userId }) {
  const [employees, setEmployees] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [employeeDraft, setEmployeeDraft] = useState(emptyEmployee);
  const [taskDraft, setTaskDraft] = useState(emptyTask);
  const [editingEmployeeId, setEditingEmployeeId] = useState(null);
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
  const [speechVoices, setSpeechVoices] = useState([]);
  const [syncError, setSyncError] = useState('');
  const [assignmentNotice, setAssignmentNotice] = useState('');
  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const audioContextRef = useRef(null);
  const replyAudioRef = useRef(null);
  const replyAudioUrlRef = useRef('');
  const silenceTimerRef = useRef(null);
  const voiceModeRef = useRef(false);
  const chatEndRef = useRef(null);
  const lastEmployeeRef = useRef('');
  const chatMessagesRef = useRef(chatMessages);
  const runAssistantCommandRef = useRef(null);
  const commandBusyRef = useRef(false);
  const employeesRef = useRef(employees);
  const tasksRef = useRef(tasks);
  const realtimePeerRef = useRef(null);
  const realtimeDataChannelRef = useRef(null);
  const realtimeAudioRef = useRef(null);

  useEffect(() => {
    localStorage.setItem(chatStorageKey(userId), JSON.stringify(chatMessages.slice(-30)));
  }, [chatMessages, userId]);

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
  }, []);

  useEffect(() => () => {
    window.speechSynthesis?.cancel();
    replyAudioRef.current?.pause();
    if (replyAudioUrlRef.current) URL.revokeObjectURL(replyAudioUrlRef.current);
    voiceModeRef.current = false;
    window.clearTimeout(silenceTimerRef.current);
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    audioContextRef.current?.close();
    realtimeDataChannelRef.current?.close();
    realtimePeerRef.current?.close();
    if (realtimeAudioRef.current) realtimeAudioRef.current.srcObject = null;
  }, []);

  useEffect(() => {
    voiceModeRef.current = voiceMode;
  }, [voiceMode]);

  useEffect(() => {
    if (!navigator.mediaDevices?.enumerateDevices) return undefined;
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
  }, []);

  useEffect(() => {
    employeesRef.current = employees;
  }, [employees]);

  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  useEffect(() => {
    if (!canSpeak) return undefined;
    const loadVoices = () => setSpeechVoices(window.speechSynthesis.getVoices());
    loadVoices();
    window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', loadVoices);
  }, []);

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

  const resetEmployeeDraft = () => {
    setEmployeeDraft(emptyEmployee);
    setEditingEmployeeId(null);
  };

  const createEmployeeOnServer = async (employee) => {
    const response = await fetch(`${API_BASE_URL}/api/work-assignments/employees`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(employee),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || 'Could not save employee.');
    setEmployees((current) => [data.employee, ...current]);
    setSyncError('');
    return data.employee;
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
    return { ...data.task, emailStatus: data.email_status, deliveryMessage: delivery };
  };

  const saveEmployee = async (event) => {
    event.preventDefault();
    const nextEmployee = { ...employeeDraft, name: normalize(employeeDraft.name), phone: normalize(employeeDraft.phone), whatsapp_number: normalize(employeeDraft.whatsapp_number), role: normalize(employeeDraft.role), email: normalize(employeeDraft.email).toLowerCase() };
    if (!nextEmployee.name) return;
    if (editingEmployeeId) {
      try {
        const response = await fetch(`${API_BASE_URL}/api/work-assignments/employees/${editingEmployeeId}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify(nextEmployee),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || 'Could not update employee.');
        setEmployees((current) => current.map((employee) => employee.id === editingEmployeeId ? data.employee : employee));
        setSyncError('');
      } catch (error) {
        setSyncError(error.message || 'Could not update employee.');
        return;
      }
    } else {
      try {
        await createEmployeeOnServer(nextEmployee);
      } catch (error) {
        setSyncError(error.message || 'Could not save employee.');
        return;
      }
    }
    resetEmployeeDraft();
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

  const removeEmployee = (employeeId) => {
    if (!window.confirm('Delete this employee and their assigned tasks?')) return;
    setEmployees((current) => current.filter((employee) => employee.id !== employeeId));
    setTasks((current) => current.filter((task) => task.employeeId !== employeeId));
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

  const editEmployee = (employee) => {
    setEmployeeDraft({ name: employee.name, phone: employee.phone, whatsapp_number: employee.whatsappNumber || '', role: employee.role || '', email: employee.email || '' });
    setEditingEmployeeId(employee.id);
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

      if (call.name === 'add_employee') {
        const name = normalize(args.name);
        const phone = normalize(args.phone).replace(/\s+/g, '');
        if (!name || !phone) return { success: false, error: 'Both employee name and phone number are required.' };
        const employee = await createEmployeeOnServer({
          name,
          phone,
          email: normalize(args.email).toLowerCase(),
          role: normalize(args.role),
          whatsapp_number: '',
        });
        return { success: true, message: `${employee.name} was added successfully.` };
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
        setTasks((current) => current.map((item) => item.id === task.id ? { ...item, status } : item));
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

  const stopVoiceCapture = () => {
    window.clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = null;
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
  };

  const stopVoiceMode = () => {
    voiceModeRef.current = false;
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
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    audioContextRef.current?.close();
    audioContextRef.current = null;
  };

  const speakWithBrowserFallback = async (message, { resumeAfter = true } = {}) => {
    if (!canSpeak) {
      if (resumeAfter && voiceModeRef.current && !realtimePeerRef.current) window.setTimeout(() => startVoiceCapture(), 350);
      return;
    }
    const availableVoices = speechVoices.length ? speechVoices : await getBrowserVoices();
    const femaleVoice = chooseFemaleVoice(availableVoices);
    if (!speechVoices.length && availableVoices.length) setSpeechVoices(availableVoices);
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.voice = femaleVoice;
    utterance.lang = femaleVoice?.lang || 'en-IN';
    utterance.rate = 0.88;
    utterance.pitch = 1.35;
    utterance.onstart = () => setSpeaking(true);
    await new Promise((resolve) => {
      utterance.onend = () => {
        setSpeaking(false);
        if (resumeAfter && voiceModeRef.current && !realtimePeerRef.current) window.setTimeout(() => startVoiceCapture(), 350);
        resolve();
      };
      utterance.onerror = () => {
        setSpeaking(false);
        resolve();
      };
      window.speechSynthesis.speak(utterance);
    });
  };

  const speak = async (message, { resumeAfter = true } = {}) => {
    addChatMessage('assistant', message);
    try {
      window.speechSynthesis?.cancel();
      replyAudioRef.current?.pause();
      if (replyAudioUrlRef.current) URL.revokeObjectURL(replyAudioUrlRef.current);
      setSpeaking(true);
      const response = await fetch('/api/work-assignments/voice/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ text: message }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.detail || 'OpenAI voice generation failed.');
      }
      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      replyAudioUrlRef.current = audioUrl;
      const audio = new Audio(audioUrl);
      replyAudioRef.current = audio;
      await audio.play();
      await new Promise((resolve, reject) => {
        audio.onended = () => {
          setSpeaking(false);
          URL.revokeObjectURL(audioUrl);
          if (replyAudioUrlRef.current === audioUrl) replyAudioUrlRef.current = '';
          if (resumeAfter && voiceModeRef.current && !realtimePeerRef.current) window.setTimeout(() => startVoiceCapture(), 350);
          resolve();
        };
        audio.onerror = () => {
          setSpeaking(false);
          URL.revokeObjectURL(audioUrl);
          if (replyAudioUrlRef.current === audioUrl) replyAudioUrlRef.current = '';
          reject(new Error('The generated voice response could not be played.'));
        };
      });
    } catch (error) {
      setSpeaking(false);
      setVoiceError(error.message || 'OpenAI voice generation failed. Using browser voice fallback.');
      await speakWithBrowserFallback(message, { resumeAfter });
    }
  };

  const applyAiAction = async (command, action) => {
    if (!action) return false;
    if (action.action === 'none') {
      if (normalize(action.reply)) {
        speak(action.reply);
        return true;
      }
      return false;
    }

    if (action.action === 'add_employee') {
      const name = normalize(action.employeeName);
      const phone = normalize(action.phone).replace(/\s+/g, '');
      if (!name || !phone) {
        speak(action.reply || 'I can add the employee, but I need both name and phone number.');
        return true;
      }
      try {
        const employee = await createEmployeeOnServer({ name, phone, role: '', email: normalize(action.email).toLowerCase() });
        speak(action.reply || `Okay. I added ${employee.name} with number ${employee.phone}.`);
      } catch (error) {
        setSyncError(error.message || 'Could not save employee.');
        speak('I understood the employee, but could not save it to the database.');
      }
      return true;
    }

    if (action.action === 'update_status') {
      const status = ['Pending', 'In Progress', 'Done'].includes(action.status) ? action.status : 'Done';
      const taskId = normalize(action.taskId);
      const taskNeedle = normalize(action.taskTitle).toLowerCase();
      const target = tasks.find((task) => task.id === taskId) || tasks.find((task) => task.title.toLowerCase().includes(taskNeedle));
      if (!target) {
        speak(action.reply || 'I could not find that task. Please say a few exact words from the task title.');
        return true;
      }
      setTasks((current) => current.map((task) => task.id === target.id ? { ...task, status } : task));
      speak(action.reply || `Updated ${target.title} to ${status}.`);
      return true;
    }

    if (action.action === 'assign_task') {
      const employee = employees.find((item) => String(item.id) === String(action.employeeId));
      const title = cleanTaskTitle(action.taskTitle || '');
      if (!employee || !title || /^(?:task|work|do it|something)$/i.test(title)) {
        speak('I need a clear employee name and task. Please say who should do what.');
        return true;
      }
      const task = {
        employeeId: employee.id,
        title,
        quantity: Math.max(1, Number(action.quantity) || 1),
        dueDate: normalize(action.dueDate),
        priority: ['Low', 'Medium', 'High'].includes(action.priority) ? action.priority : 'Medium',
        status: 'Pending',
        notes: `Created by OpenAI voice assistant from: "${command}"`,
      };
      try {
        const savedTask = await createTaskOnServer(task);
        lastEmployeeRef.current = employee.id;
        speak(`${savedTask.title} assigned to ${employee.name}. ${savedTask.deliveryMessage}`);
      } catch (error) {
        setSyncError(error.message || 'Could not save task.');
        speak('I understood the task, but could not save it.');
      }
      return true;
    }

    if (action.action === 'clarify') {
      speak(action.reply || 'Please tell me a little more so I can assign it correctly.');
      return true;
    }

    return false;
  };

  const parseCommandWithOpenAi = async (command, history) => {
    const response = await fetch('/api/work-assignments/voice/parse', {
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

  const runAssistantCommand = async (commandText = voiceText, { addUserMessage = true } = {}) => {
    const command = normalize(commandText);
    if (!command) {
      speak('Please say or type a command first.');
      return;
    }
    if (commandBusyRef.current) return;
    commandBusyRef.current = true;

    const history = chatMessagesRef.current;
    if (addUserMessage) addChatMessage('user', command);
    setVoiceText('');
    try {
      const action = await parseCommandWithOpenAi(command, history);
      if (await applyAiAction(command, action)) return;
      speak('I am not sure what you meant. Please tell me a little more.');
    } catch (error) {
      setVoiceError(error.message || 'Could not analyze the command.');
      speak('I could not analyze that command. Please try again.');
    } finally {
      commandBusyRef.current = false;
    }
  };
  runAssistantCommandRef.current = runAssistantCommand;

  const clearConversation = () => {
    chatMessagesRef.current = [welcomeMessage];
    setChatMessages([welcomeMessage]);
    lastEmployeeRef.current = '';
    localStorage.removeItem(chatStorageKey(userId));
  };

  const submitVoiceAudio = async (audioBlob) => {
    if (!audioBlob.size) return;
    setProcessingVoice(true);
    setVoiceError('');
    try {
      const formData = new FormData();
      formData.append('file', audioBlob, 'work-command.webm');
      const response = await fetch('/api/work-assignments/voice/transcribe', { method: 'POST', headers: authHeaders(), body: formData });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'OpenAI could not transcribe the voice command.');
      const transcript = normalize(data.text);
      if (!transcript) {
        setVoiceError('I could not hear any words. Press the microphone and speak closer to the input device.');
        return;
      }
      setVoiceText(transcript);
      addChatMessage('user', transcript);
      await speak(`I heard: ${transcript}`, { resumeAfter: false });
      await runAssistantCommandRef.current(transcript, { addUserMessage: false });
    } catch (error) {
      setVoiceError(error.message || 'Could not process the voice command.');
    } finally {
      setProcessingVoice(false);
    }
  };

  const startVoiceCapture = async () => {
    if (!voiceModeRef.current || listening || speaking || processingVoice) return;
    if (!canRecordVoice) {
      setVoiceError('Voice mode needs microphone recording support in this browser. You can still type the command.');
      setVoiceMode(false);
      voiceModeRef.current = false;
      return;
    }
    try {
      window.speechSynthesis?.cancel();
      const stream = mediaStreamRef.current || await requestMicrophone();
      mediaStreamRef.current = stream;
      setMicrophoneState('ready');
      const chunks = [];
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data?.size) chunks.push(event.data);
      };
      recorder.onstop = () => {
        setListening(false);
        voiceModeRef.current = false;
        setVoiceMode(false);
        window.clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
        stream.getTracks().forEach((track) => track.stop());
        if (mediaStreamRef.current === stream) mediaStreamRef.current = null;
        submitVoiceAudio(new Blob(chunks, { type: mimeType }));
      };

      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const audioContext = audioContextRef.current || new AudioContextClass();
      audioContextRef.current = audioContext;
      if (audioContext.state === 'suspended') await audioContext.resume();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 1024;
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);
      let heardSpeech = false;
      const watchSilence = () => {
        if (!voiceModeRef.current || recorder.state !== 'recording') return;
        analyser.getByteTimeDomainData(samples);
        const volume = samples.reduce((total, sample) => total + Math.abs(sample - 128), 0) / samples.length;
        if (volume >= 2.8) heardSpeech = true;
        if (heardSpeech && volume < 2.8) {
          if (!silenceTimerRef.current) silenceTimerRef.current = window.setTimeout(() => stopVoiceCapture(), 2300);
        } else {
          window.clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = null;
        }
        window.requestAnimationFrame(watchSilence);
      };

      setListening(true);
      recorder.start();
      window.setTimeout(() => {
        if (recorder.state === 'recording') stopVoiceCapture();
      }, 14000);
      window.requestAnimationFrame(watchSilence);
    } catch (error) {
      const details = microphoneErrorDetails(error);
      setListening(false);
      setVoiceMode(false);
      voiceModeRef.current = false;
      setMicrophoneState(details.state);
      setVoiceError(details.message);
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
              'Use assign_task, add_employee, or update_task_status whenever the user requests one of those actions.',
              'For an assignment, match the spoken employee name to the employee list, preserve the requested task wording accurately, and call assign_task immediately when both are clear.',
              'The assign_task result includes the real email delivery status. State that result clearly after the tool finishes.',
              'Do not only explain how to assign a task; perform the tool call.',
              'Never say an action succeeded before its tool result confirms success.',
              'Ask one short clarification when the employee, task, phone number, or status is ambiguous.',
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

  const toggleListening = () => {
    setVoiceError('');
    if (voiceModeRef.current || listening) {
      stopVoiceMode();
      return;
    }
    voiceModeRef.current = true;
    setVoiceMode(true);
    startVoiceCapture();
  };

  return (
    <div className="work-page">
      <header className="work-hero">
        <div>
          <span>Team Workboard</span>
          <h1>Assign work by employee, number, and task</h1>
          <p>Create employees, assign measurable tasks, edit progress, and use the multilingual voice assistant for quick commands.</p>
        </div>
        <div className="work-hero-stats">
          <div><Users size={18} /><strong>{employees.length}</strong><small>Employees</small></div>
          <div><ClipboardList size={18} /><strong>{tasks.length}</strong><small>Tasks</small></div>
          <div><CheckCircle2 size={18} /><strong>{summary.done}</strong><small>Done</small></div>
        </div>
      </header>

      <section className="work-assistant">
        <div className="work-assistant-head"><Bot size={20} /><div><h2>Voice Work Agent</h2><p>Press once and speak in your language. The assistant repeats what it heard, analyzes the request, assigns the task, and reports email delivery.</p></div><button type="button" className="work-clear-chat" onClick={clearConversation} disabled={listening || speaking || processingVoice}>New conversation</button><span className={listening ? 'work-voice-state work-voice-listening' : speaking ? 'work-voice-state work-voice-speaking' : processingVoice ? 'work-voice-state work-voice-processing' : 'work-voice-state'}>{listening ? <Mic size={14} /> : speaking ? <Volume2 size={14} /> : processingVoice ? <LoaderCircle size={14} /> : <Sparkles size={14} />}{listening ? 'Listening' : speaking ? 'Speaking' : processingVoice ? 'Analyzing' : voiceMode ? 'Recording' : 'Ready'}</span></div>
        <div className="work-agent-layout">
          <div className={listening ? 'work-voice-orb is-listening' : speaking || processingVoice ? 'work-voice-orb is-speaking' : 'work-voice-orb'}>
            <div className="work-orb-rings"><span /><span /><span /></div>
            <div className="work-wave" aria-hidden="true">{Array.from({ length: 9 }).map((_, index) => <i key={index} />)}</div>
            <strong>{listening ? 'Listening — say the employee and task' : processingVoice ? 'Transcribing and assigning your task' : speaking ? 'Speaking the result' : voiceMode ? 'Microphone starting' : 'Press once, then speak'}</strong>
            <button type="button" className={listening ? 'work-mic work-mic-live' : 'work-mic'} onClick={toggleListening} title={listening ? 'Stop listening' : 'Start voice input'}>
              {processingVoice ? <LoaderCircle size={21} /> : listening || voiceMode ? <MicOff size={21} /> : <Mic size={21} />}
            </button>
            {listening && <button type="button" className="work-stop-respond" onClick={stopVoiceMode}>Stop and respond</button>}
          </div>
          <div className="work-chatbot">
            <div className="work-chat-messages" aria-live="polite">
              {chatMessages.map((message) => <div key={message.id} className={`work-chat-message work-chat-${message.role}`}><span>{message.role === 'assistant' ? <Bot size={15} /> : 'You'}</span><p>{message.text}</p></div>)}
              <div ref={chatEndRef} />
            </div>
            <div className="work-command-row">
              <input value={voiceText} onChange={(event) => setVoiceText(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') runAssistantCommand(); }} placeholder="Ask Srabani to call vendors tomorrow / Srabani ko kal vendors call karne bolo" />
              <button type="button" className="work-send-btn" onClick={() => runAssistantCommand()} title="Send command"><Send size={18} /></button>
            </div>
          </div>
        </div>
        {microphoneState === 'missing' && !voiceError && <p className="work-inline-error"><AlertCircle size={15} /> No microphone input is detected. Connect or enable a microphone in Windows Sound settings before starting voice mode.</p>}
        {voiceError && <p className="work-inline-error"><AlertCircle size={15} /> {voiceError}</p>}
        {syncError && <p className="work-inline-error"><AlertCircle size={15} /> {syncError}</p>}
        {assignmentNotice && <p className="work-voice-state">{assignmentNotice}</p>}
      </section>

      <div className="work-grid">
        <form className="work-panel" onSubmit={saveEmployee}>
          <div className="work-panel-head"><h2><UserPlus size={19} /> Employees</h2>{editingEmployeeId && <button type="button" onClick={resetEmployeeDraft} title="Cancel employee edit"><X size={16} /></button>}</div>
          <label>Name<input value={employeeDraft.name} onChange={(event) => setEmployeeDraft((draft) => ({ ...draft, name: event.target.value }))} placeholder="Employee name" required /></label>
          <label>Login email<input type="email" value={employeeDraft.email} onChange={(event) => setEmployeeDraft((draft) => ({ ...draft, email: event.target.value }))} placeholder="employee@nexgpetrolube.com" /></label>
          <label>Phone number<input value={employeeDraft.phone} onChange={(event) => setEmployeeDraft((draft) => ({ ...draft, phone: event.target.value }))} placeholder="WhatsApp/mobile number" required /></label>
          <label>WhatsApp number<input value={employeeDraft.whatsapp_number} onChange={(event) => setEmployeeDraft((draft) => ({ ...draft, whatsapp_number: event.target.value }))} placeholder="Optional; uses phone number if blank" /></label>
          <label>Role<input value={employeeDraft.role} onChange={(event) => setEmployeeDraft((draft) => ({ ...draft, role: event.target.value }))} placeholder="Sales, operations..." /></label>
          <button className="work-primary-btn" type="submit"><Plus size={17} /> {editingEmployeeId ? 'Save Employee' : 'Add Employee'}</button>
          <div className="work-employee-list">
            {employees.map((employee) => <div key={employee.id} className="work-employee-item"><span><strong>{employee.name}</strong><small><Phone size={13} /> {employee.phone || '-'}</small>{employee.email && <small>{employee.email}</small>}{employee.role && <em>{employee.role}</em>}</span><div><button type="button" onClick={() => editEmployee(employee)} title="Edit employee"><Edit3 size={15} /></button><button type="button" onClick={() => removeEmployee(employee.id)} title="Delete employee"><Trash2 size={15} /></button></div></div>)}
          </div>
        </form>

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
            <thead><tr><th>Employee</th><th>Number</th><th>Task</th><th>Qty</th><th>Due</th><th>Priority</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {filteredTasks.map((task) => {
                const employee = employeeById.get(task.employeeId);
                return <tr key={task.id}><td><strong>{employee?.name || task.employeeName || 'Unassigned'}</strong></td><td>{employee?.phone || task.employeePhone || '-'}</td><td><span>{task.title}</span>{task.notes && <small>{task.notes}</small>}</td><td>{task.quantity}</td><td><CalendarDays size={14} /> {task.dueDate || '-'}</td><td><em className={`work-priority work-priority-${task.priority.toLowerCase()}`}>{task.priority}</em></td><td><select value={task.status} onChange={(event) => updateTaskStatus(task.id, event.target.value)}><option>Pending</option><option>In Progress</option><option>Done</option></select></td><td><div className="work-row-actions"><button type="button" onClick={() => resendTaskEmail(task)} title="Send task email"><Send size={15} /></button><button type="button" onClick={() => editTask(task)} title="Edit task"><Edit3 size={15} /></button><button type="button" onClick={() => removeTask(task.id)} title="Delete task"><Trash2 size={15} /></button></div></td></tr>;
              })}
            </tbody>
          </table>
          {!filteredTasks.length && <div className="work-empty">No assigned work matches this view.</div>}
        </div>
        <div className="work-whatsapp-note">WhatsApp API is not connected yet. Employee phone numbers and task payloads are structured so a send/notify endpoint can be added later.</div>
      </section>
    </div>
  );
}
