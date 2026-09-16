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
import './WorkAssignments.css';

const STORAGE_KEY = 'nexgtools_work_assignments';

const emptyEmployee = { name: '', phone: '', role: '' };
const emptyTask = { employeeId: '', title: '', quantity: 1, dueDate: '', priority: 'Medium', status: 'Pending', notes: '' };
const canRecordVoice = 'MediaRecorder' in window && navigator.mediaDevices?.getUserMedia;
const canSpeak = 'speechSynthesis' in window;

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

const todayIso = () => new Date().toISOString().slice(0, 10);
const uid = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const normalize = (value) => String(value || '').trim();

const seedData = {
  employees: [
    { id: 'emp-1', name: 'Amit Sharma', phone: '9876543210', role: 'Sales' },
    { id: 'emp-2', name: 'Riya Mehta', phone: '9123456780', role: 'Operations' },
  ],
  tasks: [
    { id: 'task-1', employeeId: 'emp-1', title: 'Call used-oil vendors', quantity: 12, dueDate: todayIso(), priority: 'High', status: 'Pending', notes: 'Start with saved leads.' },
    { id: 'task-2', employeeId: 'emp-2', title: 'Verify recycler data', quantity: 5, dueDate: todayIso(), priority: 'Medium', status: 'In Progress', notes: 'Update missing phone numbers.' },
  ],
};

const loadState = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (parsed?.employees && parsed?.tasks) return parsed;
  } catch {
    return seedData;
  }
  return seedData;
};

const parseDate = (text) => {
  const lower = text.toLowerCase();
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  if (lower.includes('tomorrow')) date.setDate(date.getDate() + 1);
  if (lower.includes('next week')) date.setDate(date.getDate() + 7);
  const inDays = lower.match(/in\s+(\d+)\s+days?/);
  if (inDays) date.setDate(date.getDate() + Number(inDays[1]));
  return date.toISOString().slice(0, 10);
};

const cleanTaskTitle = (value) => normalize(value)
  .replace(/^(?:a\s+)?task\s+(?:to\s+)?/i, '')
  .replace(/^(?:do|complete|finish|handle|work on|take care of)\s+/i, '')
  .replace(/\s+(?:by\s+)?(?:today|tomorrow|next week|in\s+\d+\s+days?)\s*$/i, '')
  .replace(/[.,!?]+$/g, '')
  .trim();

const dueDateLabel = (text) => {
  const lower = text.toLowerCase();
  if (lower.includes('tomorrow')) return 'tomorrow';
  if (lower.includes('next week')) return 'next week';
  const inDays = lower.match(/in\s+(\d+)\s+days?/);
  if (inDays) return `in ${inDays[1]} days`;
  return 'today';
};

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

const wordPattern = (word) => new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');

const findEmployeeFromCommand = (command, employees, fallbackEmployeeId = '') => {
  const lower = command.toLowerCase();
  const sortedEmployees = [...employees].sort((a, b) => b.name.length - a.name.length);
  const namedEmployee = sortedEmployees.find((employee) => {
    const name = employee.name.toLowerCase();
    const firstName = name.split(/\s+/)[0];
    return wordPattern(name).test(lower) || wordPattern(firstName).test(lower);
  });
  if (namedEmployee) return namedEmployee;

  if (/\b(?:her|him|them|that employee|same employee)\b/i.test(command)) {
    return employees.find((employee) => employee.id === fallbackEmployeeId) || (employees.length === 1 ? employees[0] : null);
  }

  return null;
};

const extractRequestedTask = (command, employee) => {
  const employeeNames = employee
    ? [employee.name, employee.name.split(/\s+/)[0]].filter(Boolean).map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    : [];
  const employeePattern = employeeNames.length ? `(?:${employeeNames.join('|')})` : '[a-z\\s]+?';
  const patterns = [
    new RegExp(`(?:please\\s+)?(?:tell|ask|instruct|say(?:\\s+to)?)\\s+${employeePattern}\\s+to\\s+(.+)`, 'i'),
    new RegExp(`(?:please\\s+)?(?:add|create|assign|give)\\s+(?:a\\s+)?task\\s+(?:for|to)\\s+${employeePattern}\\s+to\\s+(.+)`, 'i'),
    new RegExp(`(?:please\\s+)?(?:add|create|assign|give)\\s+(.+?)\\s+(?:to|for)\\s+${employeePattern}`, 'i'),
    new RegExp(`(?:please\\s+)?${employeePattern}\\s+(?:needs?\\s+to|should|has\\s+to|must)\\s+(.+)`, 'i'),
    /(?:please\s+)?(?:add|create)\s+(?:a\s+)?task\s+to\s+(.+)/i,
  ];
  const match = patterns.map((pattern) => command.match(pattern)).find(Boolean);
  if (match?.[1]) return cleanTaskTitle(match[1]);

  const employeeNamePattern = employeeNames.length ? new RegExp(`\\b(?:${employeeNames.join('|')})\\b`, 'ig') : null;
  const fallback = command
    .replace(/^(?:please\s+)?(?:add|create|assign|give|make|set)\s+(?:a\s+)?(?:new\s+)?task\s*/i, '')
    .replace(/^(?:please\s+)?(?:tell|ask|instruct|say(?:\s+to)?)\s*/i, '')
    .replace(employeeNamePattern || /^$/, '')
    .replace(/\b(?:for|to|her|him|them|that employee|same employee)\b/ig, '')
    .replace(/^(?:needs?\s+to|should|has\s+to|must)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleanTaskTitle(fallback);
};

export default function WorkAssignments() {
  const [employees, setEmployees] = useState(() => loadState().employees);
  const [tasks, setTasks] = useState(() => loadState().tasks);
  const [employeeDraft, setEmployeeDraft] = useState(emptyEmployee);
  const [taskDraft, setTaskDraft] = useState(emptyTask);
  const [editingEmployeeId, setEditingEmployeeId] = useState(null);
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [voiceText, setVoiceText] = useState('');
  const [chatMessages, setChatMessages] = useState([
    { id: 'welcome', role: 'assistant', text: 'Hi. Tell me who should do what, and I will create the assignment for you.' },
  ]);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [processingVoice, setProcessingVoice] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const [speechVoices, setSpeechVoices] = useState([]);
  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const audioContextRef = useRef(null);
  const silenceTimerRef = useRef(null);
  const voiceModeRef = useRef(false);
  const chatEndRef = useRef(null);
  const lastEmployeeRef = useRef('');

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ employees, tasks }));
  }, [employees, tasks]);

  useEffect(() => () => {
    window.speechSynthesis?.cancel();
    voiceModeRef.current = false;
    window.clearTimeout(silenceTimerRef.current);
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    audioContextRef.current?.close();
  }, []);

  useEffect(() => {
    voiceModeRef.current = voiceMode;
  }, [voiceMode]);

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

  const saveEmployee = (event) => {
    event.preventDefault();
    const nextEmployee = { ...employeeDraft, name: normalize(employeeDraft.name), phone: normalize(employeeDraft.phone), role: normalize(employeeDraft.role) };
    if (!nextEmployee.name || !nextEmployee.phone) return;
    if (editingEmployeeId) {
      setEmployees((current) => current.map((employee) => employee.id === editingEmployeeId ? { ...employee, ...nextEmployee } : employee));
    } else {
      setEmployees((current) => [{ id: uid(), ...nextEmployee }, ...current]);
    }
    resetEmployeeDraft();
  };

  const saveTask = (event) => {
    event.preventDefault();
    if (!taskDraft.employeeId || !normalize(taskDraft.title)) return;
    const nextTask = { ...taskDraft, title: normalize(taskDraft.title), quantity: Math.max(1, Number(taskDraft.quantity) || 1), notes: normalize(taskDraft.notes) };
    if (editingTaskId) {
      setTasks((current) => current.map((task) => task.id === editingTaskId ? { ...task, ...nextTask } : task));
    } else {
      setTasks((current) => [{ id: uid(), ...nextTask }, ...current]);
    }
    resetTaskDraft();
  };

  const removeEmployee = (employeeId) => {
    if (!window.confirm('Delete this employee and their assigned tasks?')) return;
    setEmployees((current) => current.filter((employee) => employee.id !== employeeId));
    setTasks((current) => current.filter((task) => task.employeeId !== employeeId));
  };

  const removeTask = (taskId) => {
    setTasks((current) => current.filter((task) => task.id !== taskId));
  };

  const editEmployee = (employee) => {
    setEmployeeDraft({ name: employee.name, phone: employee.phone, role: employee.role || '' });
    setEditingEmployeeId(employee.id);
  };

  const editTask = (task) => {
    setTaskDraft({ employeeId: task.employeeId, title: task.title, quantity: task.quantity, dueDate: task.dueDate || '', priority: task.priority, status: task.status, notes: task.notes || '' });
    setEditingTaskId(task.id);
  };

  const addChatMessage = (role, text) => {
    setChatMessages((current) => [...current, { id: uid(), role, text }]);
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
    stopVoiceCapture();
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    audioContextRef.current?.close();
    audioContextRef.current = null;
  };

  const speak = async (message) => {
    addChatMessage('assistant', message);
    if (!canSpeak) {
      if (voiceModeRef.current) window.setTimeout(() => startVoiceCapture(), 350);
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
    utterance.onend = () => {
      setSpeaking(false);
      if (voiceModeRef.current) window.setTimeout(() => startVoiceCapture(), 350);
    };
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
  };

  const applyAiAction = (command, action) => {
    if (!action || action.action === 'none') return false;

    if (action.action === 'add_employee') {
      const name = normalize(action.employeeName);
      const phone = normalize(action.phone).replace(/\s+/g, '');
      if (!name || !phone) {
        speak(action.reply || 'I can add the employee, but I need both name and phone number.');
        return true;
      }
      const employee = { id: uid(), name, phone, role: '' };
      setEmployees((current) => [employee, ...current]);
      speak(action.reply || `Okay. I added ${employee.name} with number ${employee.phone}.`);
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
      const employee = employees.find((item) => item.id === action.employeeId)
        || findEmployeeFromCommand(`${action.employeeName || ''} ${command}`, employees, lastEmployeeRef.current);
      const title = cleanTaskTitle(action.taskTitle || '');
      if (!employee || !title) {
        speak(action.reply || 'I need the employee and task before I can assign it.');
        return true;
      }
      lastEmployeeRef.current = employee.id;
      const task = {
        id: uid(),
        employeeId: employee.id,
        title,
        quantity: Math.max(1, Number(action.quantity) || 1),
        dueDate: normalize(action.dueDate) || parseDate(command),
        priority: ['Low', 'Medium', 'High'].includes(action.priority) ? action.priority : 'Medium',
        status: 'Pending',
        notes: `Created by OpenAI voice assistant from: "${command}"`,
      };
      setTasks((current) => [task, ...current]);
      speak(action.reply || `Okay, assigning ${task.title} to ${employee.name}.`);
      return true;
    }

    if (action.action === 'clarify') {
      speak(action.reply || 'Please tell me a little more so I can assign it correctly.');
      return true;
    }

    return false;
  };

  const parseCommandWithOpenAi = async (command) => {
    const response = await fetch('/api/work-assignments/voice/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transcript: command,
        employees,
        tasks,
        last_employee_id: lastEmployeeRef.current,
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || 'OpenAI could not analyze the command.');
    return data;
  };

  const runAssistantCommand = async (commandText = voiceText, options = {}) => {
    const command = normalize(commandText);
    const lower = command.toLowerCase();
    if (!command) {
      speak('Please say or type a command first.');
      return;
    }

    addChatMessage('user', command);
    setVoiceText('');

    if (!options.skipAi) {
      try {
        const action = await parseCommandWithOpenAi(command);
        if (applyAiAction(command, action)) return;
      } catch (error) {
        setVoiceError(error.message || 'OpenAI could not analyze the command. Using the local fallback.');
      }
    }

    const employeeMatch = lower.match(/add employee\s+([a-z\s]+?)(?:\s+(?:number|phone|mobile)\s+|\s+)(\+?\d[\d\s-]{6,})/i);
    if (employeeMatch) {
      const employee = { id: uid(), name: normalize(employeeMatch[1]), phone: normalize(employeeMatch[2]).replace(/\s+/g, ''), role: '' };
      setEmployees((current) => [employee, ...current]);
      speak(`Okay. I added ${employee.name} with number ${employee.phone}.`);
      return;
    }

    const statusMatch = lower.match(/(?:mark|set)\s+(.+?)\s+(?:as\s+)?(done|complete|completed|pending|in progress)/i);
    if (statusMatch) {
      const taskNeedle = statusMatch[1].trim();
      const status = statusMatch[2].startsWith('done') || statusMatch[2].startsWith('complete') ? 'Done' : statusMatch[2] === 'pending' ? 'Pending' : 'In Progress';
      const target = tasks.find((task) => task.title.toLowerCase().includes(taskNeedle));
      if (target) {
        setTasks((current) => current.map((task) => task.id === target.id ? { ...task, status } : task));
        speak(`Updated ${target.title} to ${status}.`);
      } else {
        speak('I could not find that task. Try using a few exact words from the task title.');
      }
      return;
    }

    const quantity = Number(lower.match(/\b(\d+)\b/)?.[1] || 1);
    const employee = findEmployeeFromCommand(command, employees, lastEmployeeRef.current);
    const requestedTask = employee ? extractRequestedTask(command, employee) : '';

    if (employee && requestedTask) {
      lastEmployeeRef.current = employee.id;
      const title = cleanTaskTitle(requestedTask);
      const task = {
        id: uid(),
        employeeId: employee.id,
        title: title || command,
        quantity,
        dueDate: parseDate(lower),
        priority: lower.includes('urgent') || lower.includes('high') ? 'High' : 'Medium',
        status: 'Pending',
        notes: `Created by assistant from: "${command}"`,
      };
      setTasks((current) => [task, ...current]);
      speak(`Okay, assigning ${task.title} to ${employee.name}. It is due ${dueDateLabel(lower)}.`);
      return;
    }

    if (!employee && /\b(?:tell|ask|instruct|assign|give|add|create)\b/i.test(command)) {
      speak('I heard the task request, but I could not match the employee name. Please say the employee name exactly as it appears in the list.');
      return;
    }

    if (employee && !requestedTask) {
      lastEmployeeRef.current = employee.id;
      speak(`I found ${employee.name}. Please tell me the task to assign.`);
      return;
    }

    speak('I heard you, but I need an employee and a task. Try saying, please ask Amit to call the vendors tomorrow.');
  };

  const submitVoiceAudio = async (audioBlob) => {
    if (!audioBlob.size) return;
    setProcessingVoice(true);
    setVoiceError('');
    try {
      const formData = new FormData();
      formData.append('file', audioBlob, 'work-command.webm');
      const response = await fetch('/api/work-assignments/voice/transcribe', { method: 'POST', body: formData });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'OpenAI could not transcribe the voice command.');
      const transcript = normalize(data.text);
      if (!transcript) {
        if (voiceModeRef.current) window.setTimeout(() => startVoiceCapture(), 350);
        return;
      }
      setVoiceText(transcript);
      await runAssistantCommand(transcript);
    } catch (error) {
      setVoiceError(error.message || 'Could not process the voice command.');
      if (voiceModeRef.current) window.setTimeout(() => startVoiceCapture(), 700);
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
      const stream = mediaStreamRef.current || await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      mediaStreamRef.current = stream;
      const chunks = [];
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data?.size) chunks.push(event.data);
      };
      recorder.onstop = () => {
        setListening(false);
        window.clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
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
      const watchSilence = () => {
        if (!voiceModeRef.current || recorder.state !== 'recording') return;
        analyser.getByteTimeDomainData(samples);
        const volume = samples.reduce((total, sample) => total + Math.abs(sample - 128), 0) / samples.length;
        if (volume < 2.8) {
          if (!silenceTimerRef.current) silenceTimerRef.current = window.setTimeout(() => stopVoiceCapture(), 1250);
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
      setListening(false);
      setVoiceMode(false);
      voiceModeRef.current = false;
      setVoiceError(error.message || 'Microphone permission was not granted.');
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
          <p>Create employees, assign measurable tasks, edit progress, and use the voice assistant for quick commands.</p>
        </div>
        <div className="work-hero-stats">
          <div><Users size={18} /><strong>{employees.length}</strong><small>Employees</small></div>
          <div><ClipboardList size={18} /><strong>{tasks.length}</strong><small>Tasks</small></div>
          <div><CheckCircle2 size={18} /><strong>{summary.done}</strong><small>Done</small></div>
        </div>
      </header>

      <section className="work-assistant">
        <div className="work-assistant-head"><Bot size={20} /><div><h2>Work Agent</h2><p>Talk naturally. The agent listens, replies, and completes task actions.</p></div><span className={listening ? 'work-voice-state work-voice-listening' : speaking ? 'work-voice-state work-voice-speaking' : processingVoice ? 'work-voice-state work-voice-processing' : 'work-voice-state'}>{listening ? <Mic size={14} /> : speaking ? <Volume2 size={14} /> : processingVoice ? <LoaderCircle size={14} /> : <Sparkles size={14} />}{listening ? 'Listening' : speaking ? 'Speaking' : processingVoice ? 'Thinking' : voiceMode ? 'Voice Mode' : 'Ready'}</span></div>
        <div className="work-agent-layout">
          <div className={listening ? 'work-voice-orb is-listening' : speaking || processingVoice ? 'work-voice-orb is-speaking' : 'work-voice-orb'}>
            <div className="work-orb-rings"><span /><span /><span /></div>
            <div className="work-wave" aria-hidden="true">{Array.from({ length: 9 }).map((_, index) => <i key={index} />)}</div>
            <strong>{listening ? 'Listening until you pause' : processingVoice ? 'Analyzing with OpenAI' : speaking ? 'Responding' : voiceMode ? 'Voice mode on' : 'Start voice mode'}</strong>
            <button type="button" className={listening ? 'work-mic work-mic-live' : 'work-mic'} onClick={toggleListening} title={listening ? 'Stop listening' : 'Start voice input'}>
              {processingVoice ? <LoaderCircle size={21} /> : listening || voiceMode ? <MicOff size={21} /> : <Mic size={21} />}
            </button>
          </div>
          <div className="work-chatbot">
            <div className="work-chat-messages" aria-live="polite">
              {chatMessages.map((message) => <div key={message.id} className={`work-chat-message work-chat-${message.role}`}><span>{message.role === 'assistant' ? <Bot size={15} /> : 'You'}</span><p>{message.text}</p></div>)}
              <div ref={chatEndRef} />
            </div>
            <div className="work-command-row">
              <input value={voiceText} onChange={(event) => setVoiceText(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') runAssistantCommand(); }} placeholder="Please ask Srabani to call the vendors tomorrow" />
              <button type="button" className="work-send-btn" onClick={() => runAssistantCommand()} title="Send command"><Send size={18} /></button>
            </div>
          </div>
        </div>
        {voiceError && <p className="work-inline-error"><AlertCircle size={15} /> {voiceError}</p>}
      </section>

      <div className="work-grid">
        <form className="work-panel" onSubmit={saveEmployee}>
          <div className="work-panel-head"><h2><UserPlus size={19} /> Employees</h2>{editingEmployeeId && <button type="button" onClick={resetEmployeeDraft} title="Cancel employee edit"><X size={16} /></button>}</div>
          <label>Name<input value={employeeDraft.name} onChange={(event) => setEmployeeDraft((draft) => ({ ...draft, name: event.target.value }))} placeholder="Employee name" required /></label>
          <label>Phone number<input value={employeeDraft.phone} onChange={(event) => setEmployeeDraft((draft) => ({ ...draft, phone: event.target.value }))} placeholder="WhatsApp/mobile number" required /></label>
          <label>Role<input value={employeeDraft.role} onChange={(event) => setEmployeeDraft((draft) => ({ ...draft, role: event.target.value }))} placeholder="Sales, operations..." /></label>
          <button className="work-primary-btn" type="submit"><Plus size={17} /> {editingEmployeeId ? 'Save Employee' : 'Add Employee'}</button>
          <div className="work-employee-list">
            {employees.map((employee) => <div key={employee.id} className="work-employee-item"><span><strong>{employee.name}</strong><small><Phone size={13} /> {employee.phone}</small>{employee.role && <em>{employee.role}</em>}</span><div><button type="button" onClick={() => editEmployee(employee)} title="Edit employee"><Edit3 size={15} /></button><button type="button" onClick={() => removeEmployee(employee.id)} title="Delete employee"><Trash2 size={15} /></button></div></div>)}
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
                return <tr key={task.id}><td><strong>{employee?.name || 'Unassigned'}</strong></td><td>{employee?.phone || '-'}</td><td><span>{task.title}</span>{task.notes && <small>{task.notes}</small>}</td><td>{task.quantity}</td><td><CalendarDays size={14} /> {task.dueDate || '-'}</td><td><em className={`work-priority work-priority-${task.priority.toLowerCase()}`}>{task.priority}</em></td><td><select value={task.status} onChange={(event) => setTasks((current) => current.map((item) => item.id === task.id ? { ...item, status: event.target.value } : item))}><option>Pending</option><option>In Progress</option><option>Done</option></select></td><td><div className="work-row-actions"><button type="button" onClick={() => editTask(task)} title="Edit task"><Edit3 size={15} /></button><button type="button" onClick={() => removeTask(task.id)} title="Delete task"><Trash2 size={15} /></button></div></td></tr>;
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
